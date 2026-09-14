# -*- coding: utf-8 -*-
"""
========================================================================================
【七大類 POI 分類與過濾標準】
1. 鄰避設施 (殯儀館、火化場、公墓等): 徹底剔除 (不顯示、不分類、不計分)
2. 稀少/非日常設施 (市政府、遊樂園、展覽館、動物園等): 圖面保留顯示，排除於豐富度計分
========================================================================================
"""
import re

NLSC_PREFIX_MAP = {
    '991': '政府機關及機構',
    '992': '文教機關及場所',
    '993': '醫療保健及社福機構',
    '935': '醫療保健及社福機構',
    '994': '公共及休閒場所',
    '995': '生活機能機構及設施',
    '998': '生活機能機構及設施',
    '996': '交通運輸設施',
    '946': '交通運輸設施',
    '999': '其他地標',
    '937': '其他地標'
}

OSM_TAG_MAP = {
    'restaurant': '生活機能機構及設施',
    'cafe': '生活機能機構及設施',
    'beverages': '生活機能機構及設施',
    'fast_food': '生活機能機構及設施',
    'convenience': '生活機能機構及設施',
    'supermarket': '生活機能機構及設施',
    'bank': '生活機能機構及設施',
    'atm': '生活機能機構及設施',
    'post_office': '生活機能機構及設施',
    'marketplace': '生活機能機構及設施',
    'bakery': '生活機能機構及設施',
    'shop': '生活機能機構及設施',
    'mall': '生活機能機構及設施',
    'fuel': '生活機能機構及設施',
    'pharmacy': '醫療保健及社福機構',
    'clinic': '醫療保健及社福機構',
    'hospital': '醫療保健及社福機構',
    'doctors': '醫療保健及社福機構',
    'dentist': '醫療保健及社福機構',
    'social_facility': '醫療保健及社福機構',
    'nursing_home': '醫療保健及社福機構',
    'school': '文教機關及場所',
    'kindergarten': '文教機關及場所',
    'college': '文教機關及場所',
    'university': '文教機關及場所',
    'library': '文教機關及場所',
    'research_institute': '文教機關及場所',
    'park': '公共及休閒場所',
    'playground': '公共及休閒場所',
    'place_of_worship': '公共及休閒場所',
    'temple': '公共及休閒場所',
    'church': '公共及休閒場所',
    'community_centre': '公共及休閒場所',
    'sports_centre': '公共及休閒場所',
    'swimming_pool': '公共及休閒場所',
    'bus_stop': '交通運輸設施',
    'station': '交通運輸設施',
    'subway_entrance': '交通運輸設施',
    'parking': '交通運輸設施',
    'bicycle_parking': '交通運輸設施',
    'ferry_terminal': '交通運輸設施',
    'townhall': '政府機關及機構',
    'courthouse': '政府機關及機構',
    'police': '政府機關及機構',
    'fire_station': '政府機關及機構'
}

# 1. 鄰避設施過濾關鍵字與代碼 (徹底剔除)
NIMBY_KEYWORDS = ['殯儀', '火化', '火葬', '公墓', '墓園', '納骨', '靈骨', '骨灰', '葬儀', '屠宰']
NIMBY_CODES = ['9930203', '9350200', '9950502'] # 殯儀館、公墓、屠宰場

def is_nimby_facility(name, sub_class):
    name_str = str(name).strip()
    sub_str = str(sub_class).strip()
    if sub_str in NIMBY_CODES:
        return True
    for kw in NIMBY_KEYWORDS:
        if kw in name_str:
            return True
    return False

# 2. 稀少/非日常步行生活圈設施 (圖面保留顯示，但不計入生活圈豐富度分數)
# 白名單：絕對 100% 納入日常豐富度計分的設施（避免被市政府等關鍵字誤傷）
SCOREABLE_WHITELIST_KEYWORDS = [
    '派出所', '分駐所', '警察局', '分局', '警察隊', '交通隊', '刑事', '保安隊', '靶場',
    '消防', '消防隊', '分隊',
    '捷運', '輕軌', '公車', '車站', '火車站', '客運', '轉運站', '出入口', '停車場',
    '區公所', '衛生所', '戶政', '地政', '郵局', '農會', '漁會', '學校', '幼兒園', '診所', '醫院'
]

RARE_FACILITY_KEYWORDS = [
    '四維行政中心', '鳳山行政中心', '市政大樓',
    '遊樂園', '主題樂園', '義大遊樂世界',
    '展覽館', '會展中心',
    '衛武營國家藝術文化中心', '衛武營藝術文化中心', '大東文化藝術中心', '文化藝術中心',
    '動物園', '壽山動物園',
    '博覽會', '賽車場', '摩天輪'
]

def is_scoreable_facility(name, sub_class):
    name_str = str(name).strip()
    
    # 優先判斷白名單：警察局/派出所/消防隊/捷運車站等一律納入計分
    for wkw in SCOREABLE_WHITELIST_KEYWORDS:
        if wkw in name_str:
            return 1

    # 單獨精確比對「高雄市政府」本體建築（非下轄局處派出所）
    if name_str in ['高雄市政府', '市政府', '高雄市政大樓']:
        return 0

    for kw in RARE_FACILITY_KEYWORDS:
        if kw in name_str:
            return 0 # 排除計分
            
    return 1 # 納入日常豐富度計分

def classify_poi(sub_class, source, old_type=""):
    sub = str(sub_class).strip()
    src = str(source).strip()
    
    # 通用版電子地圖代碼前綴映射
    if len(sub) >= 3 and sub[:3] in NLSC_PREFIX_MAP:
        return NLSC_PREFIX_MAP[sub[:3]]
        
    # OSM 標籤比對
    if sub.lower() in OSM_TAG_MAP:
        return OSM_TAG_MAP[sub.lower()]
        
    old = str(old_type).strip()
    if '政府' in old:
        return '政府機關及機構'
    if '文教' in old:
        return '文教機關及場所'
    if '醫療' in old:
        return '醫療保健及社福機構'
    if '公共' in old:
        return '公共及休閒場所'
    if '生活' in old:
        return '生活機能機構及設施'
    if '交通' in old:
        return '交通運輸設施'
        
    return '其他地標'
