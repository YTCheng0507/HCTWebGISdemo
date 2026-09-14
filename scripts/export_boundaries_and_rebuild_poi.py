# -*- coding: utf-8 -*-
"""
========================================================================================
【圖資產製與管線更新】：
1. 匯出高雄市區界 (town_boundary.geojson)
2. 匯出高雄市村里界 (village_boundary.geojson)
3. 空間相交補齊通用電子地圖之行政區 (TOWNNAME)
4. 更新 POI 計分標籤 (保證派出所/警察局/捷運等 100% 納入計分)
5. 模糊空間比對去重 (50m 且名稱極度相似者，保留通用圖，刪除 OSM)
========================================================================================
"""
import os
import sys
import re
import difflib
import geopandas as gpd
import pandas as pd
from shapely.strtree import STRtree

# 引入自訂分類器
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(SCRIPT_DIR)
from poi_classifier import is_scoreable_facility

BASE_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(BASE_DIR, "public", "data", "kaohsiung")

def clean_name(s):
    if not s or pd.isna(s):
        return ""
    s = str(s).strip()
    s = re.sub(r'[\s\(\)（）\-_—·•‧\[\]【】\.]+', '', s)
    return s

def name_similarity(name1, name2):
    n1 = clean_name(name1)
    n2 = clean_name(name2)
    if not n1 or not n2:
        return 0.0
    if n1 == n2:
        return 1.0
    # 子字串包含且長度相近 (例如 "愛國超市" in "愛國超市華榮店")
    if (n1 in n2 or n2 in n1) and min(len(n1), len(n2)) >= 2:
        return 0.85
    return difflib.SequenceMatcher(None, n1, n2).ratio()

def step1_export_town_boundary():
    print("=== [Step 1] 匯出高雄市行政區界 (38 區) ===")
    src_town = r"D:\聿庭\行政界線圖資\高雄市區界.shp"
    dst_town = os.path.join(DATA_DIR, "town_boundary.geojson")
    
    gdf_town = gpd.read_file(src_town)
    if gdf_town.crs != "EPSG:4326":
        gdf_town = gdf_town.to_crs(epsg=4326)
        
    keep_cols = ['TOWNNAME', 'COUNTYNAME', 'TOWNCODE', 'geometry']
    sub_town = gdf_town[[c for c in keep_cols if c in gdf_town.columns]].copy()
    sub_town.to_file(dst_town, driver="GeoJSON")
    print(f"  [成功] 筆數: {len(sub_town)}，已寫入: {dst_town}")
    return sub_town

def step2_export_village_boundary():
    print("\n=== [Step 2] 匯出高雄市村里界 (904 村里) ===")
    src_vil = r"D:\聿庭\行政界線圖資\村里界線修正115\VILLAGE_NLSC_1150624.shp"
    dst_vil = os.path.join(DATA_DIR, "village_boundary.geojson")
    
    gdf_vil = gpd.read_file(src_vil)
    kh_vil = gdf_vil[gdf_vil['COUNTYNAME'] == '高雄市'].copy()
    if kh_vil.crs != "EPSG:4326":
        kh_vil = kh_vil.to_crs(epsg=4326)
        
    keep_cols = ['VILLNAME', 'TOWNNAME', 'COUNTYNAME', 'VILLCODE', 'geometry']
    sub_vil = kh_vil[[c for c in keep_cols if c in kh_vil.columns]].copy()
    sub_vil.to_file(dst_vil, driver="GeoJSON")
    print(f"  [成功] 筆數: {len(sub_vil)}，已寫入: {dst_vil}")
    return sub_vil

