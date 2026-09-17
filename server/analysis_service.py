# -*- coding: utf-8 -*-
"""
========================================================================================
【服務名稱】：人行環境 WebGIS 後端空間分析伺服器 (Spatial Analysis Server)
【核心功能】：
    1. HTTP 靜態網頁託管 (提供 index.html, public 圖資, src 腳本)
    2. 核心 REST API - POST /api/analysis
       - 接收使用者前端框選之 Polygon (GeoJSON 格式)
       - 執行四大維度空間分析：
         (1) 人口：最小統計區面積比例分攤計算總人口與密度
         (2) 事故：近三年 (111-113) A1/A2 及死傷人數聚合
         (3) 人行環境：人行道長度、面積、平均淨寬、淨寬不足長度、破損、占用
         (4) 生活圈 POI：5 大類別統計與分佈
         (5) 綜合評分：依《人行道改善優先度 2.0》模型即時計分
========================================================================================
"""

import os
import sys
import json
import math

# Windows 本地 QGIS Python PROJ 資料庫與 GDAL DLL 相容設定
if os.path.exists(r"C:\Program Files\QGIS 4.2.2\bin"):
    os.environ["PATH"] = r"C:\Program Files\QGIS 4.2.2\bin;" + os.environ["PATH"]
    if hasattr(os, "add_dll_directory"):
        try:
            os.add_dll_directory(r"C:\Program Files\QGIS 4.2.2\bin")
        except Exception:
            pass

if "PROJ_DATA" not in os.environ and os.path.exists(r"C:\Program Files\QGIS 4.2.2\share\proj"):
    os.environ["PROJ_DATA"] = r"C:\Program Files\QGIS 4.2.2\share\proj"
    os.environ["PROJ_LIB"] = r"C:\Program Files\QGIS 4.2.2\share\proj"

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import io
import zipfile
import tempfile
import email
from email import policy
import geopandas as gpd
import pandas as pd
from shapely.geometry import shape, Point, Polygon, MultiPolygon
from shapely.ops import transform
import pyproj

# 引入本機認證與 SQLite 模組
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auth_db

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "public", "data")

# 記憶體快取：各縣市已載入圖資與空間索引
CACHE = {}

# 系統評鑑權重與門檻預設值 (支援維護者線上微調)
EVAL_CONFIG = {
    "weight_walk": 0.45,
    "weight_safety": 0.10,
    "weight_live": 0.45,
    "threshold_width": 1.5
}

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin888")

# ==============================================================================
# 【圖資規格標準與欄位規範定義表 (LAYER_SCHEMAS)】
# 定義 7 大圖資的幾何類型要求、核心必備欄位 (缺少則紅字警告且阻擋匯入) 與別名
# ==============================================================================
LAYER_SCHEMAS = {
    "sidewalk": {
        "name": "人行步道圖資",
        "target_file": "sidewalk.geojson",
        "geom_types": ["Polygon", "MultiPolygon", "LineString", "MultiLineString"],
        "required_fields": {
            "SWW_WTH": {"name": "人行道淨寬 (m)", "reason": "國土署 2.0 V2 核心幾何指標，計算淨寬不足長度與達標率", "aliases": ["sww_wth", "width", "net_width"]},
            "SW_AREA": {"name": "鋪面面積 (m²)", "reason": "幾何與鋪面損壞比率計算分母", "aliases": ["sw_area", "area"]},
            "SW_BRKRAT": {"name": "鋪面破損率 (%)", "reason": "人行道鋪面平整度狀況評分", "aliases": ["sw_brkrat", "break_ratio", "damage_rate"]},
            "SW_BK_B": {"name": "磚體鬆動B指標", "reason": "鋪面平整度扣分指標", "aliases": ["sw_bk_b", "flatness_b"]},
            "SW_BK_L": {"name": "磚體鬆動L指標", "reason": "鋪面平整度扣分指標", "aliases": ["sw_bk_l", "flatness_l"]}
        },
        "optional_fields": {
            "NAME": {"name": "路名/人行道名稱", "aliases": ["name", "road_name", "roadname"]},
            "I_SIDEWALK": {"name": "預計算人行道指標", "aliases": ["i_sidewalk"]}
        }
    },
    "accidents": {
        "name": "交通事故統計",
        "target_file": "accidents.geojson",
        "geom_types": ["Point", "MultiPoint"],
        "required_fields": {
            "ACC_TYPE": {"name": "事故型態 (A1/A2)", "reason": "行人死傷安全指數評定核心依據", "aliases": ["acc_type", "type", "severity"]},
            "YEAR": {"name": "事故年度", "reason": "篩選近三年事故統計", "aliases": ["year", "acc_year"]},
            "DEAD_CNT": {"name": "死亡人數", "reason": "A1 死亡事故扣分計量", "aliases": ["dead_cnt", "death_cnt", "killed"]},
            "INJ_CNT": {"name": "受傷人數", "reason": "A2 受傷事故扣分計量", "aliases": ["inj_cnt", "injury_cnt", "injured"]}
        },
        "optional_fields": {
            "LOCATION": {"name": "事故地點", "aliases": ["location", "address"]}
        }
    },
    "poi": {
        "name": "生活機能設施 POI",
        "target_file": "poi.geojson",
        "geom_types": ["Point", "MultiPoint"],
        "required_fields": {
            "POI_NAME": {"name": "設施名稱", "reason": "地標識別與彈窗顯示", "aliases": ["poi_name", "name", "facility_name"]},
            "TYPE": {"name": "設施主分類 (學校/醫療/交通等)", "reason": "生活圈機能 8 大類別加權計算依據", "aliases": ["type", "main_class", "category"]},
            "IS_SCOREABLE": {"name": "計入評分標記 (0/1)", "reason": "標記是否納入生活圈評分計算", "aliases": ["is_scoreable", "scoreable"]}
        },
        "optional_fields": {
            "SUB_CLASS": {"name": "設施次分類", "aliases": ["sub_class", "subcategory"]},
            "SOURCE": {"name": "資料來源", "aliases": ["source"]},
            "TOWNNAME": {"name": "所屬行政區", "aliases": ["townname", "town"]}
        }
    },
    "population_bsa": {
        "name": "最小統計區人口統計",
        "target_file": "population_bsa.geojson",
        "geom_types": ["Polygon", "MultiPolygon"],
        "required_fields": {
            "P_CNT": {"name": "常住人口數", "reason": "生活圈常住人口與密度計算", "aliases": ["p_cnt", "population", "pop"]},
            "H_CNT": {"name": "戶數", "reason": "統計區基本戶籍資料", "aliases": ["h_cnt", "households"]},
            "CODEBASE": {"name": "最小統計區代碼", "reason": "空間單元唯一碼", "aliases": ["codebase", "code2", "code"]}
        },
        "optional_fields": {
            "TOWN": {"name": "鄉鎮市區名", "aliases": ["town", "townname"]},
            "ORIG_AREA": {"name": "原始統計區面積", "aliases": ["orig_area", "area"]}
        }
    },
    "road_priority": {
        "name": "優先改善路段圖資",
        "target_file": "road_priority.geojson",
        "geom_types": ["LineString", "MultiLineString"],
        "required_fields": {
            "ROADNAME_F": {"name": "道路名稱", "reason": "道路路網查詢與辨識", "aliases": ["roadname_f", "road_name", "roadname", "name"]},
            "I_TOTAL": {"name": "綜合優先度分數", "reason": "改善優先順序排序與分級", "aliases": ["i_total", "priority", "score_total", "total_score"]}
        },
        "optional_fields": {
            "LENGTH": {"name": "道路長度 (m)", "aliases": ["length"]},
            "PRIORITY": {"name": "優先等級", "aliases": ["priority", "rank"]}
        }
    },
    "town_boundary": {
        "name": "行政區界線",
        "target_file": "town_boundary.geojson",
        "geom_types": ["Polygon", "MultiPolygon"],
        "required_fields": {
            "TOWNNAME": {"name": "行政區名", "reason": "區界標示與快速定位", "aliases": ["townname", "town", "name"]},
            "COUNTYNAME": {"name": "所屬縣市", "reason": "縣市歸屬過濾", "aliases": ["countyname", "county"]}
        },
        "optional_fields": {
            "TOWNCODE": {"name": "行政區代碼", "aliases": ["towncode", "code"]}
        }
    },
    "village_boundary": {
        "name": "村里界線",
        "target_file": "village_boundary.geojson",
        "geom_types": ["Polygon", "MultiPolygon"],
        "required_fields": {
            "VILLNAME": {"name": "村里名", "reason": "村里標示與里民定位", "aliases": ["villname", "village", "name"]},
            "TOWNNAME": {"name": "所屬行政區名", "reason": "所屬鄉鎮區域名稱", "aliases": ["townname", "town"]}
        },
        "optional_fields": {
            "COUNTYNAME": {"name": "所屬縣市", "aliases": ["countyname", "county"]},
            "VILLCODE": {"name": "村里代碼", "aliases": ["villcode", "code"]}
        }
    }
}

