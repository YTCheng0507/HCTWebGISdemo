# -*- coding: utf-8 -*-
"""
========================================================================================
【工具名稱】：WebGIS 圖資標準化轉換管線 (GeoJSON Data Pipeline)
【功能說明】：
    1. 將各縣市原始 Shapefile (TWD97 / EPSG:3826 或 WGS84 / EPSG:4326)
    2. 自動轉換坐標系統為 WGS84 (EPSG:4326)
    3. 進行精確幾何精簡與屬性篩選，產生極致輕量的 WebGIS 向量檔案 (GeoJSON)
    4. 輸出至 public/data/<county>/ 目錄，供前端 MapLibre GL JS 與空間分析直接讀取
========================================================================================
"""

import os
import sys
import json
import geopandas as gpd
import pandas as pd
from shapely.geometry import mapping

# 專案基礎路徑
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_BASE_DIR = os.path.join(BASE_DIR, "public", "data")

def convert_road_priority(src_path, dst_path):
    print(f"-> 正在轉換【道路改善優先度成果】: {src_path}")
    gdf = gpd.read_file(src_path)
    if gdf.crs != "EPSG:4326":
        gdf = gdf.to_crs(epsg=4326)
    
    # 選取關鍵欄位
    keep_cols = [
        'ROADNAME_F', 'COUNTYNAME', 'TOWNNAME', 'LENGTH', 'WIDTH',
        'I_TOTAL', 'PRIORITY', 'RANK',
        'I_SIDEWALK', 'I_ACCIDENT', 'I_LIVE',
        'CNT_A1', 'CNT_A2', 'AVG_SW_W', 'geometry'
    ]
    cols = [c for c in keep_cols if c in gdf.columns]
    sub_gdf = gdf[cols].copy()
    
    # 數值取小數點後兩位
    num_cols = ['LENGTH', 'WIDTH', 'I_TOTAL', 'I_SIDEWALK', 'I_ACCIDENT', 'I_LIVE', 'AVG_SW_W']
    for c in num_cols:
        if c in sub_gdf.columns:
            sub_gdf[c] = sub_gdf[c].round(2)
            
    sub_gdf.to_file(dst_path, driver="GeoJSON")
    print(f"   [成功] 筆數: {len(sub_gdf)}，檔案已寫入: {dst_path}")

def convert_sidewalk(src_path, dst_path):
    print(f"-> 正在轉換【人行道實體普查圖資】: {src_path}")
    gdf = gpd.read_file(src_path)
    if gdf.crs != "EPSG:4326":
        gdf = gdf.to_crs(epsg=4326)
        
    keep_cols = [
        'ID', 'NAME', 'SW_WTH', 'SWD_WTH', 'SWT_WTH', 'SWW_WTH', 
        'SW_PAVE', 'SW_AREA', 'SW_BK_B', 'SW_BK_L', 'SW_BRKRAT', 
        'SW_TREE', 'SW_RAMP', 'ARCADE', 'AC_EVEN', 'geometry'
    ]
    cols = [c for c in keep_cols if c in gdf.columns]
    sub_gdf = gdf[cols].copy()
    
    # 填補空值
    if 'SWW_WTH' in sub_gdf.columns:
        sub_gdf['SWW_WTH'] = sub_gdf['SWW_WTH'].fillna(0).round(2)
    if 'SW_WTH' in sub_gdf.columns:
        sub_gdf['SW_WTH'] = sub_gdf['SW_WTH'].fillna(0).round(2)
    if 'SW_PAVE' in sub_gdf.columns:
        sub_gdf['SW_PAVE'] = sub_gdf['SW_PAVE'].fillna('一般鋪面')
        
    sub_gdf.to_file(dst_path, driver="GeoJSON")
    print(f"   [成功] 筆數: {len(sub_gdf)}，檔案已寫入: {dst_path}")

