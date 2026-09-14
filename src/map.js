// ========================================================================
// 【MapLibre 地圖核心與底圖切換模組】
// ========================================================================

class WebGISMap {
  constructor(containerId = "map") {
    this.containerId = containerId;
    this.map = null;
    this.currentBasemap = "emap";
    this.currentCounty = window.APP_CONFIG.defaultCounty;
  }

  init() {
    const countyConf = window.APP_CONFIG.counties[this.currentCounty];
    
    // 初始化 MapLibre 地圖實例
    this.map = new maplibregl.Map({
      container: this.containerId,
      style: this.createBasemapStyle(this.currentBasemap),
      center: countyConf.center,
      zoom: countyConf.zoom,
      attributionControl: false,
      preserveDrawingBuffer: true
    });

    // 加入原生控制元件 (比例尺、導航羅盤)
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 100 }), 'bottom-right');

    // 監聽滑鼠移動更新底部坐標顯示
    this.map.on('mousemove', (e) => {
      const coordEl = document.getElementById('mouse-coord');
      if (coordEl) {
        coordEl.innerText = `經度: ${e.lngLat.lng.toFixed(5)}°, 緯度: ${e.lngLat.lat.toFixed(5)}°`;
      }
    });

    return new Promise((resolve) => {
      this.map.on('load', () => {
        console.log('[WebGIS] MapLibre 地圖載入完成！');
        resolve(this.map);
      });
    });
  }

  // 構造 NLSC WMTS 柵格底圖 Style
  createBasemapStyle(basemapKey) {
    const bm = window.APP_CONFIG.basemaps[basemapKey] || window.APP_CONFIG.basemaps.emap;
    return {
      version: 8,
      sources: {
        'nlsc-wmts': {
          type: 'raster',
          tiles: [bm.url],
          tileSize: 256,
          attribution: bm.attribution
        }
      },
      layers: [
        {
          id: 'nlsc-basemap-layer',
          type: 'raster',
          source: 'nlsc-wmts',
          minzoom: 0,
          maxzoom: 20
        }
      ]
    };
  }

  // 切換底圖 (通用圖 / 灰階 / 航照)
  setBasemap(basemapKey) {
    if (this.currentBasemap === basemapKey) return;
    this.currentBasemap = basemapKey;
    const bm = window.APP_CONFIG.basemaps[basemapKey];
    if (!bm) return;

    // 取得當前向量圖層與數據源以在切換底圖時保留
    const currentStyle = this.map.getStyle();
    const vectorSources = {};
    const vectorLayers = [];

    if (currentStyle && currentStyle.sources) {
      for (const [k, v] of Object.entries(currentStyle.sources)) {
        if (k !== 'nlsc-wmts') vectorSources[k] = v;
      }
      vectorLayers.push(...(currentStyle.layers || []).filter(l => l.id !== 'nlsc-basemap-layer'));
    }

    const newStyle = {
      version: 8,
      sources: {
        'nlsc-wmts': {
          type: 'raster',
          tiles: [bm.url],
          tileSize: 256,
          attribution: bm.attribution
        },
        ...vectorSources
      },
      layers: [
        {
          id: 'nlsc-basemap-layer',
          type: 'raster',
          source: 'nlsc-wmts',
          minzoom: 0,
          maxzoom: 20
        },
        ...vectorLayers
      ]
    };

    this.map.setStyle(newStyle);
    console.log(`[WebGIS] 底圖已切換至: ${bm.name}`);
  }

  // 切換至指定縣市視角
  flyToCounty(countyKey) {
    const conf = window.APP_CONFIG.counties[countyKey];
    if (!conf) return;
    this.currentCounty = countyKey;
    this.map.flyTo({
      center: conf.center,
      zoom: conf.zoom,
      essential: true
    });
  }
}

window.WebGISMap = WebGISMap;