def _parse_multipart_form(headers, raw_body):
    """解析 multipart/form-data 表單傳輸，回傳 (fields_dict, files_dict)"""
    content_type = headers.get('Content-Type', '')
    if not content_type or 'multipart/form-data' not in content_type:
        return {}, {}
    msg_bytes = f"Content-Type: {content_type}\r\n\r\n".encode('utf-8') + raw_body
    msg = email.message_from_bytes(msg_bytes, policy=policy.default)
    fields = {}
    files = {}
    for part in msg.iter_parts():
        name = part.get_param('name', header='content-disposition')
        filename = part.get_filename()
        payload = part.get_payload(decode=True)
        if filename:
            files[name or 'file'] = {
                'filename': filename,
                'content': payload,
                'content_type': part.get_content_type()
            }
        elif name:
            try:
                fields[name] = payload.decode('utf-8')
            except Exception:
                fields[name] = str(payload)
    return fields, files

def _extract_gdf_from_upload(content_bytes, filename=""):
    """
    從上傳內容 (ZIP 包含 SHP, 或 GeoJSON) 讀取並自動轉換為 WGS84 EPSG:4326 之 GeoDataFrame
    """
    is_zip = (filename.lower().endswith('.zip') or content_bytes[:4] == b'PK\x03\x04')
    original_crs_desc = "未知"
    
    if is_zip:
        with tempfile.TemporaryDirectory() as tmpdir:
            with zipfile.ZipFile(io.BytesIO(content_bytes), 'r') as zf:
                zf.extractall(tmpdir)
            
            shp_files = []
            for root, _, f_list in os.walk(tmpdir):
                for f in f_list:
                    if f.lower().endswith('.shp'):
                        shp_files.append(os.path.join(root, f))
            
            if not shp_files:
                raise ValueError("ZIP 壓縮檔內找不到 .shp 檔案！請確認已包含成套 Shapefile (.shp, .shx, .dbf, .prj 等檔案)。")
            
            target_shp = shp_files[0]
            # 優先嘗試 UTF-8，若遇中文編碼問題則自動 fallback 至 Big5 (CP950)
            try:
                gdf = gpd.read_file(target_shp, encoding='utf-8')
            except Exception:
                gdf = gpd.read_file(target_shp, encoding='cp950')
    else:
        # GeoJSON 格式處理
        try:
            geojson_text = content_bytes.decode('utf-8')
        except UnicodeDecodeError:
            geojson_text = content_bytes.decode('cp950')
        
        data = json.loads(geojson_text)
        features = data.get('features', []) if isinstance(data, dict) else []
        if not features:
            raise ValueError("GeoJSON 格式錯誤或無任何圖徵 (features 為空)！")
        
        with tempfile.NamedTemporaryFile(suffix='.geojson', delete=False, mode='w', encoding='utf-8') as tf:
            json.dump(data, tf, ensure_ascii=False)
            tmp_path = tf.name
        try:
            gdf = gpd.read_file(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                try: os.remove(tmp_path)
                except Exception: pass

    # 坐標系統 (CRS) 自動識別與轉投影至標準 WGS84 EPSG:4326
    if gdf.crs is not None:
        try:
            epsg_code = gdf.crs.to_epsg()
            if epsg_code != 4326:
                gdf = gdf.to_crs(epsg=4326)
                original_crs_desc = f"EPSG:{epsg_code} (已自動轉投影為 WGS84 EPSG:4326)"
            else:
                original_crs_desc = "WGS84 (EPSG:4326)"
        except Exception:
            gdf = gdf.to_crs(epsg=4326)
            original_crs_desc = f"{str(gdf.crs)} (已自動轉投影為 WGS84 EPSG:4326)"
    else:
        # 無明確投影宣告時：檢查幾何數值範圍自動推論
        total_bounds = gdf.total_bounds
        if len(total_bounds) == 4:
            minx, miny, maxx, maxy = total_bounds
            if minx > 50000 and miny > 100000:
                # 典型台灣 TWD97 二度分帶 (X: 150000~350000, Y: 2400000~2800000)
                gdf.set_crs(epsg=3826, inplace=True)
                gdf = gdf.to_crs(epsg=4326)
                original_crs_desc = "未明確宣告投影 (偵測為台灣 TWD97 EPSG:3826，已自動轉換為 WGS84)"
            elif 118.0 <= minx <= 124.0 and 21.0 <= miny <= 27.0:
                gdf.set_crs(epsg=4326, inplace=True)
                original_crs_desc = "未明確宣告投影 (數值落於台灣經緯度，已指派為 WGS84)"
            else:
                original_crs_desc = "未宣告投影且範圍異常"

    # 防呆校正：點圖層經緯度反轉偵測 (例如 lat ~ 22, lon ~ 120 誤植顛倒)
    if len(gdf) > 0 and gdf.geometry.geom_type.iloc[0] in ['Point', 'MultiPoint']:
        sample_x = gdf.geometry.x.median()
        sample_y = gdf.geometry.y.median()
        if 20.0 <= sample_x <= 26.0 and 119.0 <= sample_y <= 123.0:
            gdf['geometry'] = gdf.geometry.apply(lambda p: Point(p.y, p.x) if p and not p.is_empty else p)

    return gdf, original_crs_desc

def _inspect_layer_gdf(gdf, layer_key):
    """檢驗圖資幾何類型、坐標範圍與核心必要欄位規格，回傳診斷結果"""
    schema = LAYER_SCHEMAS.get(layer_key)
    if not schema:
        return {"valid": False, "errors": [f"不支援的圖資分類代碼: {layer_key}"]}
    
    feature_count = len(gdf)
    if feature_count == 0:
        return {"valid": False, "errors": ["圖資中無任何空間圖徵 (圖徵數量為 0)"]}
    
    geom_types_in_data = list(set(gdf.geometry.geom_type.dropna().unique()))
    expected_geom = schema["geom_types"]
    geom_matched = any(t in expected_geom for t in geom_types_in_data)
    
    errors = []
    warnings = []
    
    if not geom_matched:
        errors.append(f"幾何類型不相符：此圖資分類要求為【{' / '.join(expected_geom)}】，但上傳檔案為【{' / '.join(geom_types_in_data)}】")
        
    total_bounds = gdf.total_bounds
    if len(total_bounds) == 4:
        minx, miny, maxx, maxy = total_bounds
        if not (118.0 <= minx <= 124.0 and 21.0 <= miny <= 27.0):
            warnings.append(f"圖資邊界 [{minx:.3f}, {miny:.3f}, {maxx:.3f}, {maxy:.3f}] 略超出台灣本島標準經緯度範圍 (119~123°E, 21~26°N)，請確認原始坐標投影。")
            
    col_map = {str(c).strip().upper(): c for c in gdf.columns}
    missing_required = []
    matched_required = []
    
    for req_col, info in schema["required_fields"].items():
        found = None
        if req_col.upper() in col_map:
            found = col_map[req_col.upper()]
        else:
            for alias in info.get("aliases", []):
                if alias.upper() in col_map:
                    found = col_map[alias.upper()]
                    break
        if found:
            matched_required.append({"field": req_col, "source_col": found, "name": info["name"]})
        else:
            missing_required.append({"field": req_col, "name": info["name"], "reason": info["reason"]})
            errors.append(f"缺少必要核心屬性欄位：【{req_col}】({info['name']}) - 用途：{info['reason']}")
            
    matched_optional = []
    missing_optional = []
    for opt_col, info in schema.get("optional_fields", {}).items():
        found = None
        if opt_col.upper() in col_map:
            found = col_map[opt_col.upper()]
        else:
            for alias in info.get("aliases", []):
                if alias.upper() in col_map:
                    found = col_map[alias.upper()]
                    break
        if found:
            matched_optional.append({"field": opt_col, "source_col": found, "name": info["name"]})
        else:
            missing_optional.append({"field": opt_col, "name": info["name"]})
            
    valid = (len(errors) == 0)
    
    guidance = ""
    if not valid:
        missing_labels = [f"【{m['field']}】({m['name']})" for m in missing_required]
        guidance = (
            f"建議修正方式：請於 QGIS 或 ArcGIS 中開啟該圖層的「屬性工作表 (Attribute Table)」，"
            f"確認是否具備下列欄位：{', '.join(missing_labels)}。"
            f"若原始欄位名稱不同，可使用「欄位計算器 (Field Calculator)」或重命名工具調整為規範名稱後重新打包 ZIP 上傳。"
        )
        
    return {
        "valid": valid,
        "layer_key": layer_key,
        "layer_name": schema["name"],
        "target_file": schema["target_file"],
        "feature_count": feature_count,
        "detected_geom_type": geom_types_in_data,
        "expected_geom_type": expected_geom,
        "bounds": [round(b, 4) for b in total_bounds],
        "missing_required": missing_required,
        "matched_required": matched_required,
        "matched_optional": matched_optional,
        "missing_optional": missing_optional,
        "errors": errors,
        "warnings": warnings,
        "guidance": guidance
    }

from shapely import force_2d

# 坐標轉換器 (WGS84 -> TWD97 投影座標系 EPSG:3826，用於精確公尺/公頃/平方公里計算)
_transformer = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:3826", always_xy=True)

def to_twd97(geom):
    if geom is None or geom.is_empty:
        return geom
    return transform(_transformer.transform, force_2d(geom))

def load_county_data(county="kaohsiung"):
    if county in CACHE:
        return CACHE[county]
        
    county_dir = os.path.join(DATA_DIR, county)
    print(f"[*] 正在快取【{county}】圖資與空間索引...")
    
    data = {}
    
    # 1. 道路圖資：依整條道路匯總 (展示與點選 Popup) 及 依細部切割路段 (框選空間分析)
    rp_path = os.path.join(county_dir, "road_priority.geojson")
    if os.path.exists(rp_path):
        data['road_priority'] = gpd.read_file(rp_path)

    r_seg_path = os.path.join(county_dir, "road_segments.geojson")
    if os.path.exists(r_seg_path):
        data['road_segments'] = gpd.read_file(r_seg_path)
    
    # 2. 人行道 (若只有 .gz 壓縮檔則自動解壓縮以符合 GitHub <100MB 規範)
    sw_path = os.path.join(county_dir, "sidewalk.geojson")
    gz_path = os.path.join(county_dir, "sidewalk.geojson.gz")
    if not os.path.exists(sw_path) and os.path.exists(gz_path):
        print("[*] 偵測到 sidewalk.geojson.gz，正在解壓縮供服務使用...")
        import gzip, shutil
        with gzip.open(gz_path, 'rb') as f_in, open(sw_path, 'wb') as f_out:
            shutil.copyfileobj(f_in, f_out)
        print("[OK] 人行道圖資解壓縮完成！")

    if os.path.exists(sw_path):
        gdf = gpd.read_file(sw_path)
        data['sidewalk'] = gdf
        
    # 3. 事故點
    acc_path = os.path.join(county_dir, "accidents.geojson")
    if os.path.exists(acc_path):
        gdf = gpd.read_file(acc_path)
        data['accidents'] = gdf
        
    # 4. POI
    poi_path = os.path.join(county_dir, "poi.geojson")
    if os.path.exists(poi_path):
        gdf = gpd.read_file(poi_path)
        data['poi'] = gdf
        
    # 5. 最小統計區
    pop_path = os.path.join(county_dir, "population_bsa.geojson")
    if os.path.exists(pop_path):
        gdf = gpd.read_file(pop_path)
        data['population_bsa'] = gdf
        
    CACHE[county] = data
    print(f"[OK] 【{county}】圖資快取完成！")
    return data

def perform_spatial_analysis(county, polygon_geom_wgs84):
    """
    執行空間相交與多指標聚合分析
    """
    data = load_county_data(county)
    
    # 坐標結構防呆相容 (支援 GeoJSON Geometry 物件，亦相容二維/三維座標陣列)
    if isinstance(polygon_geom_wgs84, list):
        if len(polygon_geom_wgs84) > 0 and isinstance(polygon_geom_wgs84[0], list):
            if len(polygon_geom_wgs84[0]) > 0 and isinstance(polygon_geom_wgs84[0][0], (int, float)):
                # 二維 [[x,y], [x,y], ...] -> 包裝為 Polygon
                polygon_geom_wgs84 = {"type": "Polygon", "coordinates": [polygon_geom_wgs84]}
            elif len(polygon_geom_wgs84[0]) > 0 and isinstance(polygon_geom_wgs84[0][0], list):
                # 三維 [[[x,y], [x,y], ...]]
                polygon_geom_wgs84 = {"type": "Polygon", "coordinates": polygon_geom_wgs84}
    elif isinstance(polygon_geom_wgs84, dict) and "coordinates" in polygon_geom_wgs84:
        coords = polygon_geom_wgs84["coordinates"]
        if isinstance(coords, list) and len(coords) > 0:
            if isinstance(coords[0], list) and len(coords[0]) > 0 and isinstance(coords[0][0], (int, float)):
                # 二維 [[x,y], [x,y]] -> 自動包裝為三維 [[[x,y], [x,y]]]
                polygon_geom_wgs84 = {"type": "Polygon", "coordinates": [coords]}
                
    poly_wgs84 = shape(polygon_geom_wgs84)
    poly_twd97 = to_twd97(poly_wgs84)
    box_area_m2 = poly_twd97.area
    box_area_km2 = box_area_m2 / 1_000_000.0
    
    # -------------------------------------------------------------
    # 0. 前置道路與人行道檢核：範圍內無道路與人行道資料，則不予分析
    # -------------------------------------------------------------
    has_road_or_sidewalk = False
    
    # 檢查 12公尺以上道路路網 (優先採用細部切割路段)
    road_gdf = data.get('road_segments') if 'road_segments' in data else data.get('road_priority')
    if road_gdf is not None:
        possible_idx = list(road_gdf.sindex.intersection(poly_wgs84.bounds))
        if possible_idx:
            possible_matches = road_gdf.iloc[possible_idx]
            if not possible_matches[possible_matches.intersects(poly_wgs84)].empty:
                has_road_or_sidewalk = True
                
    # 檢查實體人行道圖資
    if not has_road_or_sidewalk and 'sidewalk' in data:
        sw_gdf = data['sidewalk']
        possible_idx = list(sw_gdf.sindex.intersection(poly_wgs84.bounds))
        if possible_idx:
            possible_matches = sw_gdf.iloc[possible_idx]
            if not possible_matches[possible_matches.intersects(poly_wgs84)].empty:
                has_road_or_sidewalk = True
                
    if not has_road_or_sidewalk:
        return {
            "valid": False,
            "has_roads": False,
            "error": "範圍內無道路與人行道資料，不予分析",
            "message": "範圍內無道路與人行道資料，不予分析"
        }

    result = {
        "box_area_m2": round(box_area_m2, 1),
        "box_area_km2": round(box_area_km2, 4),
        "population": {},
        "accidents": {},
        "sidewalk": {},
        "poi": {},
        "score": {},
        "valid": True,
        "has_roads": True
    }
    
    # -------------------------------------------------------------
    # 1. 人口分析 (最小統計區面積比例分攤法)
    # -------------------------------------------------------------
    if 'population_bsa' in data:
        pop_gdf = data['population_bsa']
        # 使用空間索引快速初篩
        possible_idx = list(pop_gdf.sindex.intersection(poly_wgs84.bounds))
        possible_matches = pop_gdf.iloc[possible_idx]
        actual_matches = possible_matches[possible_matches.intersects(poly_wgs84)]
        
        total_pop = 0.0
        total_households = 0.0
        
        for _, row in actual_matches.iterrows():
            geom = row.geometry
            p_cnt = float(row.get('P_CNT', 0))
            h_cnt = float(row.get('H_CNT', 0))
            orig_area = float(row.get('ORIG_AREA', 0))
            
            # 計算交集面積比例
            inter = geom.intersection(poly_wgs84)
            if not inter.is_empty:
                inter_twd97 = to_twd97(inter)
                inter_area = inter_twd97.area
                ratio = (inter_area / orig_area) if orig_area > 0 else 1.0
                ratio = min(1.0, max(0.0, ratio))
                total_pop += p_cnt * ratio
                total_households += h_cnt * ratio
                
        density = (total_pop / box_area_km2) if box_area_km2 > 0 else 0
        result["population"] = {
            "total_population": int(round(total_pop)),
            "density_per_km2": int(round(density)),
            "total_households": int(round(total_households)),
            "bsa_count": len(actual_matches)
        }
    
    # -------------------------------------------------------------
    # 2. 交通事故分析 (近三年 111-113 統計)
    # -------------------------------------------------------------
    if 'accidents' in data:
        acc_gdf = data['accidents']
        possible_idx = list(acc_gdf.sindex.intersection(poly_wgs84.bounds))
        possible_matches = acc_gdf.iloc[possible_idx]
        in_acc = possible_matches[possible_matches.intersects(poly_wgs84)]
        
        years_stat = {111: {"total": 0, "a1": 0, "a2": 0, "dead": 0, "injured": 0},
                      112: {"total": 0, "a1": 0, "a2": 0, "dead": 0, "injured": 0},
                      113: {"total": 0, "a1": 0, "a2": 0, "dead": 0, "injured": 0}}
        
        for _, row in in_acc.iterrows():
            y = int(row.get('YEAR', 112))
            if y not in years_stat:
                years_stat[y] = {"total": 0, "a1": 0, "a2": 0, "dead": 0, "injured": 0}
            t = str(row.get('ACC_TYPE', 'A2')).upper()
            d = int(row.get('DEAD_CNT', 0))
            inj = int(row.get('INJ_CNT', 0))
            
            years_stat[y]["total"] += 1
            if t == 'A1':
                years_stat[y]["a1"] += 1
            else:
                years_stat[y]["a2"] += 1
            years_stat[y]["dead"] += d
            years_stat[y]["injured"] += inj
            
        tot_cnt = len(in_acc)
        tot_a1 = sum(v["a1"] for v in years_stat.values())
        tot_a2 = sum(v["a2"] for v in years_stat.values())
        tot_dead = sum(v["dead"] for v in years_stat.values())
        tot_inj = sum(v["injured"] for v in years_stat.values())
        
        acc_geojson = json.loads(in_acc.to_json()) if len(in_acc) > 0 else {"type": "FeatureCollection", "features": []}
        result["accidents"] = {
            "total_count": tot_cnt,
            "total_a1": tot_a1,
            "total_a2": tot_a2,
            "total_dead": tot_dead,
            "total_injured": tot_inj,
            "by_year": years_stat,
            "geojson": acc_geojson
        }
    
    # -------------------------------------------------------------
    # 3. 人行環境分析 (長度、有效淨寬、淨寬不足路段、破損、占用)
    # -------------------------------------------------------------
    if 'sidewalk' in data:
        sw_gdf = data['sidewalk']
        possible_idx = list(sw_gdf.sindex.intersection(poly_wgs84.bounds))
        possible_matches = sw_gdf.iloc[possible_idx]
        in_sw = possible_matches[possible_matches.intersects(poly_wgs84)]
        
        tot_length = 0.0
        tot_area = 0.0
        insufficient_length = 0.0 # 淨寬 < 1.5m
        broken_points = 0
        obstacle_points = 0
        widths = []
        
        for _, row in in_sw.iterrows():
            geom = row.geometry
            inter = geom.intersection(poly_wgs84)
            if not inter.is_empty:
                inter_twd97 = to_twd97(inter)
                # 若為線要素取長度，若為面要素取周長半數或長度
                seg_len = inter_twd97.length if inter_twd97.geom_type in ['LineString', 'MultiLineString'] else (inter_twd97.length / 2)
                tot_length += seg_len
                
                w = float(row.get('SWW_WTH', 0))
                if w > 0:
                    widths.append(w)
                if w < EVAL_CONFIG.get("threshold_width", 1.5):
                    insufficient_length += seg_len
                    
                tot_area += float(row.get('SW_AREA', 0))
                brk = float(row.get('SW_BRKRAT', 0))
                if brk > 0:
                    broken_points += 1
                bkb = float(row.get('SW_BK_B', 0))
                bkl = float(row.get('SW_BK_L', 0))
                if (bkb + bkl) > 0:
                    obstacle_points += int(bkb + bkl)
                    
        avg_width = (sum(widths) / len(widths)) if widths else 0.0
        result["sidewalk"] = {
            "total_length_m": round(tot_length, 1),
            "total_area_m2": round(tot_area, 1),
            "avg_effective_width_m": round(avg_width, 2),
            "insufficient_width_m": round(insufficient_length, 1),
            "broken_count": broken_points,
            "obstacle_count": obstacle_points,
            "segment_count": len(in_sw)
        }
    elif 'road_priority' in data:
        # 降級使用道路線段概估
        rp_gdf = data['road_priority']
        possible_idx = list(rp_gdf.sindex.intersection(poly_wgs84.bounds))
        possible_matches = rp_gdf.iloc[possible_idx]
        in_rp = possible_matches[possible_matches.intersects(poly_wgs84)]
        result["sidewalk"] = {
            "total_length_m": round(float(in_rp['LENGTH'].sum()) if len(in_rp) else 0, 1),
            "total_area_m2": 0,
            "avg_effective_width_m": round(float(in_rp['AVG_SW_W'].mean()) if len(in_rp) else 0, 2),
            "insufficient_width_m": 0,
            "broken_count": 0,
            "obstacle_count": 0,
            "segment_count": len(in_rp)
        }
        
    # -------------------------------------------------------------
    # 4. POI 設施分析 (臺灣通用電子地圖七大分類標準)
    # -------------------------------------------------------------
    categories = {
        "生活機能機構及設施": 0,
        "公共及休閒場所": 0,
        "交通運輸設施": 0,
        "文教機關及場所": 0,
        "醫療保健及社福機構": 0,
        "政府機關及機構": 0,
        "其他地標": 0
    }
    scoreable_poi_cnt = 0
    rare_poi_cnt = 0
    top_pois = []
    
    if 'poi' in data:
        poi_gdf = data['poi']
        possible_idx = list(poi_gdf.sindex.intersection(poly_wgs84.bounds))
        possible_matches = poi_gdf.iloc[possible_idx]
        in_poi = possible_matches[possible_matches.intersects(poly_wgs84)]
        
        for _, row in in_poi.iterrows():
            t = str(row.get('TYPE', '其他地標')).strip()
            name = str(row.get('POI_NAME', '未命名設施'))
            sub = str(row.get('SUB_CLASS', ''))
            src = str(row.get('SOURCE', '通用版電子地圖'))
            town = str(row.get('TOWNNAME', ''))
            is_sc = int(row.get('IS_SCOREABLE', 1))
            
            if is_sc == 1:
                scoreable_poi_cnt += 1
            else:
                rare_poi_cnt += 1
            
            if t in categories:
                categories[t] += 1
            else:
                categories["其他地標"] += 1
                
            if len(top_pois) < 20:
                top_pois.append({"name": name, "type": t, "sub": sub, "source": src, "town": town, "is_scoreable": is_sc})
                
        poi_geojson = json.loads(in_poi.to_json()) if len(in_poi) > 0 else {"type": "FeatureCollection", "features": []}
        result["poi"] = {
            "total_count": len(in_poi),
            "scoreable_count": scoreable_poi_cnt,
            "rare_count": rare_poi_cnt,
            "categories": categories,
            "sample_pois": top_pois,
            "geojson": poi_geojson
        }

    # -------------------------------------------------------------
    # 5. 人本交通環境分數評估 (依《人行道改善優先度評估 2.0 正面評估版 V2》)
    # TOTAL_SC = 0.45 * S_WALK + 0.10 * S_SAFETY + 0.45 * I_LIVE
    # 分數越高代表步行環境優良度越高 (0 ~ 100 分)
    # -------------------------------------------------------------
    sw_len = result["sidewalk"].get("total_length_m", 0.0)
    total_clipped_len = 0.0
    road_contributions = []
    
    # 空間框選計算：優先採用【依細部切割路段 (road_segments)】，確保局部小範圍評分最精準公正
    calc_road_gdf = data.get('road_segments') if 'road_segments' in data else data.get('road_priority')
    if calc_road_gdf is not None:
        possible_idx = list(calc_road_gdf.sindex.intersection(poly_wgs84.bounds))
        possible_matches = calc_road_gdf.iloc[possible_idx]
        in_rp = possible_matches[possible_matches.intersects(poly_wgs84)]
        
        for _, r_row in in_rp.iterrows():
            r_geom = r_row.geometry
            r_inter = r_geom.intersection(poly_wgs84)
            if not r_inter.is_empty:
                r_twd97 = to_twd97(r_inter)
                c_len = r_twd97.length
                raw_s = float(r_row.get('I_SIDEWALK', 50.0))
                # 細部路段圖資已直接具備正面品質評分 (0~100 分)
                pos_walk = max(0.0, min(100.0, raw_s))
                road_contributions.append((c_len, pos_walk))
                total_clipped_len += c_len

    # 事故與設施統計
    tot_a1 = result["accidents"].get("total_a1", 0)
    tot_a2 = result["accidents"].get("total_a2", 0)
    tot_acc = result["accidents"].get("total_count", 0)

    # 核心防呆檢核：判定是否為「非人行評估範圍 / 水域或無設施未開闢區」
    # 判定準則：所選區域無 12m 優先道路、無實體人行道、無生活機能 POI、且無交通事故紀錄
    is_non_walkable_zone = (total_clipped_len == 0 and sw_len == 0 and scoreable_poi_cnt == 0 and tot_acc == 0)

    if is_non_walkable_zone:
        # 完全無人行設施與活動（如湖泊水域、河川行水區或山林未開發地），不予核發基礎分數
        result["score"] = {
            "total_score": 0.0,
            "s_walk": 0.0,
            "s_safety": 0.0,
            "i_live": 0.0,
            "env_level": "不適用 (非人行評估範圍)",
            "is_evaluable": False,
            "unscoreable_reason": "範圍內查無道路路網、實體人行道及生活機能設施（如湖面水域或未開闢荒地），不具備人行通行評鑑條件，不予核發基礎分數。",
            "total_road_length_m": 0.0
        }
        return result

    # (1) 步行環境分數 S_WALK (45%):
    if total_clipped_len > 0:
        weighted_walk_score = sum((c_len / total_clipped_len) * score for c_len, score in road_contributions)
    elif sw_len > 0:
        # 無 12m 道路但有實體人行道 (依人行道覆蓋率與淨寬合格率計算)
        cov_rate = min(1.0, sw_len / (box_area_m2 / 150.0)) if box_area_m2 > 0 else 0.5
        insuf_len = result["sidewalk"].get("insufficient_width_m", 0)
        insuf_ratio = (insuf_len / sw_len) if sw_len > 0 else 0.0
        weighted_walk_score = round(20.0 + (30.0 * cov_rate) + (50.0 * (1.0 - insuf_ratio)), 1)
    elif scoreable_poi_cnt > 0 or tot_acc > 0:
        # 市區巷道但無實體人行道 (車行混合環境，反映欠缺人行道現況)
        weighted_walk_score = 15.0
    else:
        weighted_walk_score = 0.0

    # (2) 交通安全指數 S_SAFETY (10%): 依《正面評估版 V2》官方規定，A1 扣 10 分、A2 扣 5 分
    acc_penalty = (tot_a1 * 10.0) + (tot_a2 * 5.0)
    s_safety = max(0.0, min(100.0, 100.0 - acc_penalty))
    
    # (3) 生活機能綜合指標 I_LIVE (45%): 依正面評估版 V2 規定，0.20 * 服務人口 + 0.80 * POI
    density = result["population"].get("density_per_km2", 0)
    pop_score = min(100.0, (density / 12000.0) * 100.0)
    poi_score = min(100.0, (scoreable_poi_cnt / 40.0) * 100.0)
    i_live = round(0.20 * pop_score + 0.80 * poi_score, 1)
    
    # (4) 人本步行環境評估總分 (滿分100，越高越優良，支援管理員動態調權)
    w_walk = EVAL_CONFIG.get("weight_walk", 0.45)
    w_safe = EVAL_CONFIG.get("weight_safety", 0.10)
    w_live = EVAL_CONFIG.get("weight_live", 0.45)
    total_score = round(w_walk * weighted_walk_score + w_safe * s_safety + w_live * i_live, 1)
    
    # 正面評估五級分級制 (A~E)
    if total_score >= 80:
        env_level = "A級 (優良步行環境)"
    elif total_score >= 65:
        env_level = "B級 (良好通行環境)"
    elif total_score >= 50:
        env_level = "C級 (普通環境，局部缺口)"
    elif total_score >= 35:
        env_level = "D級 (待改善環境)"
    else:
        env_level = "E級 (亟待大幅改善)"
        
    result["score"] = {
        "total_score": total_score,
        "s_walk": round(weighted_walk_score, 1),
        "s_safety": round(s_safety, 1),
        "i_live": round(i_live, 1),
        "env_level": env_level,
        "is_evaluable": True,
        "total_road_length_m": round(total_clipped_len, 1)
    }
    
    return result

class WebGISRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def _get_auth_session(self):
        auth_header = self.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:].strip()
            return auth_db.verify_session(token)
        return None

    def _get_client_ip(self):
        forwarded = self.headers.get('X-Forwarded-For')
        if forwarded:
            return forwarded.split(',')[0].strip()
        return self.client_address[0] if self.client_address else "127.0.0.1"

    def do_GET(self):
        if self.path == '/api/counties':
            counties = [d for d in os.listdir(DATA_DIR) if os.path.isdir(os.path.join(DATA_DIR, d))]
            self._send_json({"counties": counties, "current": "kaohsiung"})
            return
        elif self.path == '/api/status':
            self._send_json({"status": "ready", "cached_counties": list(CACHE.keys())})
            return
        elif self.path == '/api/admin/me':
            session = self._get_auth_session()
            if not session:
                self._send_json({"error": "未授權或登入已過期"}, status=401)
                return
            self._send_json({"user": session})
            return
        elif self.path == '/api/admin/status':
            county_data = CACHE.get("kaohsiung", {})
            layer_stats = {}
            for k, v in county_data.items():
                if hasattr(v, '__len__'):
                    layer_stats[k] = len(v)
            self._send_json({
                "status": "online",
                "weights": EVAL_CONFIG,
                "layer_stats": layer_stats,
                "cached_counties": list(CACHE.keys())
            })
            return
        elif self.path == '/api/admin/users':
            session = self._get_auth_session()
            if not session:
                self._send_json({"error": "未授權存取"}, status=401)
                return
            if session['role'] != 'superadmin':
                self._send_json({"error": "權限不足：僅超級管理員可管理帳號"}, status=403)
                return
            users = auth_db.list_users()
            self._send_json({"users": users})
            return
        elif self.path == '/api/admin/audit_logs':
            session = self._get_auth_session()
            if not session:
                self._send_json({"error": "未授權存取"}, status=401)
                return
            if session['role'] != 'superadmin':
                self._send_json({"error": "權限不足：僅超級管理員可查閱稽核日誌"}, status=403)
                return
            logs = auth_db.get_audit_logs(limit=50)
            self._send_json({"logs": logs})
            return

        # 靜態 GeoJSON 圖資透明 Gzip 壓縮串流支援 (大幅縮短傳輸時間、節省 70% 頻寬並提供長效快取)
        clean_path = self.path.split('?')[0]
        if clean_path.endswith('.geojson') and 'gzip' in self.headers.get('Accept-Encoding', ''):
            rel_path = clean_path.lstrip('/')
            local_gz_path = os.path.join(BASE_DIR, rel_path + '.gz')
            if os.path.exists(local_gz_path) and os.path.isfile(local_gz_path):
                try:
                    gz_size = os.path.getsize(local_gz_path)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Content-Encoding", "gzip")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Cache-Control", "public, max-age=604800, immutable")
                    self.send_header("Content-Length", str(gz_size))
                    self.end_headers()
                    with open(local_gz_path, 'rb') as f:
                        import shutil
                        shutil.copyfileobj(f, self.wfile)
                    return
                except Exception as e:
                    print(f"[!] 串流 gzip 圖資失敗: {e}")

        return super().do_GET()

    def end_headers(self):
        # 為靜態圖資、腳本、樣式表加上瀏覽器長效快取 (7天)，避免重複造訪消耗流量
        clean = self.path.split('?')[0]
        if clean.endswith(('.geojson', '.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.woff2', '.json')):
            self.send_header("Cache-Control", "public, max-age=604800, immutable")
        elif clean == '/' or clean.endswith('.html'):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        raw_body = self.rfile.read(content_length) if content_length > 0 else b""
        content_type = self.headers.get('Content-Type', '')
        body = "{}"
        if 'application/json' in content_type:
            try:
                body = raw_body.decode('utf-8')
            except Exception:
                body = raw_body.decode('utf-8', errors='ignore')
        elif not content_type or 'text' in content_type:
            try:
                body = raw_body.decode('utf-8')
            except Exception:
                body = "{}"
        ip = self._get_client_ip()

        if self.path == '/api/analysis':
            try:
                req = json.loads(body)
                county = req.get('county', 'kaohsiung')
                polygon = req.get('polygon')
                if not polygon:
                    self._send_json({"error": "Missing polygon geometry"}, status=400)
                    return
                analysis_res = perform_spatial_analysis(county, polygon)
                if not analysis_res.get("valid", True):
                    self._send_json(analysis_res, status=400)
                    return
                self._send_json(analysis_res)
            except Exception as e:
                import traceback
                traceback.print_exc()
                self._send_json({"error": str(e)}, status=500)
            return

        elif self.path == '/api/admin/login':
            try:
                req = json.loads(body)
                username = req.get('username', '').strip()
                password = req.get('password', '').strip()
                if not username or not password:
                    self._send_json({"success": False, "error": "請輸入帳號與密碼"}, status=400)
                    return

                user = auth_db.authenticate(username, password)
                if user:
                    token = auth_db.create_session(user['id'], user['username'], user['role'])
                    auth_db.add_audit_log(user['username'], "login", f"登入系統成功 ({user['name']})", ip)
                    self._send_json({
                        "success": True,
                        "token": token,
                        "user": user
                    })
                else:
                    auth_db.add_audit_log(username, "login_fail", f"登入失敗：密碼錯誤", ip)
                    self._send_json({"success": False, "error": "帳號或密碼錯誤，請重新確認！"}, status=401)
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
            return

        elif self.path == '/api/admin/logout':
            auth_header = self.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token = auth_header[7:].strip()
                session = auth_db.verify_session(token)
                if session:
                    auth_db.add_audit_log(session['username'], "logout", "使用者登出", ip)
                auth_db.delete_session(token)
            self._send_json({"success": True})
            return

        elif self.path == '/api/admin/users':
            session = self._get_auth_session()
            if not session:
                self._send_json({"error": "請先登入系統"}, status=401)
                return
            if session['role'] != 'superadmin':
                self._send_json({"error": "權限不足：僅超級管理員可新增使用者"}, status=403)
                return

            try:
                req = json.loads(body)
                u = req.get('username', '').strip()
                p = req.get('password', '').strip()
                n = req.get('name', '').strip()
                r = req.get('role', 'maintainer').strip()
                ok, msg = auth_db.create_user(u, p, n, r)
                if ok:
                    auth_db.add_audit_log(session['username'], "create_user", f"建立帳號 {u} ({n}, {r})", ip)
                    self._send_json({"success": True, "message": msg})
                else:
                    self._send_json({"success": False, "error": msg}, status=400)
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
            return

        elif self.path == '/api/admin/delete_user':
            session = self._get_auth_session()
            if not session:
                self._send_json({"error": "請先登入系統"}, status=401)
                return
            if session['role'] != 'superadmin':
                self._send_json({"error": "權限不足：僅超級管理員可刪除使用者"}, status=403)
                return

            try:
                req = json.loads(body)
                target_id = req.get('user_id')
                ok, msg = auth_db.delete_user(target_id)
                if ok:
                    auth_db.add_audit_log(session['username'], "delete_user", f"刪除使用者 ID={target_id}", ip)
                    self._send_json({"success": True, "message": msg})
                else:
                    self._send_json({"success": False, "error": msg}, status=400)
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
            return

        elif self.path == '/api/admin/change_password':
            session = self._get_auth_session()
            if not session:
                self._send_json({"error": "請先登入系統"}, status=401)
                return

            try:
                req = json.loads(body)
                new_pwd = req.get('new_password', '').strip()
                target_user_id = req.get('user_id')
                # 只有超級管理員能更改他人密碼，一般成員只能改自己密碼
                if target_user_id and session['role'] == 'superadmin':
                    uid = target_user_id
                else:
                    uid = session['user_id']

                ok, msg = auth_db.change_password(uid, new_pwd)
                if ok:
                    auth_db.add_audit_log(session['username'], "change_password", f"變更密碼 (User ID={uid})", ip)
                    self._send_json({"success": True, "message": msg})
                else:
                    self._send_json({"success": False, "error": msg}, status=400)
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
            return

        elif self.path == '/api/admin/reload_cache':
            session = self._get_auth_session()
            if not session:
                self._send_json({"error": "未授權存取：請先登入管理者帳號"}, status=401)
                return
            try:
                county = "kaohsiung"
                if county in CACHE:
                    del CACHE[county]
                load_county_data(county)
                auth_db.add_audit_log(session['username'], "reload_cache", f"重新加載 {county} 圖資快取與空間索引", ip)
                self._send_json({"success": True, "message": "圖資快取已重新預熱完成"})
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
            return

        elif self.path == '/api/admin/update_weights':
            session = self._get_auth_session()
            if not session:
                self._send_json({"error": "未授權存取：請先登入管理者帳號"}, status=401)
                return
            try:
                req = json.loads(body)
                for k in ["weight_walk", "weight_safety", "weight_live", "threshold_width"]:
                    if k in req:
                        EVAL_CONFIG[k] = float(req[k])
                auth_db.add_audit_log(session['username'], "update_weights", f"調整評鑑權重: 步行={EVAL_CONFIG['weight_walk']}, 安全={EVAL_CONFIG['weight_safety']}, 機能={EVAL_CONFIG['weight_live']}, 淨寬={EVAL_CONFIG['threshold_width']}m", ip)
                self._send_json({"success": True, "weights": EVAL_CONFIG})
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
            return

        elif self.path == '/api/admin/validate_layer':
            session = self._get_auth_session()
            if not session:
                self._send_json({"error": "未授權存取：請先登入管理者帳號"}, status=401)
                return
            try:
                content_type = self.headers.get('Content-Type', '')
                if 'multipart/form-data' in content_type:
                    fields, files = _parse_multipart_form(self.headers, raw_body)
                    layer_key = fields.get('layer_key', '')
                    file_info = files.get('file')
                    if not file_info:
                        self._send_json({"error": "未接收到任何上傳檔案"}, status=400)
                        return
                    filename = file_info['filename']
                    content_bytes = file_info['content']
                else:
                    req = json.loads(body)
                    layer_key = req.get('layer_key', '')
                    filename = req.get('filename', 'layer.geojson')
                    if 'geojson' in req:
                        content_bytes = json.dumps(req['geojson']).encode('utf-8')
                    elif 'file_base64' in req:
                        import base64
                        content_bytes = base64.b64decode(req['file_base64'])
                    else:
                        self._send_json({"error": "缺少圖資內容"}, status=400)
                        return
                
                if not layer_key or layer_key not in LAYER_SCHEMAS:
                    self._send_json({"error": f"不支援的圖資分類代碼: {layer_key}"}, status=400)
                    return
                
                gdf, crs_desc = _extract_gdf_from_upload(content_bytes, filename)
                res = _inspect_layer_gdf(gdf, layer_key)
                res['original_crs'] = crs_desc
                res['filename'] = filename
                self._send_json(res)
            except Exception as e:
                import traceback
                traceback.print_exc()
                self._send_json({"valid": False, "errors": [f"檔案解析或檢驗失敗: {str(e)}"], "error": str(e)}, status=400)
            return

        elif self.path == '/api/admin/upload_layer':
            session = self._get_auth_session()
            if not session:
                self._send_json({"error": "未授權存取：請先登入管理者帳號"}, status=401)
                return
            try:
                content_type = self.headers.get('Content-Type', '')
                force = False
                if 'multipart/form-data' in content_type:
                    fields, files = _parse_multipart_form(self.headers, raw_body)
                    county = fields.get('county', 'kaohsiung')
                    layer_key = fields.get('layer_key', '')
                    force = fields.get('force', 'false').lower() == 'true'
                    file_info = files.get('file')
                    if not file_info:
                        self._send_json({"error": "未接收到任何上傳檔案"}, status=400)
                        return
                    filename = file_info['filename']
                    content_bytes = file_info['content']
                else:
                    req = json.loads(body)
                    county = req.get('county', 'kaohsiung')
                    layer_key = req.get('layer_key', '')
                    force = req.get('force', False)
                    filename = req.get('filename', 'layer.geojson')
                    if 'geojson' in req:
                        content_bytes = json.dumps(req['geojson']).encode('utf-8')
                    elif 'file_base64' in req:
                        import base64
                        content_bytes = base64.b64decode(req['file_base64'])
                    else:
                        self._send_json({"error": "缺少圖資內容"}, status=400)
                        return

                if not layer_key or layer_key not in LAYER_SCHEMAS:
                    self._send_json({"error": f"不支援的圖資分類: {layer_key}"}, status=400)
                    return

                schema = LAYER_SCHEMAS[layer_key]
                target_filename = schema["target_file"]

                # 讀取並轉為 GeoDataFrame (自動轉換坐標至 WGS84 EPSG:4326)
                gdf, crs_desc = _extract_gdf_from_upload(content_bytes, filename)
                inspect_res = _inspect_layer_gdf(gdf, layer_key)

                # 若未通過規格檢查且未強制匯入，返回 400 阻擋並提供紅字清單
                if not inspect_res['valid'] and not force:
                    self._send_json({
                        "success": False,
                        "error": "圖資未通過欄位規格檢驗，已阻擋線上覆蓋！請參考檢驗診斷修正後重新上傳。",
                        "validation": inspect_res
                    }, status=400)
                    return

                target_dir = os.path.join(DATA_DIR, county)
                os.makedirs(target_dir, exist_ok=True)
                target_path = os.path.join(target_dir, target_filename)

                # 輸出 GeoJSON 檔案 (標準 UTF-8)
                gdf.to_file(target_path, driver='GeoJSON', encoding='utf-8')

                # 同步壓縮為 .gz 檔案以支援高速傳輸
                import gzip
                gz_path = target_path + ".gz"
                with open(target_path, 'rb') as f_in, gzip.open(gz_path, 'wb', compresslevel=6) as f_out:
                    while chunk := f_in.read(1024 * 1024):
                        f_out.write(chunk)

                # 即時清除並重新載入記憶體快取
                if county in CACHE:
                    del CACHE[county]
                load_county_data(county)

                cnt = len(gdf)
                auth_db.add_audit_log(session['username'], "upload_layer", f"更新圖資 {target_filename} (來源: {filename}, {cnt:,} 筆圖徵, {crs_desc})", ip)
                self._send_json({
                    "success": True,
                    "message": f"圖資【{schema['name']}】更新成功！共 {cnt:,} 筆圖徵",
                    "count": cnt,
                    "target_file": target_filename,
                    "crs_desc": crs_desc,
                    "validation": inspect_res
                })
            except Exception as e:
                import traceback
                traceback.print_exc()
                self._send_json({"error": str(e)}, status=500)
            return

        self.send_error(404, "Endpoint not found")

    def _send_json(self, data, status=200):
        out = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