def convert_accidents(a1_path, a2_path, dst_path):
    print(f"-> 正在轉換【近三年交通事故點位】(A1 + A2)")
    dfs = []
    if os.path.exists(a1_path):
        gdf_a1 = gpd.read_file(a1_path)
        gdf_a1['ACC_TYPE'] = 'A1'
        dfs.append(gdf_a1)
    if os.path.exists(a2_path):
        gdf_a2 = gpd.read_file(a2_path)
        gdf_a2['ACC_TYPE'] = 'A2'
        dfs.append(gdf_a2)
        
    if not dfs:
        print("   [警告] 無事故圖資")
        return
        
    merged = pd.concat(dfs, ignore_index=True)
    merged_gdf = gpd.GeoDataFrame(merged, geometry='geometry', crs=dfs[0].crs)
    if merged_gdf.crs != "EPSG:4326":
        merged_gdf = merged_gdf.to_crs(epsg=4326)
        
    # 解析年份與傷亡
    # 常見日期格式如 1110502, 112/03/01, 2023-05 等
    def parse_year(val):
        s = str(val).strip()
        if len(s) >= 3 and s[:3] in ['110', '111', '112', '113', '114']:
            return int(s[:3])
        if len(s) >= 4 and s[:4] in ['2022', '2023', '2024']:
            return int(s[:4]) - 1911
        return 112 # 預設中位年
        
    if '發生日' in merged_gdf.columns:
        merged_gdf['YEAR'] = merged_gdf['發生日'].apply(parse_year)
    else:
        merged_gdf['YEAR'] = 112

    keep_cols = ['ACC_TYPE', 'YEAR', '死亡人', '受傷人', '事故位', 'geometry']
    cols = [c for c in keep_cols if c in merged_gdf.columns]
    sub_gdf = merged_gdf[cols].copy()
    
    # 重新命名繁體欄位為英文字段，利於前端與標準化
    rename_map = {
        '死亡人': 'DEAD_CNT',
        '受傷人': 'INJ_CNT',
        '事故位': 'LOCATION'
    }
    sub_gdf = sub_gdf.rename(columns=rename_map)
    sub_gdf['DEAD_CNT'] = pd.to_numeric(sub_gdf['DEAD_CNT'], errors='coerce').fillna(0).astype(int)
    sub_gdf['INJ_CNT'] = pd.to_numeric(sub_gdf['INJ_CNT'], errors='coerce').fillna(0).astype(int)
    
    sub_gdf.to_file(dst_path, driver="GeoJSON")
    print(f"   [成功] 總事故筆數: {len(sub_gdf)} (A1={len(merged_gdf[merged_gdf['ACC_TYPE']=='A1'])}, A2={len(merged_gdf[merged_gdf['ACC_TYPE']=='A2'])})")

from poi_classifier import classify_poi, is_nimby_facility, is_scoreable_facility

def convert_poi(src_path, dst_path):
    print(f"-> 正在轉換【生活圈 POI 設施點位 (七大分類＋排除鄰避設施)】: {src_path}")
    gdf = gpd.read_file(src_path)
    if gdf.crs != "EPSG:4326":
        gdf = gdf.to_crs(epsg=4326)
        
    orig_len = len(gdf)
    
    # 1. 徹底剔除鄰避設施 (殯儀館、火化場、公墓等)
    is_nimby = gdf.apply(lambda r: is_nimby_facility(r.get('POI_NAME', ''), r.get('SUB_CLASS', '')), axis=1)
    gdf = gdf[~is_nimby].copy()
    nimby_dropped = orig_len - len(gdf)
    print(f"   [過濾] 已剔除鄰避設施 (公墓/殯儀館/火化場): {nimby_dropped} 筆")
    
    # 2. 七大類重新分類標準
    gdf['TYPE'] = gdf.apply(lambda r: classify_poi(r.get('SUB_CLASS', ''), r.get('SOURCE', ''), r.get('TYPE', '')), axis=1)
    
    # 3. 標註是否納入日常豐富度計分 (排除市政府、動物園、遊樂園、展覽館等稀少特例)
    gdf['IS_SCOREABLE'] = gdf.apply(lambda r: is_scoreable_facility(r.get('POI_NAME', ''), r.get('SUB_CLASS', '')), axis=1)
    excluded_score_cnt = len(gdf[gdf['IS_SCOREABLE'] == 0])
    print(f"   [標註] 稀少/特殊地標 (圖面保留顯示但排除豐富度計分): {excluded_score_cnt} 筆")
    
    keep_cols = ['POI_ID', 'POI_NAME', 'TYPE', 'SUB_CLASS', 'SOURCE', 'TOWNNAME', 'IS_SCOREABLE', 'geometry']
    cols = [c for c in keep_cols if c in gdf.columns]
    sub_gdf = gdf[cols].copy()
    sub_gdf.to_file(dst_path, driver="GeoJSON")
    print(f"   [成功] 最終 POI 筆數: {len(sub_gdf)}，檔案已寫入: {dst_path}")