def step3_rebuild_and_dedup_poi(gdf_town):
    print("\n=== [Step 3] POI 行政區空間相交補全、計分規則校正與模糊去重 ===")
    src_poi = os.path.join(DATA_DIR, "poi.geojson")
    gdf_poi = gpd.read_file(src_poi)
    if gdf_poi.crs != "EPSG:4326":
        gdf_poi = gdf_poi.to_crs(epsg=4326)
        
    orig_total = len(gdf_poi)
    print(f"  原始 POI 總筆數: {orig_total}")
    print(f"  來源分佈:\n{gdf_poi['SOURCE'].value_counts()}")
    
    # 1. 空間相交 (Spatial Join) 補齊 TOWNNAME
    print("\n  -> 正在以區界進行空間關聯補齊行政區名稱...")
    joined = gpd.sjoin(gdf_poi, gdf_town[['TOWNNAME', 'geometry']], how='left', predicate='within')
    
    # 如果原本 TOWNNAME 為空或不存在，填入相交出的 TOWNNAME_right
    if 'TOWNNAME_left' in joined.columns and 'TOWNNAME_right' in joined.columns:
        joined['TOWNNAME'] = joined['TOWNNAME_left'].fillna(joined['TOWNNAME_right'])
        joined = joined.drop(columns=['TOWNNAME_left', 'TOWNNAME_right'])
    elif 'TOWNNAME' not in joined.columns and 'TOWNNAME_right' in joined.columns:
        joined['TOWNNAME'] = joined['TOWNNAME_right']
        
    if 'index_right' in joined.columns:
        joined = joined.drop(columns=['index_right'])
        
    gdf_poi = joined
    missing_town = gdf_poi['TOWNNAME'].isna().sum()
    print(f"  [完成] 行政區補齊完畢！目前行政區空值數: {missing_town}")
    
    # 2. 重新更新 IS_SCOREABLE 標籤 (保證派出所/警察局等 100% 計分)
    print("\n  -> 重新套用最新白名單校正計分標籤 (IS_SCOREABLE)...")
    gdf_poi['IS_SCOREABLE'] = gdf_poi.apply(lambda r: is_scoreable_facility(r.get('POI_NAME', ''), r.get('SUB_CLASS', '')), axis=1)
    
    police_pts = gdf_poi[gdf_poi['POI_NAME'].str.contains('派出所|分駐所|警察局', na=False)]
    police_unscore = len(police_pts[police_pts['IS_SCOREABLE'] == 0])
    print(f"  [驗證] 全市警察/派出所共 {len(police_pts)} 處，未納入計分數: {police_unscore} (必須為 0)")
    
    # 3. 模糊搜尋與空間去重 (50m 且名稱相似度 >= 0.6)
    print("\n  -> 正在執行通用電子地圖與 OSM 點位模糊去重 (距離 <= 50m 且名稱高度類似)...")
    gdf_97 = gdf_poi.to_crs(epsg=3826)
    
    nlsc_mask = gdf_97['SOURCE'] == '通用版電子地圖'
    osm_mask = gdf_97['SOURCE'] == 'OpenStreetMap'
    
    nlsc_gdf = gdf_97[nlsc_mask].copy().reset_index()
    osm_gdf = gdf_97[osm_mask].copy().reset_index()
    
    tree = STRtree(nlsc_gdf.geometry.values)
    
    dup_osm_orig_indices = set()
    sample_dups = []
    
    for _, osm_row in osm_gdf.iterrows():
        geom = osm_row.geometry
        osm_name = osm_row.get('POI_NAME', '')
        osm_orig_idx = osm_row['index']
        
        candidates = tree.query(geom.buffer(50.0))
        for nlsc_local_idx in candidates:
            nlsc_row = nlsc_gdf.iloc[nlsc_local_idx]
            dist = geom.distance(nlsc_row.geometry)
            if dist <= 50.0:
                nlsc_name = nlsc_row.get('POI_NAME', '')
                sim = name_similarity(osm_name, nlsc_name)
                if sim >= 0.60:
                    dup_osm_orig_indices.add(osm_orig_idx)
                    if len(sample_dups) < 10:
                        sample_dups.append((osm_name, nlsc_name, round(dist, 1), round(sim, 2)))
                    break
                    
    print(f"  [辨識完成] 發現重複之 OSM 點位數: {len(dup_osm_orig_indices)} 筆 (將予以剔除，保留通用圖)")
    print("  範例重複配對:")
    for pair in sample_dups:
        print(f"    - OSM「{pair[0]}」 與 通用圖「{pair[1]}」 (相距 {pair[2]}m, 相似度 {pair[3]})")
        
    # 剔除重複的 OSM 點位
    dedup_gdf = gdf_poi[~gdf_poi.index.isin(dup_osm_orig_indices)].copy()
    print(f"\n  [去重結果] 總筆數由 {len(gdf_poi)} 調整為 {len(dedup_gdf)} 筆 (減少 {len(dup_osm_orig_indices)} 筆重複 OSM)")
    print(f"  去重後來源分佈:\n{dedup_gdf['SOURCE'].value_counts()}")
    
    # 儲存回 public/data/kaohsiung/poi.geojson
    dedup_gdf.to_file(src_poi, driver="GeoJSON")
    print(f"  [成功寫入] 已更新: {src_poi}")

def main():
    print("========================================================================")
    print("【開始執行界線圖層產製、POI 去重與行政區補正作業】")
    print("========================================================================")
    sub_town = step1_export_town_boundary()
    sub_vil = step2_export_village_boundary()
    step3_rebuild_and_dedup_poi(sub_town)
    print("\n========================================================================")
    print("【所有圖資產製與校正成功完成！】")
    print("========================================================================")

if __name__ == '__main__':
    main()
