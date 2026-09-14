# -*- coding: utf-8 -*-
import pypdf

reader = pypdf.PdfReader(r"d:\人行道WebGIS平台\臺灣通用電子地圖圖層內容說明(110年度版).pdf")
p15 = reader.pages[14].extract_text()
print("=== 第 15 頁完整內容 ===")
for idx, line in enumerate(p15.split("\n")):
    print(f"{idx:2d}: {repr(line)}")