def convert_population_bsa(src_path, dst_path):
    print(f"-> 正在轉換【最小統計區人口圖資】: {src_path}")
    gdf = gpd.read_file(src_path)
    # 進行幾何拓撲簡化以加速 Web 運算 (TWD97 座標下簡化 5 公尺誤差)
    if gdf.crs == "EPSG:3826":
        # 計算原始面積 (m2) 以便後續精確比例分攤
        gdf['ORIG_AREA'] = gdf.geometry.area
        gdf['geometry'] = gdf.geometry.simplify(tolerance=5.0, preserve_topology=True)
        gdf = gdf.to_crs(epsg=4326)
    else:
        gdf['ORIG_AREA'] = gdf.geometry.area
        if gdf.crs != "EPSG:4326":
            gdf = gdf.to_crs(epsg=4326)
            
    keep_cols = ['CODEBASE', 'TOWN', 'P_CNT', 'H_CNT', 'ORIG_AREA', 'geometry']
    cols = [c for c in keep_cols if c in gdf.columns]
    sub_gdf = gdf[cols].copy()
    sub_gdf['P_CNT'] = pd.to_numeric(sub_gdf['P_CNT'], errors='coerce').fillna(0).astype(int)
    sub_gdf['H_CNT'] = pd.to_numeric(sub_gdf['H_CNT'], errors='coerce').fillna(0).astype(int)
    sub_gdf['ORIG_AREA'] = sub_gdf['ORIG_AREA'].round(1)
    
    sub_gdf.to_file(dst_path, driver="GeoJSON")
    print(f"   [成功] 最小統計區筆數: {len(sub_gdf)}，檔案已寫入: {dst_path}")

def run_conversion_for_county(county_name="kaohsiung", paths_dict=None):
    print("========================================================================")
    print(f"【開始執行 WebGIS 圖資標準化轉換管線 —— 目標縣市: {county_name}】")
    print("========================================================================")
    
    target_dir = os.path.join(OUTPUT_BASE_DIR, county_name)
    os.makedirs(target_dir, exist_ok=True)
    
    if paths_dict is None:
        # 預設高雄路徑
        paths_dict = {
            "road_priority": r"D:\人行道改善優先度評估 2.0\示範產製成果_高雄\05_高雄市12公尺以上道路改善優先度總成果.shp",
            "sidewalk": r"D:\人行道投影與覆蓋率計算\操作專案_高雄_3.0\圖資\sidewalk_97.shp",
            "accident_a1": r"D:\聿庭\人行道改善優先度評估相關圖資\A1事故_更新.shp",
            "accident_a2": r"D:\聿庭\人行道改善優先度評估相關圖資\A2事故_更新.shp",
            "poi": r"D:\人行道改善優先度評估 2.0\示範產製成果_高雄\00_高雄市生活圈整合POI_全類別最新版_TWD97.shp",
            "population_bsa": r"D:\聿庭\人行道改善優先度評估相關圖資\113年12月高雄市統計區人口統計_最小統計區.SHP"
        }
        
    # 1. 道路優先度
    if os.path.exists(paths_dict["road_priority"]):
        convert_road_priority(paths_dict["road_priority"], os.path.join(target_dir, "road_priority.geojson"))
        
    # 2. 人行道
    if os.path.exists(paths_dict["sidewalk"]):
        convert_sidewalk(paths_dict["sidewalk"], os.path.join(target_dir, "sidewalk.geojson"))
        
    # 3. 事故點
    if os.path.exists(paths_dict["accident_a1"]) and os.path.exists(paths_dict["accident_a2"]):
        convert_accidents(paths_dict["accident_a1"], paths_dict["accident_a2"], os.path.join(target_dir, "accidents.geojson"))
        
    # 4. POI
    if os.path.exists(paths_dict["poi"]):
        convert_poi(paths_dict["poi"], os.path.join(target_dir, "poi.geojson"))
        
    # 5. 最小統計區人口
    if os.path.exists(paths_dict["population_bsa"]):
        convert_population_bsa(paths_dict["population_bsa"], os.path.join(target_dir, "population_bsa.geojson"))
        
    print("\n========================================================================")
    print(f"【{county_name} 圖資標準化轉換完成！所有 WebGIS 圖資已備妥於: {target_dir}】")
    print("========================================================================")

if __name__ == "__main__":
    county = sys.argv[1] if len(sys.argv) > 1 else "kaohsiung"
    run_conversion_for_county(county)
