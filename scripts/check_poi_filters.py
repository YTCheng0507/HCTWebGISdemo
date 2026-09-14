# -*- coding: utf-8 -*-
import geopandas as gpd

gdf = gpd.read_file(r"D:\人行道改善優先度評估 2.0\示範產製成果_高雄\00_高雄市生活圈整合POI_全類別最新版_TWD97.shp")

# 1. 鄰避設施關鍵字
nimby_keywords = ['殯儀', '火化', '火葬', '墓園', '公墓', '納骨', '靈骨']
nimby_mask = gdf['POI_NAME'].str.contains('|'.join(nimby_keywords), na=False)
print(f"=== 偵測到鄰避設施 (共 {nimby_mask.sum()} 筆，將徹底剔除不顯示也不計分) ===")
print(gdf[nimby_mask][['POI_NAME', 'TYPE', 'SUB_CLASS']].head(15))

# 2. 稀少/非日常步行生活圈設施關鍵字
rare_keywords = ['市政府', '市政大樓', '遊樂園', '展覽館', '藝文中心', '文化中心', '動物園', '博覽會', '體育場']
rare_mask = gdf['POI_NAME'].str.contains('|'.join(rare_keywords), na=False)
print(f"\n=== 偵測到稀少/特殊設施 (共 {rare_mask.sum()} 筆，圖面保留顯示但排除於豐富度計分) ===")
print(gdf[rare_mask][['POI_NAME', 'TYPE', 'SUB_CLASS']].head(20))