def run_server(start_port=8090):
    print("========================================================================")
    env_port = os.environ.get("PORT")
    env_host = os.environ.get("HOST", "0.0.0.0" if env_port else "127.0.0.1")

    httpd = None
    if env_port:
        port = int(env_port)
        try:
            server_address = (env_host, port)
            httpd = ThreadingHTTPServer(server_address, WebGISRequestHandler)
        except Exception as e:
            print(f"[!] 綁定 {env_host}:{port} 失敗: {e}")
            return
    else:
        port = start_port
        for p in range(start_port, start_port + 20):
            try:
                server_address = (env_host, p)
                httpd = ThreadingHTTPServer(server_address, WebGISRequestHandler)
                port = p
                break
            except OSError:
                continue

    if not httpd:
        print("[!] 找不到可用的網路通訊埠。")
        return

    print(f"[OK] 伺服器已就緒！監聽位址: http://{env_host}:{port}")
    print("========================================================================")

    # 僅在本地非容器環境自動嘗試開啟瀏覽器
    if not os.environ.get("PORT"):
        try:
            import webbrowser
            webbrowser.open(f"http://localhost:{port}")
        except Exception:
            pass

    # 背景非同步預熱圖資快取 (不阻塞 HTTP 服務即時連線)
    import threading
    t = threading.Thread(target=load_county_data, args=("kaohsiung",), daemon=True)
    t.start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n伺服器已停止。")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 8090))
    run_server(port)
