# -*- coding: utf-8 -*-
import geopandas as gpd
import pandas as pd

gdf = gpd.read_file(r"D:\聿庭\人行道改善優先度評估相關圖資\高雄市_POI.shp")
gdf['PREFIX'] = gdf['MARKTYPE1'].astype(str).str[:3]
ct = pd.crosstab(gdf['PREFIX'], gdf['TYPE'].fillna('未分類'))
print("=== MARKTYPE1 前三碼與主管舊分類對照表 ===")
print(ct)

# 查看各前綴代表的地標名稱範例
for pref in sorted(gdf['PREFIX'].unique()):
    sample_names = gdf[gdf['PREFIX'] == pref]['MARKNAME1'].head(4).tolist()
    print(f"前綴 {pref} (共 {len(gdf[gdf['PREFIX'] == pref])} 筆): {sample_names}")
