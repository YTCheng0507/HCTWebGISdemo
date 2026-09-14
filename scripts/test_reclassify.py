# -*- coding: utf-8 -*-
import geopandas as gpd
from poi_classifier import classify_poi

shp_path = r"D:\人行道改善優先度評估 2.0\示範產製成果_高雄\00_高雄市生活圈整合POI_全類別最新版_TWD97.shp"
gdf = gpd.read_file(shp_path)

gdf['TYPE_7'] = gdf.apply(lambda r: classify_poi(r.get('SUB_CLASS', ''), r.get('SOURCE', ''), r.get('TYPE', '')), axis=1)

print("=== 七大類重分類統計成果 ===")
counts = gdf['TYPE_7'].value_counts()
print(counts)
print(f"總筆數: {len(gdf)} (無缺失值: {gdf['TYPE_7'].notna().all()})")
