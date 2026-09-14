# -*- coding: utf-8 -*-
import os
import geopandas as gpd

FILES = {
    "road_priority": r"D:\人行道改善優先度評估 2.0\示範產製成果_高雄\05_高雄市12公尺以上道路改善優先度總成果.shp",
    "sidewalk_quality": r"D:\人行道改善優先度評估 2.0\示範產製成果_高雄\01_人行道現況品質評估成果_高雄.shp",
    "accident_a1": r"D:\聿庭\人行道改善優先度評估相關圖資\A1事故_更新.shp",
    "accident_a2": r"D:\聿庭\人行道改善優先度評估相關圖資\A2事故_更新.shp",
    "poi": r"D:\人行道改善優先度評估 2.0\示範產製成果_高雄\00_高雄市生活圈整合POI_全類別最新版_TWD97.shp",
    "population_bsa": r"D:\聿庭\人行道改善優先度評估相關圖資\113年12月高雄市統計區人口統計_最小統計區.SHP"
}

for name, path in FILES.items():
    print(f"=== Checking {name} ===")
    if not os.path.exists(path):
        print(f"  [ERROR] File not found: {path}")
        continue
    try:
        gdf = gpd.read_file(path)
        print(f"  Count: {len(gdf)}, CRS: {gdf.crs}, Columns: {list(gdf.columns[:10])}...")
    except Exception as e:
        print(f"  [ERROR] {e}")
