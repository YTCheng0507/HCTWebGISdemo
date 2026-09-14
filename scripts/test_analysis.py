# -*- coding: utf-8 -*-
import sys
import os
sys.path.append(r"d:\人行道WebGIS平台\server")
import traceback
from analysis_service import perform_spatial_analysis

poly = {
    "type": "Polygon",
    "coordinates": [[
        [120.300, 22.620],
        [120.320, 22.620],
        [120.320, 22.635],
        [120.300, 22.635],
        [120.300, 22.620]
    ]]
}

try:
    res = perform_spatial_analysis("kaohsiung", poly)
    print("SUCCESS! Keys:", list(res.keys()))
    print("Population:", res["population"])
    print("Sidewalk:", res["sidewalk"])
    print("Accidents:", res["accidents"]["total_count"])
    print("Score:", res["score"])
except Exception:
    traceback.print_exc()
