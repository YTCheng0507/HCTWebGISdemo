# -*- coding: utf-8 -*-
import sys
sys.path.append(r"d:\人行道WebGIS平台\scripts")
from convert_data import convert_poi

convert_poi(
    r"D:\人行道改善優先度評估 2.0\示範產製成果_高雄\00_高雄市生活圈整合POI_全類別最新版_TWD97.shp",
    r"d:\人行道WebGIS平台\public\data\kaohsiung\poi.geojson"
)
