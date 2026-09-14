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

# Windows 本地 QGIS Python PROJ 資料庫相容設定
if "PROJ_DATA" not in os.environ and os.path.exists(r"C:\Program Files\QGIS 4.2.2\share\proj"):
    os.environ["PROJ_DATA"] = r"C:\Program Files\QGIS 4.2.2\share\proj"
    os.environ["PROJ_LIB"] = r"C:\Program Files\QGIS 4.2.2\share\proj"

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import geopandas as gpd
import pandas as pd
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import transform
import pyproj

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
    
    # 1. 道路優先度 / 人行道圖資
    rp_path = os.path.join(county_dir, "road_priority.geojson")
    if os.path.exists(rp_path):
        gdf = gpd.read_file(rp_path)
        data['road_priority'] = gdf
    
    # 2. 人行道 (若只有 .gz 壓縮檔則自動解壓縮以符合 GitHub <100MB 規範)
    sw_path = os.path.join(county_dir, "sidewalk.geojson")
    gz_path = os.path.join(county_dir, "sidewalk.geojson.gz")
    if not os.path.exists(sw_path) and os.path.exists(gz_path):
        print("[*] 偵測到 sidewalk.geojson.gz，正在解壓縮供服務使用...")
        import gzip, shutil
        with gzip.open(gz_path, 'rb') as f_in, open(sw_path, 'wb') as f_out:
            shutil.copyfileobj(f_in, f_out)
        print("[✓] 人行道圖資解壓縮完成！")

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
    print(f"[✓] 【{county}】圖資快取完成！")
    return data

def perform_spatial_analysis(county, polygon_geom_wgs84):
    """
    執行空間相交與多指標聚合分析
    """
    data = load_county_data(county)
    
    # 坐標結構防呆相容 (防止 PowerShell 或部分客戶端將三維陣列扁平化為二維)
    if isinstance(polygon_geom_wgs84, dict) and "coordinates" in polygon_geom_wgs84:
        coords = polygon_geom_wgs84["coordinates"]
        if isinstance(coords, list) and len(coords) > 0:
            if isinstance(coords[0], list) and len(coords[0]) > 0 and isinstance(coords[0][0], (int, float)):
                # 二維 [[x,y], [x,y]] -> 自動包裝為三維 [[[x,y], [x,y]]]
                polygon_geom_wgs84 = {"type": "Polygon", "coordinates": [coords]}
                
    poly_wgs84 = shape(polygon_geom_wgs84)
    poly_twd97 = to_twd97(poly_wgs84)
    box_area_m2 = poly_twd97.area
    box_area_km2 = box_area_m2 / 1_000_000.0
    
    result = {
        "box_area_m2": round(box_area_m2, 1),
        "box_area_km2": round(box_area_km2, 4),
        "population": {},
        "accidents": {},
        "sidewalk": {},
        "poi": {},
        "score": {}
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
    # (1) 步行環境分數 S_WALK (45%): 依路段在框內之【長度佔比權重】加權平均
    weighted_walk_score = 40.0 # 基準無路段保底40分
    total_clipped_len = 0.0
    
    if 'road_priority' in data:
        rp_gdf = data['road_priority']
        possible_idx = list(rp_gdf.sindex.intersection(poly_wgs84.bounds))
        possible_matches = rp_gdf.iloc[possible_idx]
        in_rp = possible_matches[possible_matches.intersects(poly_wgs84)]
        
        road_contributions = []
        for _, r_row in in_rp.iterrows():
            r_geom = r_row.geometry
            r_inter = r_geom.intersection(poly_wgs84)
            if not r_inter.is_empty:
                r_twd97 = to_twd97(r_inter)
                c_len = r_twd97.length
                neg_s = float(r_row.get('I_SIDEWALK', 50.0))
                pos_walk = max(0.0, min(100.0, 100.0 - neg_s))
                road_contributions.append((c_len, pos_walk))
                total_clipped_len += c_len
                
        if total_clipped_len > 0:
            weighted_walk_score = sum((c_len / total_clipped_len) * score for c_len, score in road_contributions)
    else:
        sw_len = result["sidewalk"].get("total_length_m", 0)
        insuf_len = result["sidewalk"].get("insufficient_width_m", 0)
        cov_rate = min(1.0, sw_len / (box_area_m2 / 150.0)) if box_area_m2 > 0 else 0.5
        insuf_ratio = (insuf_len / sw_len) if sw_len > 0 else 0.5
        weighted_walk_score = 20.0 + (10.0 * cov_rate) + (50.0 * (1.0 - insuf_ratio))

    # (2) 交通安全指數 S_SAFETY (10%): 零事故滿分 100 分，行人涉入事故依嚴重度扣減
    tot_a1 = result["accidents"].get("total_a1", 0)
    tot_a2 = result["accidents"].get("total_a2", 0)
    acc_penalty = (tot_a1 * 20.0) + (tot_a2 * 10.0)
    s_safety = max(0.0, min(100.0, 100.0 - acc_penalty))
    
    # (3) 生活機能綜合指標 I_LIVE (45%): 0.3 * 服務人口 + 0.7 * 常態POI豐富度 (排除稀有特例)
    density = result["population"].get("density_per_km2", 0)
    pop_score = min(100.0, (density / 12000.0) * 100.0)
    poi_score = min(100.0, (scoreable_poi_cnt / 40.0) * 100.0)
    i_live = round(0.30 * pop_score + 0.70 * poi_score, 1)
    
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
        "total_road_length_m": round(total_clipped_len, 1)
    }
    
    return result

class WebGISRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        if self.path == '/api/counties':
            counties = [d for d in os.listdir(DATA_DIR) if os.path.isdir(os.path.join(DATA_DIR, d))]
            self._send_json({"counties": counties, "current": "kaohsiung"})
            return
        elif self.path == '/api/status':
            self._send_json({"status": "ready", "cached_counties": list(CACHE.keys())})
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
        return super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"

        if self.path == '/api/analysis':
            try:
                req = json.loads(body)
                county = req.get('county', 'kaohsiung')
                polygon = req.get('polygon')
                if not polygon:
                    self._send_json({"error": "Missing polygon geometry"}, status=400)
                    return
                analysis_res = perform_spatial_analysis(county, polygon)
                self._send_json(analysis_res)
            except Exception as e:
                import traceback
                traceback.print_exc()
                self._send_json({"error": str(e)}, status=500)
            return

        elif self.path == '/api/admin/login':
            try:
                req = json.loads(body)
                pwd = req.get('password', '')
                if pwd == ADMIN_PASSWORD:
                    self._send_json({"success": True, "token": "admin-session-ok"})
                else:
                    self._send_json({"success": False, "error": "管理員密碼錯誤，請重新輸入"}, status=401)
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
            return

        elif self.path == '/api/admin/reload_cache':
            try:
                county = "kaohsiung"
                if county in CACHE:
                    del CACHE[county]
                load_county_data(county)
                self._send_json({"success": True, "message": "圖資快取已重新預熱完成"})
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
            return

        elif self.path == '/api/admin/update_weights':
            try:
                req = json.loads(body)
                for k in ["weight_walk", "weight_safety", "weight_live", "threshold_width"]:
                    if k in req:
                        EVAL_CONFIG[k] = float(req[k])
                self._send_json({"success": True, "weights": EVAL_CONFIG})
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
            return

        elif self.path == '/api/admin/upload_layer':
            try:
                req = json.loads(body)
                county = req.get('county', 'kaohsiung')
                layer_key = req.get('layer_key')
                geojson_data = req.get('geojson')

                file_map = {
                    "sidewalk": "sidewalk.geojson",
                    "poi": "poi.geojson",
                    "accidents": "accidents.geojson",
                    "road_priority": "road_priority.geojson",
                    "population_bsa": "population_bsa.geojson",
                    "town_boundary": "town_boundary.geojson",
                    "village_boundary": "village_boundary.geojson"
                }

                if not layer_key or layer_key not in file_map:
                    self._send_json({"error": f"不支援的圖資分類: {layer_key}"}, status=400)
                    return
                if not geojson_data or not isinstance(geojson_data, dict):
                    self._send_json({"error": "無效的 GeoJSON 資料格式"}, status=400)
                    return

                filename = file_map[layer_key]
                target_path = os.path.join(DATA_DIR, county, filename)
                with open(target_path, 'w', encoding='utf-8') as f:
                    json.dump(geojson_data, f, ensure_ascii=False)

                # 若為人行道，同步更新 .gz 壓縮檔
                if layer_key == "sidewalk":
                    import gzip
                    gz_path = os.path.join(DATA_DIR, county, "sidewalk.geojson.gz")
                    with open(target_path, 'rb') as f_in, gzip.open(gz_path, 'wb', compresslevel=6) as f_out:
                        while chunk := f_in.read(1024 * 1024):
                            f_out.write(chunk)

                # 即時更新記憶體快取
                if county in CACHE:
                    del CACHE[county]
                load_county_data(county)

                cnt = len(geojson_data.get('features', []))
                self._send_json({"success": True, "message": f"圖資 {filename} 更新成功！共 {cnt} 筆圖徵", "count": cnt})
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
