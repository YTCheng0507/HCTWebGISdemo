# -*- coding: utf-8 -*-
"""
自動產製：
1. WebGIS前後端架構與實作指引簡報 (.pptx) - Noto Sans TC, 字級 >= 16pt, 專業排版
2. WebGIS前後端架構與實作指引說明文件 (.docx) - Noto Serif TC 12pt, 固定行距 20pt
"""

import os
import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

import docx
from docx.shared import Pt as DocxPt, Inches as DocxInches, RGBColor as DocxRGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

BASE_DIR = r"d:\人行道WebGIS平台"
DOCS_DIR = os.path.join(BASE_DIR, "docs")
os.makedirs(DOCS_DIR, exist_ok=True)

PPTX_PATH = os.path.join(DOCS_DIR, "WebGIS前後端架構與實作指引_簡報.pptx")
DOCX_PATH = os.path.join(DOCS_DIR, "WebGIS前後端架構與實作指引_說明手冊.docx")

# ==============================================================================
# 1. 產製 PPTX 簡報 (16:9 寬螢幕，Noto Sans TC，字級 >= 16pt)
# ==============================================================================
def create_pptx():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_slide_layout = prs.slide_layouts[6]

    # 顏色配置
    COLOR_PRIMARY = RGBColor(27, 54, 93)     # 沉穩海軍藍 #1B365D
    COLOR_SECONDARY = RGBColor(2, 132, 199) # 科技湛藍 #0284C7
    COLOR_ACCENT = RGBColor(22, 163, 74)    # 成功綠 #16A34A
    COLOR_TEXT_DARK = RGBColor(30, 41, 59)  # 深鐵灰 #1E293B
    COLOR_TEXT_MUTED = RGBColor(100, 116, 139) # 說明灰 #64748B
    COLOR_BG_CARD = RGBColor(248, 250, 252) # 淺灰底 #F8FAFC
    COLOR_WHITE = RGBColor(255, 255, 255)
    COLOR_BORDER = RGBColor(203, 213, 225)  # 邊框灰 #CBD5E1

    FONT_FAMILY = "Noto Sans TC"

    def add_header(slide, title_text, subtitle_text=None):
        # 頂部主題背景條
        top_bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(1.15))
        top_bar.fill.solid()
        top_bar.fill.fore_color.rgb = COLOR_PRIMARY
        top_bar.line.fill.background()

        # 裝飾色塊
        accent_strip = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, Inches(1.15), Inches(13.333), Inches(0.06))
        accent_strip.fill.solid()
        accent_strip.fill.fore_color.rgb = COLOR_SECONDARY
        accent_strip.line.fill.background()

        # 標題文字
        txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.18), Inches(11.7), Inches(0.8))
        tf = txBox.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = title_text
        p.font.name = FONT_FAMILY
        p.font.size = Pt(26)
        p.font.bold = True
        p.font.color.rgb = COLOR_WHITE

        if subtitle_text:
            p2 = tf.add_paragraph()
            p2.text = subtitle_text
            p2.font.name = FONT_FAMILY
            p2.font.size = Pt(16)
            p2.font.color.rgb = RGBColor(224, 242, 254)

    # ---------------- Slide 1: 封面 ----------------
    slide1 = prs.slides.add_slide(blank_slide_layout)
    bg1 = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg1.fill.solid()
    bg1.fill.fore_color.rgb = COLOR_PRIMARY
    bg1.line.fill.background()

    # 裝飾卡片
    card1 = slide1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.2), Inches(1.2), Inches(10.933), Inches(5.1))
    card1.fill.solid()
    card1.fill.fore_color.rgb = COLOR_WHITE
    card1.line.color.rgb = COLOR_SECONDARY
    card1.line.width = Pt(2)

    tf1 = card1.text_frame
    tf1.word_wrap = True
    tf1.margin_left = Inches(0.6)
    tf1.margin_top = Inches(0.6)
    tf1.margin_right = Inches(0.6)

    p = tf1.paragraphs[0]
    p.text = "人行環境 WebGIS 平台"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(32)
    p.font.bold = True
    p.font.color.rgb = COLOR_PRIMARY
    p.alignment = PP_ALIGN.LEFT

    p = tf1.add_paragraph()
    p.text = "前後端架構選型、UI 實作指引與維運防護完全解析"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(22)
    p.font.bold = True
    p.font.color.rgb = COLOR_SECONDARY
    p.space_before = Pt(8)

    p = tf1.add_paragraph()
    p.text = "讓非技術背景也能輕鬆理解與運用的空間資訊決策系統手冊"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(17)
    p.font.color.rgb = COLOR_TEXT_MUTED
    p.space_before = Pt(12)

    p = tf1.add_paragraph()
    p.text = "• 彙整四大前後端架構差異與適用時機\n• 解析輕量化 WebGIS 實作技術與 UI/UX 調整指示\n• 盤點雲端流量控制、效能調優與資安防護要訣"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(16)
    p.font.color.rgb = COLOR_TEXT_DARK
    p.space_before = Pt(20)

    # ---------------- Slide 2: 目錄 ----------------
    slide2 = prs.slides.add_slide(blank_slide_layout)
    add_header(slide2, "簡報大綱與核心導覽", "Agenda & Overview")

    modules = [
        ("01", "前後端搭配類型與適用時機", "地端主機 vs 雲端託管、前後端分離與純前端的全面比較"),
        ("02", "本專案 WebGIS 實作架構解析", "MapLibre + Python + 記憶體空間索引之輕量化極致設計"),
        ("03", "UI/UX 空間互動與設計指示", "全視角地圖、無遮擋抽屜、雙軌清除防呆與行動端適配"),
        ("04", "實務常見狀況與維運因應之道", "Render 流量控制、大圖資快取調優與搜尋引擎隱蔽防護")
    ]

    for i, (num, title, desc) in enumerate(modules):
        x = Inches(1.0 + (i % 2) * 5.8)
        y = Inches(1.6 + (i // 2) * 2.6)
        card = slide2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(5.5), Inches(2.2))
        card.fill.solid()
        card.fill.fore_color.rgb = COLOR_BG_CARD
        card.line.color.rgb = COLOR_BORDER
        card.line.width = Pt(1.5)

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.3)
        tf.margin_top = Inches(0.25)
        tf.margin_right = Inches(0.3)

        p = tf.paragraphs[0]
        p.text = f"單元 {num} ｜ {title}"
        p.font.name = FONT_FAMILY
        p.font.size = Pt(18)
        p.font.bold = True
        p.font.color.rgb = COLOR_PRIMARY

        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.name = FONT_FAMILY
        p2.font.size = Pt(16)
        p2.font.color.rgb = COLOR_TEXT_MUTED
        p2.space_before = Pt(10)

    # ---------------- Slide 3: 前後端架構四大模式比較 ----------------
    slide3 = prs.slides.add_slide(blank_slide_layout)
    add_header(slide3, "常見前後端架構搭配與特性比較", "四種主要架構模式之白話解析")

    table_shape = slide3.shapes.add_table(5, 4, Inches(0.8), Inches(1.5), Inches(11.733), Inches(5.4))
    table = table_shape.table
    table.columns[0].width = Inches(2.5)
    table.columns[1].width = Inches(3.2)
    table.columns[2].width = Inches(3.0)
    table.columns[3].width = Inches(3.033)

    headers = ["架構搭配模式", "運作原理 (白話說法)", "優點與長處", "主要限制與注意點"]
    rows_data = [
        ["1. 純靜態前端\n(GitHub Pages / S3)", "只有網頁與靜態圖資，無後端伺服器，全靠使用者瀏覽器運算", "• 零伺服器維護成本\n• 免費且永不當機", "• 只能處理輕量資料\n• 運算規則無法保密"],
        ["2. 現代前後端分離\n(本專案採用模式)", "前端負責美觀呈現與地圖渲染，後端專注空間演算法與資料庫", "• 載入極度流暢\n• 運算精準且具彈性", "• 需管理前後端 API 通訊\n• 需注意流量控制"],
        ["3. 全端伺服器渲染\n(傳統 Django / PHP)", "每次使用者點擊，伺服器都在背後把整張網頁組裝好才送出", "• 資料庫整合度高\n• 傳統系統架構成熟", "• 換頁會整頁白色閃爍\n• 地圖互動體驗較卡頓"],
        ["4. 地端內部伺服器\n(On-Premises 專機)", "在機房或辦公室擺實體主機，透過區網或內網提供服務", "• 算力極大、無流量限制\n• 機密圖資 100% 安全", "• 需專人維護硬體\n• 外部人員不易連入"]
    ]

    for col_idx, h in enumerate(headers):
        cell = table.cell(0, col_idx)
        cell.text = h
        cell.fill.solid()
        cell.fill.fore_color.rgb = COLOR_PRIMARY
        p = cell.text_frame.paragraphs[0]
        p.font.name = FONT_FAMILY
        p.font.size = Pt(16)
        p.font.bold = True
        p.font.color.rgb = COLOR_WHITE
        p.alignment = PP_ALIGN.CENTER

    for row_idx, row in enumerate(rows_data):
        for col_idx, val in enumerate(row):
            cell = table.cell(row_idx + 1, col_idx)
            cell.text = val
            cell.fill.solid()
            cell.fill.fore_color.rgb = COLOR_WHITE if row_idx % 2 == 0 else COLOR_BG_CARD
            p = cell.text_frame.paragraphs[0]
            p.font.name = FONT_FAMILY
            p.font.size = Pt(16)
            p.font.color.rgb = COLOR_TEXT_DARK

    # ---------------- Slide 4: 適用時機與專案選型指南 ----------------
    slide4 = prs.slides.add_slide(blank_slide_layout)
    add_header(slide4, "不同專案情境的架構選型策略", "什麼時候該用哪種方案？")

    col_data = [
        ("情境 A：公開成果與 Demo 展示\n【推薦：全線上雲端託管】",
         "• 專案性質：成果發表會、主管評委簡報、跨縣市展示\n• 核心訴求：任何手機平板隨點即開、免安裝軟體\n• 搭配方案：GitHub + 免費雲端 PaaS (如 Render / Vercel)\n• 優勢：零硬體維護負擔、自動配置 SSL 安全憑證"),
        ("情境 B：公務涉密與巨量運算\n【推薦：地端內部伺服器】",
         "• 專案性質：含個資事故點、國防管制區、數十 GB 點雲光達\n• 核心訴求：機密圖資絕不能外流、需極致本機 CPU 算力\n• 搭配方案：辦公室工作站 + 本地 QGIS / Python 後端\n• 優勢：完全不吃外網流量、100% 符合資安法規"),
        ("情境 C：現代最佳實務\n【推薦：地端處理 ＋ 線上展示】",
         "• 專案性質：大型 WebGIS 決策支援系統（本專案模式）\n• 運作流程：\n   1. 地端完成巨量空間運算與數值產製 (ETL)\n   2. 線上輕量部署提供決策者即時圈選試算\n• 優勢：兼具地端強大算力與雲端隨處可用的雙重好處")
    ]

    for i, (title, content) in enumerate(col_data):
        x = Inches(0.8 + i * 3.95)
        card = slide4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, Inches(1.5), Inches(3.8), Inches(5.4))
        card.fill.solid()
        card.fill.fore_color.rgb = COLOR_BG_CARD
        card.line.color.rgb = COLOR_SECONDARY if i == 2 else COLOR_BORDER
        card.line.width = Pt(2 if i == 2 else 1)

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.25)
        tf.margin_top = Inches(0.3)
        tf.margin_right = Inches(0.25)

        p = tf.paragraphs[0]
        p.text = title
        p.font.name = FONT_FAMILY
        p.font.size = Pt(17)
        p.font.bold = True
        p.font.color.rgb = COLOR_SECONDARY if i == 2 else COLOR_PRIMARY

        p2 = tf.add_paragraph()
        p2.text = content
        p2.font.name = FONT_FAMILY
        p2.font.size = Pt(16)
        p2.font.color.rgb = COLOR_TEXT_DARK
        p2.space_before = Pt(12)

    # ---------------- Slide 5: 本專案 WebGIS 實作架構 ----------------
    slide5 = prs.slides.add_slide(blank_slide_layout)
    add_header(slide5, "本專案 WebGIS 實作方案與架構藍圖", "以最小 Token 與輕量資源打造高效能空間平台")

    boxes = [
        ("1. 前端渲染層 (Client View)", Inches(0.8), Inches(1.5), Inches(3.7), Inches(5.4),
         "• MapLibre GL JS 向量地圖核心\n• 原生 JavaScript (零 Webpack 打包)\n• GPU 硬體加速，滑順縮放平移\n• 整合 Turf.js 即時幾何計算\n• 響應式佈局支援手機與平板"),
        ("2. 通訊與傳輸層 (Network)", Inches(4.8), Inches(1.5), Inches(3.7), Inches(5.4),
         "• 輕量 RESTful JSON API 通訊\n• 靜態 GeoJSON 透明 Gzip 壓縮\n• 啟用 7 天瀏覽器長效快取\n• 支援 WGS84 ↔ TWD97 坐標互轉\n• 防爬蟲 robots 協議保護"),
        ("3. 後端空間引擎 (Backend Engine)", Inches(8.8), Inches(1.5), Inches(3.7), Inches(5.4),
         "• Python 輕量多執行緒伺服器\n• GeoPandas + Shapely 核心運算\n• STRtree 空間索引 (毫秒級交集)\n• 正面評估 2.0 V2 演算法標準\n• 區分整條道路展示與細部路段框選")
    ]

    for title, x, y, w, h, content in boxes:
        card = slide5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
        card.fill.solid()
        card.fill.fore_color.rgb = COLOR_WHITE
        card.line.color.rgb = COLOR_PRIMARY
        card.line.width = Pt(1.5)

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.25)
        tf.margin_top = Inches(0.3)
        tf.margin_right = Inches(0.25)

        p = tf.paragraphs[0]
        p.text = title
        p.font.name = FONT_FAMILY
        p.font.size = Pt(18)
        p.font.bold = True
        p.font.color.rgb = COLOR_PRIMARY

        p2 = tf.add_paragraph()
        p2.text = content
        p2.font.name = FONT_FAMILY
        p2.font.size = Pt(16)
        p2.font.color.rgb = COLOR_TEXT_DARK
        p2.space_before = Pt(12)

    # ---------------- Slide 6: 前後端架構指令與指示白話總結 ----------------
    slide6 = prs.slides.add_slide(blank_slide_layout)
    add_header(slide6, "前後端核心指令與架構指示總結", "讓非技術背景也能掌握的關鍵設計規範")

    items = [
        ("指示 1：坐標系統標準化（雙軌分工）", "前端顯示一律使用 WGS84 (EPSG:4326) 經緯度，後端空間面積與長度運算一律轉換為 TWD97 (EPSG:3826) 公尺制，杜絕因經緯度計算面積產生的巨大誤差。"),
        ("指示 2：圖資層級分工（展示 vs 框選）", "地圖上點選 Popup 使用「整條道路匯總成果」以掌握全路廊概況；空間框選分析則調用「細部切割路段」進行真實長度加權，確保評分客觀公正。"),
        ("指示 3：演算法全面正向化對齊", "依據《正面評估版 V2》標準，以「雙側基礎分 (40~80分) ＋ 四大好品質加分 (最高+20分) － 五大不良扣分 (最高-20分)」直接計算正面步行優良度，去除負面扣分字眼。"),
        ("指示 4：嚴謹防呆攔截機制", "當框選範圍內無道路與人行道（如水域或荒地）時，後端即時攔截並回傳提示，前端不核發基礎分、不呈現評估卡片，杜絕湖面產出分數的盲點。")
    ]

    for i, (title, desc) in enumerate(items):
        y = Inches(1.45 + i * 1.35)
        card = slide6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), y, Inches(11.733), Inches(1.2))
        card.fill.solid()
        card.fill.fore_color.rgb = COLOR_BG_CARD
        card.line.color.rgb = COLOR_BORDER
        card.line.width = Pt(1)

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.3)
        tf.margin_top = Inches(0.18)
        tf.margin_right = Inches(0.3)

        p = tf.paragraphs[0]
        p.text = title
        p.font.name = FONT_FAMILY
        p.font.size = Pt(17)
        p.font.bold = True
        p.font.color.rgb = COLOR_PRIMARY

        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.name = FONT_FAMILY
        p2.font.size = Pt(16)
        p2.font.color.rgb = COLOR_TEXT_DARK
        p2.space_before = Pt(4)

    # ---------------- Slide 7: UI/UX 空間互動與設計調整 ----------------
    slide7 = prs.slides.add_slide(blank_slide_layout)
    add_header(slide7, "UI / UX 空間互動與版面調優要訣", "以使用者為中心的直覺操作體驗")

    ui_cards = [
        ("1. 地圖視角最大化與無遮擋設計", "• 側欄採可收合抽屜式設計，預設給予地圖最大可視區域\n• 底部分析成果面板支援上滑展開與半屏檢視\n• 確保在平板橫向與手機直向皆不遮擋地圖中央焦點"),
        ("2. 雙軌操作控制與狀態自動清除", "• 框選面板配置「結束框選」與「清除框選」成對按鈕\n• 切換分頁或分析失敗時，系統自動清除圖面殘留幾何\n• 杜絕需切換至量測工具才能清除標記的混淆操作"),
        ("3. 資訊密度與圖表響應式精簡", "• 手機版生活機能圓餅圖隱藏側邊文字，改為置中展示\n• 點擊扇區即可浮現分類處數與占比，解決小螢幕擁擠\n• 下方搭配完整數據表格，兼顧美觀與資料查閱完整性"),
        ("4. 彈跳視窗關閉防呆機制", "• Popup 底部增設顯著「關閉 ✕」實體按鈕\n• 支援點擊地圖任意空白處關閉，完美解決觸控失靈問題")
    ]

    for i, (title, desc) in enumerate(ui_cards):
        x = Inches(0.8 + (i % 2) * 5.95)
        y = Inches(1.5 + (i // 2) * 2.7)
        card = slide7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(5.78), Inches(2.45))
        card.fill.solid()
        card.fill.fore_color.rgb = COLOR_WHITE
        card.line.color.rgb = COLOR_SECONDARY
        card.line.width = Pt(1.5)

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.3)
        tf.margin_top = Inches(0.22)
        tf.margin_right = Inches(0.3)

        p = tf.paragraphs[0]
        p.text = title
        p.font.name = FONT_FAMILY
        p.font.size = Pt(17)
        p.font.bold = True
        p.font.color.rgb = COLOR_SECONDARY

        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.name = FONT_FAMILY
        p2.font.size = Pt(16)
        p2.font.color.rgb = COLOR_TEXT_DARK
        p2.space_before = Pt(6)

    # ---------------- Slide 8: 實務維運常見狀況與因應之道 ----------------
    slide8 = prs.slides.add_slide(blank_slide_layout)
    add_header(slide8, "實務維運常見狀況與因應之道", "如何確保系統長治久安與高可用性？")

    issues = [
        ("狀況 1：雲端免費頻寬耗盡警訊 (如 Render 5GB 上限)",
         "• 核心原因：每次開啟載入 159 MB 原始人行道圖資，20~25 次即用盡。\n• 根本解法：啟用 7 天瀏覽器長效快取 (Cache-Control) ＋ Gzip 壓縮傳輸，單次流量節省 70%，重複造訪 0 流量消耗。"),
        ("狀況 2：大範圍向量圖資載入導致瀏覽器凍結",
         "• 核心原因：8 萬筆多邊形一次塞入 DOM，低階手機或老舊電腦記憶體不足。\n• 根本解法：幾何拓撲簡化 (Douglas-Peucker 5m 容差) ＋ 屬性精簡，檔案縮小 60% 且毫秒級秒開。"),
        ("狀況 3：內部專案被搜尋引擎爬取外洩",
         "• 核心原因：公網網址若未設防，可能被搜尋引擎爬蟲建立公開索引。\n• 根本解法：在 HTML 注入 <meta name='robots' content='noindex, nofollow'>，強制全網爬蟲忽略該站。")
    ]

    for i, (title, desc) in enumerate(issues):
        y = Inches(1.5 + i * 1.8)
        card = slide8.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), y, Inches(11.733), Inches(1.6))
        card.fill.solid()
        card.fill.fore_color.rgb = COLOR_BG_CARD
        card.line.color.rgb = COLOR_PRIMARY
        card.line.width = Pt(1)

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.3)
        tf.margin_top = Inches(0.2)
        tf.margin_right = Inches(0.3)

        p = tf.paragraphs[0]
        p.text = title
        p.font.name = FONT_FAMILY
        p.font.size = Pt(17)
        p.font.bold = True
        p.font.color.rgb = COLOR_PRIMARY

        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.name = FONT_FAMILY
        p2.font.size = Pt(16)
        p2.font.color.rgb = COLOR_TEXT_DARK
        p2.space_before = Pt(6)

    # ---------------- Slide 9: 結語與最佳化成果 ----------------
    slide9 = prs.slides.add_slide(blank_slide_layout)
    add_header(slide9, "結論與系統成效總結", "兼具專業性、易用度與極低維護成本的決策平台")

    summary_card = slide9.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(1.6), Inches(11.333), Inches(5.2))
    summary_card.fill.solid()
    summary_card.fill.fore_color.rgb = COLOR_WHITE
    summary_card.line.color.rgb = COLOR_SECONDARY
    summary_card.line.width = Pt(2)

    tf = summary_card.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.5)
    tf.margin_top = Inches(0.4)
    tf.margin_right = Inches(0.5)

    p = tf.paragraphs[0]
    p.text = "🎯 本專案達成之關鍵效益指標："
    p.font.name = FONT_FAMILY
    p.font.size = Pt(20)
    p.font.bold = True
    p.font.color.rgb = COLOR_PRIMARY

    points = [
        "1. 零額外軟體依賴：決策者、審查委員與民眾無需安裝 QGIS，手機/平板瀏覽器隨開即用。",
        "2. 極致流暢度與低耗損：透過 Gzip 傳輸與長效快取，將出站流量壓低 90%，5GB 免費額度綽綽有餘。",
        "3. 演算法完全公正透明：嚴格落實國土署 2.0 V2 正面五級分評鑑，兼顧雙側基礎分、好品質加分與不良扣分。",
        "4. 操作防呆與直覺回饋：無道路不予分析攔截、雙軌清除控制、觸控彈窗優化，打造零學習門檻的操作體驗。"
    ]

    for pt in points:
        p = tf.add_paragraph()
        p.text = pt
        p.font.name = FONT_FAMILY
        p.font.size = Pt(16.5)
        p.font.color.rgb = COLOR_TEXT_DARK
        p.space_before = Pt(12)

    prs.save(PPTX_PATH)
    print(f"✅ 成功產製簡報：{PPTX_PATH}")


