# -*- coding: utf-8 -*-
import geopandas as gpd

gdf = gpd.read_file(r"d:\人行道WebGIS平台\public\data\kaohsiung\sidewalk_light.geojson", rows=5)
print("sidewalk_light 幾何型態:", gdf.geometry.geom_type.unique().tolist())
