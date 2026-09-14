import urllib.request
import json

base_url = 'http://localhost:8090'

# 1. 測試主頁面
resp = urllib.request.urlopen(base_url)
html = resp.read().decode('utf-8')
print("1. Homepage HTTP Status:", resp.status)
print("   - Contains chk-town-boundary:", 'id="chk-town-boundary"' in html)
print("   - Contains chk-village-boundary:", 'id="chk-village-boundary"' in html)
print("   - Contains layer-town-boundary:", 'layer-town-boundary' in html)
print("   - Contains layer-village-boundary:", 'layer-village-boundary' in html)

# 2. 測試區界與村里界 GeoJSON 下載
r_town = urllib.request.urlopen(f"{base_url}/public/data/kaohsiung/town_boundary.geojson")
town_json = json.loads(r_town.read().decode('utf-8'))
print(f"2. Town boundary GeoJSON: {len(town_json.get('features', []))} features (Status: {r_town.status})")

r_vil = urllib.request.urlopen(f"{base_url}/public/data/kaohsiung/village_boundary.geojson")
vil_json = json.loads(r_vil.read().decode('utf-8'))
print(f"3. Village boundary GeoJSON: {len(vil_json.get('features', []))} features (Status: {r_vil.status})")

# 3. 測試 POI GeoJSON
r_poi = urllib.request.urlopen(f"{base_url}/public/data/kaohsiung/poi.geojson")
poi_json = json.loads(r_poi.read().decode('utf-8'))
features = poi_json.get('features', [])
print(f"4. POI total features: {len(features)}")

police_count = 0
police_scoreable = 0
nlsc_with_town = 0
nlsc_total = 0

for f in features:
    props = f.get('properties', {})
    name = str(props.get('POI_NAME') or '')
    src = str(props.get('SOURCE') or '')
    town = props.get('TOWNNAME')
    scoreable = props.get('IS_SCOREABLE')

    if src == '通用版電子地圖':
        nlsc_total += 1
        if town and str(town).strip() not in ['', 'None', 'nan']:
            nlsc_with_town += 1

    if any(k in name for k in ['派出所', '分駐所', '警察局']):
        police_count += 1
        if scoreable == 1 or scoreable == '1':
            police_scoreable += 1

print(f"   - 通用電子地圖點位數: {nlsc_total}, 成功補齊行政區數: {nlsc_with_town} ({nlsc_with_town/nlsc_total*100:.1f}%)")
print(f"   - 派出所/警察局點位數: {police_count}, 納入計分數: {police_scoreable} (符合率: {police_scoreable/police_count*100:.1f}%)")

# 4. 測試空間分析 API
analysis_url = f"{base_url}/api/analysis"
req_data = {
    "polygon": {
        "type": "Polygon",
        "coordinates": [[
            [120.30, 22.62],
            [120.32, 22.62],
            [120.32, 22.64],
            [120.30, 22.64],
            [120.30, 22.62]
        ]]
    },
    "county": "kaohsiung"
}
req = urllib.request.Request(analysis_url, data=json.dumps(req_data).encode('utf-8'), headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as resp_a:
    res = json.loads(resp_a.read().decode('utf-8'))
    print(f"5. Spatial Analysis API: Status {resp_a.status}")
    print(f"   - Total Score: {res.get('score', {}).get('total_score')}")
    print(f"   - POI Count in Box: {res.get('poi', {}).get('total_count')}")
    print(f"   - Sidewalk Length (m): {res.get('sidewalk', {}).get('total_length_m')}")