# ==============================================================================
# 2. 產製 Word 說明文件 (.docx, Noto Serif TC 12pt, 固定行距 20pt)
# ==============================================================================
def create_docx():
    doc = docx.Document()

    # 版面邊界設定 (標準 A4 邊界 2.54 cm)
    for section in doc.sections:
        section.top_margin = DocxInches(1.0)
        section.bottom_margin = DocxInches(1.0)
        section.left_margin = DocxInches(1.0)
        section.right_margin = DocxInches(1.0)

    FONT_NAME = "Noto Serif TC"

    # 設定通用段落格式
    def format_paragraph(p, space_before=0, space_after=6, line_spacing=20):
        p.paragraph_format.space_before = DocxPt(space_before)
        p.paragraph_format.space_after = DocxPt(space_after)
        p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        p.paragraph_format.line_spacing = DocxPt(line_spacing)

    def add_title(text):
        p = doc.add_paragraph()
        format_paragraph(p, space_before=12, space_after=12, line_spacing=28)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(text)
        run.font.name = FONT_NAME
        run.font.size = DocxPt(22)
        run.font.bold = True
        run.font.color.rgb = DocxRGBColor(27, 54, 93)
        # 設定中文字型
        rPr = run._r.get_or_add_rPr()
        rFonts = parse_xml(r'<w:rFonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:eastAsia="{0}"/>'.format(FONT_NAME))
        rPr.append(rFonts)
        return p

    def add_heading_1(text):
        p = doc.add_paragraph()
        format_paragraph(p, space_before=16, space_after=6, line_spacing=24)
        run = p.add_run(text)
        run.font.name = FONT_NAME
        run.font.size = DocxPt(16)
        run.font.bold = True
        run.font.color.rgb = DocxRGBColor(27, 54, 93)
        rPr = run._r.get_or_add_rPr()
        rFonts = parse_xml(r'<w:rFonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:eastAsia="{0}"/>'.format(FONT_NAME))
        rPr.append(rFonts)
        return p

    def add_heading_2(text):
        p = doc.add_paragraph()
        format_paragraph(p, space_before=12, space_after=4, line_spacing=22)
        run = p.add_run(text)
        run.font.name = FONT_NAME
        run.font.size = DocxPt(14)
        run.font.bold = True
        run.font.color.rgb = DocxRGBColor(2, 132, 199)
        rPr = run._r.get_or_add_rPr()
        rFonts = parse_xml(r'<w:rFonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:eastAsia="{0}"/>'.format(FONT_NAME))
        rPr.append(rFonts)
        return p

    def add_body(text, bold_prefix=None):
        p = doc.add_paragraph()
        format_paragraph(p, space_before=0, space_after=6, line_spacing=20)
        if bold_prefix:
            r_bold = p.add_run(bold_prefix)
            r_bold.font.name = FONT_NAME
            r_bold.font.size = DocxPt(12)
            r_bold.font.bold = True
            r_bold.font.color.rgb = DocxRGBColor(30, 41, 59)
            rPr = r_bold._r.get_or_add_rPr()
            rFonts = parse_xml(r'<w:rFonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:eastAsia="{0}"/>'.format(FONT_NAME))
            rPr.append(rFonts)

        run = p.add_run(text)
        run.font.name = FONT_NAME
        run.font.size = DocxPt(12)
        run.font.color.rgb = DocxRGBColor(51, 65, 85)
        rPr = run._r.get_or_add_rPr()
        rFonts = parse_xml(r'<w:rFonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:eastAsia="{0}"/>'.format(FONT_NAME))
        rPr.append(rFonts)
        return p

    # ---------------- 文件內容撰寫 ----------------
    add_title("人行環境 WebGIS 資料平台：全架構解析與實作指引手冊")
    
    p_meta = doc.add_paragraph()
    format_paragraph(p_meta, space_before=0, space_after=14, line_spacing=18)
    p_meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p_meta.add_run("文件版本：v2.0 完整實作版 ｜ 字型規格：Noto Serif TC 12pt (固定行距 20pt)")
    r.font.name = FONT_NAME
    r.font.size = DocxPt(10.5)
    r.font.color.rgb = DocxRGBColor(100, 116, 139)

    add_heading_1("一、 系統簡介與核心定位")
    add_body("本平台係依據內政部國土管理署《人行道改善優先度評估 2.0 正面評估版 (V2)》標準作業規範研發，旨在將複雜之地理資訊系統 (GIS) 與工務急迫性工程數據，轉化為決策主管、審查委員及一般市民均能直觀理解之「正面人本步行環境優良度總分（0 ~ 100 分，五級分制）」。")
    add_body("本手冊旨在總結平台前後端技術選型策略、UI/UX 空間操作指引，以及維護運營時可能遭遇之流量、效能與資安問題，提供非網頁技術背景之同仁完整且白話之指引。")

    add_heading_1("二、 前後端架構搭配模式比較與適用時機")
    add_heading_2("2.1 四種常見前後端搭配模式解析")
    add_body("在現代網頁與 WebGIS 開發中，常見的前後端搭配模式包含以下四類：")
    add_body("1. 純靜態前端架構（如 GitHub Pages / AWS S3）：無專屬後端伺服器，所有網頁 HTML、JS 腳本與 GeoJSON 圖資均直接由靜態伺服器發送，空間運算全靠使用者本機瀏覽器執行。優點為零伺服器維運費用、永不當機；缺點為無法承載巨量圖資計算，且核心演算法暴露於前端無法保密。")
    add_body("2. 現代前後端分離架構（本專案採用模式）：前端專注於地圖向量圖磚渲染與使用者互動（使用 MapLibre GL JS），後端專注於空間資料庫查詢、空間交集分攤與演算法運算（使用 Python + GeoPandas + Shapely）。優點為載入流暢、架構彈性高、空間運算精準；需注意出站流量控制與 API 快取設定。")
    add_body("3. 傳統全端伺服器渲染（SSR，如 Django / PHP / ASP.NET）：每次使用者點選按鈕，伺服器都在後台動態生成完整的 HTML 頁面後才傳回瀏覽器。優點為資料庫整合度高；缺點為每次換頁皆會出現短暫白畫面，地圖平移與縮放互動體驗較差。")
    add_body("4. 地端內部伺服器模式（On-Premises / 專用工作站）：將主機架設於機房或辦公室內部，透過內部區域網路 (LAN) 或專屬 VPN 供人員連線。優點為硬體算力極大、無出站流量費用、機密圖資完全不外流；缺點為需專人維護硬體與不斷電系統，外網存取需設定繁瑣之網路穿透。")

    add_heading_2("2.2 專案情境選型指南")
    add_body("• 成果展示、跨機關協作與審查 Demo：強烈推薦【全線上雲端託管模式】（GitHub + Render / Vercel）。跨平台免安裝軟體，手機平板隨掃隨開，具備最高之傳播與審查便利性。")
    add_body("• 機密公務數據與重度算力專案：推薦【地端內部伺服器模式】。例如包含未公開交通事故當事人個資、軍事管制區圖資、數十 GB 無人機航照或 3D 點雲光達等，符合嚴格之公務資安法規。")
    add_body("• 現代 WebGIS 最佳混合實務：採【地端重度前處理 ＋ 雲端輕量化展示】。於地端完成耗時之巨量幾何拓撲簡化與指標算繪，雲端伺服器僅保留最終成果圖資與輕量化空間交集 API，兼得兩者優點。")

    add_heading_1("三、 本專案 WebGIS 實作架構與核心指令")
    add_heading_2("3.1 輕量化技術堆疊藍圖")
    add_body("• 前端視圖層：採用 MapLibre GL JS 作為向量地圖渲染引擎，搭配純原生 JavaScript（無 Webpack/Vite 等複雜打包工具依賴），透過瀏覽器 GPU 硬體加速實現 60 FPS 流暢縮放平移。")
    add_body("• 後端空間引擎：採用 Python 輕量多執行緒伺服器 (ThreadingHTTPServer)，整合 GeoPandas 與 Shapely 之 STRtree 空間索引，將圖資常駐於伺服器記憶體，實現 50 毫秒以內之極速空間框選計算。")
    add_body("• 圖資規格與坐標系雙軌制：前端地圖呈現一律採用 WGS84 經緯度 (EPSG:4326)，後端空間長度與面積運算一律即時投影為 TWD97 二度分帶 (EPSG:3826) 公尺制，徹底避免高緯度經緯度計算面積造成之失真。")

    add_heading_2("3.2 前後端核心設計規範與實施指示")
    add_body("1. 道路圖資層級分工（展示 vs 框選）：圖面點選 Popup 採用「依整條道路匯總成果 (road_priority.geojson)」，呈現全路廊之宏觀指標；空間手繪框選分析則調用「依細部切割路段成果 (road_segments.geojson，共19,628筆)」，精確以落入框選圈內之細部路段實際長度加權，確保評分客觀公正。")
    add_body("2. 評鑑模型全面正向化：依據《正面評估版 V2》規範，將原本工務局改善急迫度轉化為正面步行環境指標（S_WALK），公式為「雙側基礎分 (40~80分) ＋ 四大好品質加分 (最高+20分) － 五大不良扣分 (最高-20分)」，介於 0 ~ 100 分。")
    add_body("3. 交通安全與生活圈權重修正：交通安全指數修正為「A1死亡每件扣10分、A2受傷每件扣5分」；生活圈需求強度修正為「服務人口 20% ＋ POI 設施 80%」。")
    add_body("4. 無道路資料防呆攔截：當框選範圍內查無道路路網與人行步道（如湖面水域、未開闢荒地）時，後端即時攔截並回傳提示，前端不核發基礎分、不呈現分析卡片，杜絕無效評鑑。")

    add_heading_1("四、 UI / UX 空間互動優化與設計指示")
    add_body("1. 地圖視角最大化：側欄採可收合抽屜式設計，預設給予地圖最寬廣之視野；分析成果面板支援半屏檢視與滑動收合，在平板與手機上均不遮擋地圖中央焦點。")
    add_body("2. 雙軌操作控制與狀態清除：於手繪框選面板配置「結束框選」與「清除框選」專屬成對按鈕；切換分頁或分析失敗時自動清除圖面殘留幾何，提供全站一致之操作直覺。")
    add_body("3. 行動端圖表精簡優化：手機版生活機能圓餅圖隱藏側邊易重疊之文字圖例，將圓餅圖置中展示，點擊扇區即可浮現類別名稱、處數與占比，搭配下方完整表格，兼顧美觀與完整性。")
    add_body("4. 彈跳視窗關閉防呆：道路點選 Popup 底部配置顯著實體「關閉 ✕」按鈕，並支援點擊地圖任意空白處關閉，徹底解決觸控螢幕因點擊判定狹窄導致視窗關不起來之痛點。")

    add_heading_1("五、 實務維運常見狀況與因應之道")
    add_body("1. 雲端出站流量消耗過快警訊（如 Render 5GB 上限）：")
    add_body("• 肇因分析：實體人行道圖資 (sidewalk.geojson) 達 159 MB，每次網頁開啟若全量下載，20~25 次瀏覽即可耗盡 5 GB 免費流量。")
    add_body("• 解決對策：後端啟用 Gzip 壓縮傳輸（傳輸量縮小 70% 至 49 MB）並配置 7 天瀏覽器長效快取 (Cache-Control: public, max-age=604800, immutable)。同一設備載入一次後，後續演示與重新整理完全 0 流量消耗。")
    add_body("2. 大範圍圖資導致瀏覽器卡頓：採用幾何拓撲簡化 (Douglas-Peucker 5 公尺容差) 並剔除冗餘屬性欄位，使向量檔案縮小 60% 以上且渲染流暢。")
    add_body("3. 內部專案防搜尋引擎爬取外洩：於 HTML <head> 注入 <meta name='robots' content='noindex, nofollow, noarchive, nosnippet'>，強制禁止全球搜尋引擎收錄與快取，確保非公開專案安全。")

    doc.save(DOCX_PATH)
    print(f"✅ 成功產製 Word 說明文件：{DOCX_PATH}")


if __name__ == "__main__":
    create_pptx()
    create_docx()
