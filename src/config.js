// ========================================================================
// 【縣市配置與圖資元數據定義 (含通用電子地圖七大分類 POI 標準)】
// ========================================================================

const APP_CONFIG = {
  defaultCounty: "kaohsiung",
  
  // TWD97 (EPSG:3826) 坐標轉換定義
  proj4Defs: {
    EPSG3826: "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
  },

  // 臺灣通用電子地圖地標 (POI) 七大分類標準與專屬色彩規範
  poiCategories: {
    "生活機能機構及設施": { color: "#e84393", label: "生活機能" },
    "公共及休閒場所":     { color: "#00b894", label: "公共休閒" },
    "交通運輸設施":       { color: "#f39c12", label: "交通運輸" },
    "文教機關及場所":     { color: "#6c5ce7", label: "文教場所" },
    "醫療保健及社福機構": { color: "#eb4d4b", label: "醫療社福" },
    "政府機關及機構":     { color: "#0984e3", label: "政府機關" },
    "其他地標":           { color: "#636e72", label: "其他地標" }
  },

  counties: {
    kaohsiung: {
      name: "高雄市",
      center: [120.312, 22.627], // 經度, 緯度
      zoom: 13,
      dataPath: "public/data/kaohsiung",
      layers: {
        roadPriority: {
          id: "layer-road-priority",
          name: "12公尺以上道路人本交通環境評估",
          file: "road_priority.geojson",
          visible: true,
          type: "line",
          defaultOpacity: 0.85
        },
        sidewalk: {
          id: "layer-sidewalk",
          name: "人行道實體普查圖資 (國土署 100% 原始幾何)",
          file: "sidewalk.geojson",
          visible: false,
          type: "fill",
          defaultOpacity: 0.75
        },
        accidents: {
          id: "layer-accidents",
          name: "近三年交通事故點 (A1/A2)",
          file: "accidents.geojson",
          visible: false,
          type: "circle",
          defaultOpacity: 0.9
        },
        poi: {
          id: "layer-poi",
          name: "生活圈 POI 設施 (通用圖七大分類)",
          file: "poi.geojson",
          visible: false,
          type: "circle",
          defaultOpacity: 0.85
        },
        population: {
          id: "layer-population",
          name: "最小統計區人口分佈",
          file: "population_bsa.geojson",
          visible: false,
          type: "fill",
          defaultOpacity: 0.25
        },
        townBoundary: {
          id: "layer-town-boundary",
          name: "高雄市區界 (38區)",
          file: "town_boundary.geojson",
          visible: false,
          type: "line",
          defaultOpacity: 0.85
        },
        villageBoundary: {
          id: "layer-village-boundary",
          name: "高雄市村里界 (904里)",
          file: "village_boundary.geojson",
          visible: false,
          type: "line",
          defaultOpacity: 0.65
        }
      }
    },
    yilan: {
      name: "宜蘭縣 (待載入)",
      center: [121.753, 24.757],
      zoom: 12,
      dataPath: "public/data/yilan",
      layers: {}
    },
    taitung: {
      name: "台東縣 (待載入)",
      center: [121.144, 22.758],
      zoom: 12,
      dataPath: "public/data/taitung",
      layers: {}
    }
  },

  // 內政部國土測繪中心 (NLSC) WMTS 底圖服務
  basemaps: {
    // 1. 主要常用底圖 (按鈕形式切換)
    emap: {
      name: "通用電子地圖",
      url: "https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}",
      attribution: "&copy; 國土測繪中心 NLSC"
    },
    emap01: {
      name: "通用電子地圖 (灰階)",
      url: "https://wmts.nlsc.gov.tw/wmts/EMAP01/default/GoogleMapsCompatible/{z}/{y}/{x}",
      attribution: "&copy; 國土測繪中心 NLSC"
    },
    photo: {
      name: "正射影像圖 (通用)",
      url: "https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}",
      attribution: "&copy; 國土測繪中心 NLSC"
    },

    // 2. 其他底圖 (下拉選單切換)
    emap_nohouse: {
      name: "通用電子地圖 (無門牌)",
      url: "https://wmts.nlsc.gov.tw/wmts/EMAP15/default/GoogleMapsCompatible/{z}/{y}/{x}",
      attribution: "&copy; 國土測繪中心 NLSC"
    },
    emap_withhouse: {
      name: "通用電子地圖 (有門牌+等高線)",
      url: "https://wmts.nlsc.gov.tw/wmts/EMAP5/default/GoogleMapsCompatible/{z}/{y}/{x}",
      attribution: "&copy; 國土測繪中心 NLSC"
    },
    emap_notext: {
      name: "通用電子地圖 (無文字)",
      url: "https://wmts.nlsc.gov.tw/wmts/EMAPX99/default/GoogleMapsCompatible/{z}/{y}/{x}",
      attribution: "&copy; 國土測繪中心 NLSC"
    },
    photo_mix: {
      name: "正射影像圖 (混合標註)",
      url: "https://wmts.nlsc.gov.tw/wmts/PHOTO_MIX/default/GoogleMapsCompatible/{z}/{y}/{x}",
      attribution: "&copy; 國土測繪中心 NLSC"
    },
    topo_b5000: {
      name: "基本地形圖 (1/5000)",
      url: "https://wmts.nlsc.gov.tw/wmts/B5000/default/GoogleMapsCompatible/{z}/{y}/{x}",
      attribution: "&copy; 國土測繪中心 NLSC"
    },
    topo_b25000: {
      name: "基本地形圖 (1/25000)",
      url: "https://wmts.nlsc.gov.tw/wmts/B25000/default/GoogleMapsCompatible/{z}/{y}/{x}",
      attribution: "&copy; 國土測繪中心 NLSC"
    }
  }
};

window.APP_CONFIG = APP_CONFIG;
