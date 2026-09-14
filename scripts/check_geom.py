# -*- coding: utf-8 -*-
import os
import geopandas as gpd

path = r"D:\人行道投影與覆蓋率計算\操作專案_高雄_3.0"
print(f"=== 檢查目錄: {path} ===")

for root, dirs, files in os.walk(path):
    for f in files:
        if f.endswith('.shp'):
            p = os.path.join(root, f)
            try:
                gdf = gpd.read_file(p, rows=5)
                # 取得真實總筆數
                count = len(gpd.read_file(p, ignore_geometry=True))
                geom_types = gdf.geometry.geom_type.unique().tolist()
                print(f"{f}:")
                print(f"  幾何型態 (Geom Type): {geom_types}")
                print(f"  總筆數: {count}")
                print(f"  路徑: {p}")
            except Exception as e:
                print(f"{f} -> 讀取錯誤: {e}")

# 也檢查一下 D:\聿庭\交通設施圖資\人行道
path2 = r"D:\聿庭\交通設施圖資\人行道"
print(f"\n=== 檢查目錄: {path2} ===")
for root, dirs, files in os.walk(path2):
    for f in files:
        if f.endswith('.shp'):
            p = os.path.join(root, f)
            try:
                gdf = gpd.read_file(p, rows=5)
                geom_types = gdf.geometry.geom_type.unique().tolist()
                print(f"{f}: {geom_types}, 路徑: {p}")
            except Exception as e:
                pass
