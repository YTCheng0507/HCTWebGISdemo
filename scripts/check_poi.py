# -*- coding: utf-8 -*-
import geopandas as gpd

print("=== 1. 檢查 D:\\聿庭\\人行道改善優先度評估相關圖資\\高雄市_POI.shp ===")
gdf1 = gpd.read_file(r"D:\聿庭\人行道改善優先度評估相關圖資\高雄市_POI.shp")
print("筆數:", len(gdf1))
print("欄位:", list(gdf1.columns))
print("前2筆:\n", gdf1.head(2))

for col in ['TYPE', 'CLASS', 'SUB_CLASS', 'KIND', 'CATEGORY', 'MARKTYPE', 'CLASS_NAME', 'OBTYPE']:
    if col in gdf1.columns:
        print(f"欄位 {col} 的前 10 個值:", gdf1[col].unique()[:10])

print("\n=== 2. 檢查 00_高雄市生活圈整合POI_全類別最新版_TWD97.shp ===")
gdf2 = gpd.read_file(r"D:\人行道改善優先度評估 2.0\示範產製成果_高雄\00_高雄市生活圈整合POI_全類別最新版_TWD97.shp")
print("筆數:", len(gdf2))
print("欄位:", list(gdf2.columns))
if 'TYPE' in gdf2.columns:
    print("TYPE 唯一值與統計:\n", gdf2['TYPE'].value_counts())
if 'SOURCE' in gdf2.columns:
    print("SOURCE 唯一值與統計:\n", gdf2['SOURCE'].value_counts())
if 'SUB_CLASS' in gdf2.columns:
    print("SUB_CLASS 前 15 個值:\n", gdf2['SUB_CLASS'].value_counts().head(15))
