# -*- coding: utf-8 -*-
import pypdf

pdf_path = r"d:\人行道WebGIS平台\臺灣通用電子地圖圖層內容說明(110年度版).pdf"
reader = pypdf.PdfReader(pdf_path)
print("總頁數:", len(reader.pages))

for idx, page in enumerate(reader.pages):
    txt = page.extract_text() or ""
    print(f"Page {idx+1}: len={len(txt)}, sample={repr(txt[:60])}")
