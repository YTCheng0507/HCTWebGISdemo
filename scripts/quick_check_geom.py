# -*- coding: utf-8 -*-
import os
import geopandas as gpd

path = r"D:\人行道投影與覆蓋率計算\操作專案_高雄_3.0"
for root, dirs, files in os.walk(path):
    for f in files:
        if f.endswith('.shp'):
            p = os.path.join(root, f)
            try:
                gdf = gpd.read_file(p, rows=1)
                gtype = gdf.geometry.geom_type.iloc[0]
                print(f"{f}  ==>  {gtype}")
            except Exception as e:
                print(f"{f}  ==>  Error: {e}")
