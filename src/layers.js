// ========================================================================
// 【圖層管理、透明度調節、七大分類 POI 渲染與 Pop Up 模組】
// ========================================================================

class LayerManager {
  constructor(mapInstance) {
    this.mapInstance = mapInstance;
    this.map = mapInstance.map;
    this.currentCounty = mapInstance.currentCounty;
    this.loadedLayers = new Set();
    this.currentPopup = null;
    this.roadFeatures = []; // 用於全域搜尋路名
  }

  async loadCountyLayers(countyKey) {
    this.currentCounty = countyKey;
    const countyConf = window.APP_CONFIG.counties[countyKey];
    if (!countyConf || !countyConf.layers) return;

    // 先初始化分析高亮圖層與滑鼠互動
    this.initAnalysisHighlightLayers();
    this.bindClickEvents();

    const layersConf = countyConf.layers;

    // 1. 第一優先：載入 12 公尺以上道路改善成果線圖層 (僅 3.9 MB / gzip 1.1 MB，即時繪製全圖並建立路名搜尋索引)
    if (layersConf.roadPriority) {
      await this.loadSpecificLayer('roadPriority', layersConf.roadPriority.visible);
    }

    // 2. 第二優先：非同步背景載入人行道實體圖層 (由 MapLibre WebWorker 背景加載，不阻塞主線程 UI)
    if (layersConf.sidewalk && layersConf.sidewalk.visible) {
      this.loadSpecificLayer('sidewalk', true).catch(err => {
        console.warn('[LayerManager] 人行道圖層非同步載入異常:', err);
      });
    }

    // 3. 平滑非同步預載其餘預設關閉圖層 (依序排隊，避免搶佔主線程與網路資源)
    const lazyKeys = ['townBoundary', 'villageBoundary', 'accidents', 'poi', 'population'];
    let delay = 250;
    for (const key of lazyKeys) {
      if (layersConf[key]) {
        setTimeout(() => {
          if (!this.loadedLayers.has(layersConf[key].id)) {
            this.loadSpecificLayer(key, false).catch(() => {});
          }
        }, delay);
        delay += 250;
      }
    }
    console.log(`[LayerManager] ${countyConf.name} 核心圖層已啟動載入！`);
  }

  isLayerLoaded(layerId) {
    return this.loadedLayers.has(layerId) && !!this.map.getLayer(layerId);
  }

  async loadByLayerId(layerId, visible = true) {
    const countyConf = window.APP_CONFIG.counties[this.currentCounty];
    if (!countyConf || !countyConf.layers) return;
    for (const [key, conf] of Object.entries(countyConf.layers)) {
      if (conf.id === layerId) {
        return await this.loadSpecificLayer(key, visible);
      }
    }
  }

  async loadSpecificLayer(key, visible = true) {
    const countyConf = window.APP_CONFIG.counties[this.currentCounty];
    if (!countyConf || !countyConf.layers) return;
    const conf = countyConf.layers[key];
    if (!conf) return;

    const dataPath = countyConf.dataPath;
    const fileUrl = `${dataPath}/${conf.file}`;
    const opacity = conf.defaultOpacity;

    switch (key) {
      case 'roadPriority':
        await this.addRoadPriorityLayer(conf.id, fileUrl, visible, opacity);
        break;
      case 'sidewalk':
        await this.addSidewalkLayer(conf.id, fileUrl, visible, opacity);
        break;
      case 'accidents':
        await this.addAccidentsLayer(conf.id, fileUrl, visible, opacity);
        break;
      case 'poi':
        await this.addPoiLayer(conf.id, fileUrl, visible, opacity);
        break;
      case 'population':
        await this.addPolygonLayer(conf.id, fileUrl, visible, opacity);
        break;
      case 'townBoundary':
        await this.addTownBoundaryLayer(conf.id, fileUrl, visible, opacity);
        break;
      case 'villageBoundary':
        await this.addVillageBoundaryLayer(conf.id, fileUrl, visible, opacity);
        break;
    }
  }

  bindLayerInteractivity(layerId) {
    if (!this.map.getLayer(layerId)) return;
    if (!this._boundInteractions) this._boundInteractions = new Set();
    if (this._boundInteractions.has(layerId)) return;
    this._boundInteractions.add(layerId);

    this.map.on('mouseenter', layerId, () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', layerId, () => {
      this.map.getCanvas().style.cursor = '';
    });
    this.map.on('click', layerId, (e) => {
      if (!e.features || !e.features[0]) return;
      const feat = e.features[0];
      const props = feat.properties;
      this.showMapPopup(e.lngLat, layerId, props);
      window.dispatchEvent(new CustomEvent('object-selected', {
        detail: { layerId, properties: props, lngLat: e.lngLat }
      }));
    });
  }

  // 1. 道路優先度圖層
  async addRoadPriorityLayer(layerId, url, visible, defaultOpacity = 0.85) {
    const sourceId = `${layerId}-src`;
    if (this.map.getSource(sourceId)) return;

    try {
      const resp = await fetch(url);
      const data = await resp.json();
      this.roadFeatures = data.features || [];
      this.map.addSource(sourceId, { type: 'geojson', data });

      this.map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          'visibility': visible ? 'visible' : 'none'
        },
        paint: {
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            11, 2.5,
            15, 6
          ],
          'line-color': [
            'step', ['get', 'I_TOTAL'],
            '#2ecc71',
            35, '#f1c40f',
            50, '#e67e22',
            70, '#e74c3c'
          ],
          'line-opacity': defaultOpacity
        }
      });

      // 道路沿線路名標註 (細看時 Zoom >= 14 顯示)
      this.map.addLayer({
        id: `${layerId}-label`,
        type: 'symbol',
        source: sourceId,
        minzoom: 14,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'ROADNAME_F'],
          'text-size': 12,
          'text-keep-upright': true,
          'text-max-angle': 30,
          'visibility': visible ? 'visible' : 'none'
        },
        paint: {
          'text-color': '#1e3a8a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
        }
      });

      this.loadedLayers.add(layerId);
      this.loadedLayers.add(`${layerId}-label`);
      this.bindLayerInteractivity(layerId);
    } catch (e) {
      console.warn(`[LayerManager] 載入道路圖層失敗:`, e);
    }
  }

  // 2. 人行道實體面圖層 (Polygon 實體鋪面填色 ＋ 輪廓描邊)
  async addSidewalkLayer(layerId, url, visible, defaultOpacity = 0.75) {
    const sourceId = `${layerId}-src`;
    if (this.map.getSource(sourceId)) {
      if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
      if (this.map.getLayer(`${layerId}-outline`)) {
        this.map.setLayoutProperty(`${layerId}-outline`, 'visibility', visible ? 'visible' : 'none');
      }
      return;
    }

    try {
      const fullUrl = new URL(url, window.location.href).href;
      this.map.addSource(sourceId, {
        type: 'geojson',
        data: fullUrl,
        tolerance: 0.8,
        buffer: 0
      });

      // (1) 實體面填色圖層 (Fill) - 低飽和度舒適配色
      this.map.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        layout: {
          'visibility': visible ? 'visible' : 'none'
        },
        paint: {
          // 淨寬不足 1.5m 著柔和淺紅 (#e57373)，合規著柔和淺綠 (#81c784)
          'fill-color': [
            'case',
            ['<', ['get', 'SWW_WTH'], 1.5], '#e57373', // 淨寬不足 1.5m 柔和淺紅
            '#81c784'                                 // 淨寬合規柔和淺綠
          ],
          'fill-opacity': defaultOpacity
        }
      });

      // (2) 實體面邊框描邊圖層 (Outline Line) - 低對比柔和邊框
      this.map.addLayer({
        id: `${layerId}-outline`,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          'visibility': visible ? 'visible' : 'none'
        },
        paint: {
          'line-color': [
            'case',
            ['<', ['get', 'SWW_WTH'], 1.5], '#ef5350', // 淺紅邊框
            '#4caf50'                                 // 淺綠邊框
          ],
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            13, 0.8,
            16, 1.6
          ],
          'line-opacity': Math.min(1.0, defaultOpacity + 0.15)
        }
      });

      this.loadedLayers.add(layerId);
      this.loadedLayers.add(`${layerId}-outline`);
      this.bindLayerInteractivity(layerId);
    } catch (e) {
      console.warn(`[LayerManager] 載入人行道圖層失敗:`, e);
    }
  }

  // 註冊地圖自訂三角形向量圖標 (A1 死亡 / A2 受傷)
  registerCustomIcons() {
    const icons = [
      { id: 'icon-accident-a1', color: '#dc2626' }, // A1 鮮紅
      { id: 'icon-accident-a2', color: '#ea580c' }  // A2 鮮橘
    ];

    icons.forEach(ic => {
      if (this.map.hasImage(ic.id)) return;
      const size = 36;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const pad = 3;

      // 繪製正三角形 (警告標誌三角)
      ctx.beginPath();
      ctx.moveTo(size / 2, pad);
      ctx.lineTo(size - pad, size - pad);
      ctx.lineTo(pad, size - pad);
      ctx.closePath();

      ctx.fillStyle = ic.color;
      ctx.fill();

      // 白色鮮明外框
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // 警告驚嘆號標記
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', size / 2, size * 0.65);

      const imgData = ctx.getImageData(0, 0, size, size);
      this.map.addImage(ic.id, imgData);
    });
  }

  // 3. 事故點圖層 (A1 死亡 / A2 受傷 - 🔺 警示三角形符號)
  async addAccidentsLayer(layerId, url, visible, defaultOpacity = 0.9) {
    const sourceId = `${layerId}-src`;
    if (this.map.getSource(sourceId)) {
      if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
      return;
    }

    try {
      this.registerCustomIcons();
      const fullUrl = new URL(url, window.location.href).href;
      this.map.addSource(sourceId, { type: 'geojson', data: fullUrl });

      this.map.addLayer({
        id: layerId,
        type: 'symbol',
        source: sourceId,
        layout: {
          'visibility': visible ? 'visible' : 'none',
          'icon-image': [
            'match', ['get', 'ACC_TYPE'],
            'A1', 'icon-accident-a1',
            'icon-accident-a2'
          ],
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            11, 0.45,
            13, 0.65,
            16, 0.85
          ],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        },
        paint: {
          'icon-opacity': defaultOpacity
        }
      });
      this.loadedLayers.add(layerId);
      this.bindLayerInteractivity(layerId);
    } catch (e) {
      console.warn(`[LayerManager] 載入事故圖層失敗:`, e);
    }
  }

  // 4. POI 設施點圖層 (臺灣通用電子地圖七大分類配色)
  async addPoiLayer(layerId, url, visible, defaultOpacity = 0.85) {
    const sourceId = `${layerId}-src`;
    if (this.map.getSource(sourceId)) {
      if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
      return;
    }

    try {
      const fullUrl = new URL(url, window.location.href).href;
      this.map.addSource(sourceId, { type: 'geojson', data: fullUrl });

      // 七大分類色彩表達式
      const colorExpression = [
        'match',
        ['get', 'TYPE'],
        '生活機能機構及設施', '#e84393', // 洋紅/粉
        '公共及休閒場所',     '#00b894', // 綠
        '交通運輸設施',       '#f39c12', // 橙
        '文教機關及場所',     '#6c5ce7', // 紫
        '醫療保健及社福機構', '#eb4d4b', // 紅
        '政府機關及機構',     '#0984e3', // 藍
        '其他地標',           '#636e72', // 灰
        '#74b9ff' // fallback
      ];

      this.map.addLayer({
        id: layerId,
        type: 'circle',
        source: sourceId,
        layout: {
          'visibility': visible ? 'visible' : 'none'
        },
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            12, 3.5,
            16, 7
          ],
          'circle-color': colorExpression,
          'circle-stroke-width': 1.2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': defaultOpacity
        }
      });
      this.loadedLayers.add(layerId);
      this.bindLayerInteractivity(layerId);
    } catch (e) {
      console.warn(`[LayerManager] 載入 POI 圖層失敗:`, e);
    }
  }

  // 5. 最小統計區面圖層
  async addPolygonLayer(layerId, url, visible, defaultOpacity = 0.25) {
    const sourceId = `${layerId}-src`;
    if (this.map.getSource(sourceId)) {
      if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
      return;
    }

    try {
      const fullUrl = new URL(url, window.location.href).href;
      this.map.addSource(sourceId, { type: 'geojson', data: fullUrl });

      this.map.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        layout: {
          'visibility': visible ? 'visible' : 'none'
        },
        paint: {
          'fill-color': '#6c5ce7',
          'fill-opacity': defaultOpacity,
          'fill-outline-color': '#a29bfe'
        }
      });
      this.loadedLayers.add(layerId);
      this.bindLayerInteractivity(layerId);
    } catch (e) {
      console.warn(`[LayerManager] 載入統計區失敗:`, e);
    }
  }

  // 6. 高雄市區界線圖層 (38 區)
  async addTownBoundaryLayer(layerId, url, visible, defaultOpacity = 0.85) {
    const sourceId = `${layerId}-src`;
    if (this.map.getSource(sourceId)) {
      if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
      if (this.map.getLayer(`${layerId}-fill`)) {
        this.map.setLayoutProperty(`${layerId}-fill`, 'visibility', visible ? 'visible' : 'none');
      }
      if (this.map.getLayer(`${layerId}-label`)) {
        this.map.setLayoutProperty(`${layerId}-label`, 'visibility', visible ? 'visible' : 'none');
      }
      return;
    }

    try {
      const fullUrl = new URL(url, window.location.href).href;
      this.map.addSource(sourceId, { type: 'geojson', data: fullUrl });

      // 透明填色層（便於滑鼠點擊判定）
      this.map.addLayer({
        id: `${layerId}-fill`,
        type: 'fill',
        source: sourceId,
        layout: { 'visibility': visible ? 'visible' : 'none' },
        paint: {
          'fill-color': '#000000',
          'fill-opacity': 0.0
        }
      });

      // 區界邊線 (深灰粗線 2.2px)
      this.map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          'visibility': visible ? 'visible' : 'none'
        },
        paint: {
          'line-color': '#1e293b',
          'line-width': 2.2,
          'line-opacity': defaultOpacity
        }
      });

      // 行政區名標註 (Zoom 10 ~ 13 大比例尺/廣域顯示)
      this.map.addLayer({
        id: `${layerId}-label`,
        type: 'symbol',
        source: sourceId,
        minzoom: 10,
        maxzoom: 13,
        layout: {
          'text-field': ['get', 'TOWNNAME'],
          'text-size': 14,
          'text-anchor': 'center',
          'text-font': ['Noto Sans Regular', 'Open Sans Regular'],
          'visibility': visible ? 'visible' : 'none'
        },
        paint: {
          'text-color': '#1e293b',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
        }
      });

      this.loadedLayers.add(layerId);
      this.loadedLayers.add(`${layerId}-fill`);
      this.loadedLayers.add(`${layerId}-label`);
      this.bindLayerInteractivity(`${layerId}-fill`);
    } catch (e) {
      console.warn(`[LayerManager] 載入區界失敗:`, e);
    }
  }

  // 7. 高雄市村里界線圖層 (904 里)
  async addVillageBoundaryLayer(layerId, url, visible, defaultOpacity = 0.65) {
    const sourceId = `${layerId}-src`;
    if (this.map.getSource(sourceId)) {
      if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
      if (this.map.getLayer(`${layerId}-fill`)) {
        this.map.setLayoutProperty(`${layerId}-fill`, 'visibility', visible ? 'visible' : 'none');
      }
      if (this.map.getLayer(`${layerId}-label`)) {
        this.map.setLayoutProperty(`${layerId}-label`, 'visibility', visible ? 'visible' : 'none');
      }
      return;
    }

    try {
      const fullUrl = new URL(url, window.location.href).href;
      this.map.addSource(sourceId, { type: 'geojson', data: fullUrl });

      // 透明填色層（便於滑鼠點擊判定）
      this.map.addLayer({
        id: `${layerId}-fill`,
        type: 'fill',
        source: sourceId,
        layout: { 'visibility': visible ? 'visible' : 'none' },
        paint: {
          'fill-color': '#000000',
          'fill-opacity': 0.0
        }
      });

      // 村里界邊線 (灰藍色虛線 1.2px)
      this.map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          'visibility': visible ? 'visible' : 'none'
        },
        paint: {
          'line-color': '#64748b',
          'line-width': 1.2,
          'line-dasharray': [2, 2],
          'line-opacity': defaultOpacity
        }
      });

      // 村里名標註 (Zoom 13 ~ 16 社區詳情顯示，Zoom >= 16 放大至道路時自動隱藏)
      this.map.addLayer({
        id: `${layerId}-label`,
        type: 'symbol',
        source: sourceId,
        minzoom: 13,
        maxzoom: 16,
        layout: {
          'text-field': ['get', 'VILLNAME'],
          'text-size': 11.5,
          'text-anchor': 'center',
          'text-font': ['Noto Sans Regular', 'Open Sans Regular'],
          'visibility': visible ? 'visible' : 'none'
        },
        paint: {
          'text-color': '#0f766e',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5
        }
      });

      this.loadedLayers.add(layerId);
      this.loadedLayers.add(`${layerId}-fill`);
      this.loadedLayers.add(`${layerId}-label`);
      this.bindLayerInteractivity(`${layerId}-fill`);
    } catch (e) {
      console.warn(`[LayerManager] 載入村里界失敗:`, e);
    }
  }

  // 控制圖層開關 (若尚未載入則即時自動載入)
  async toggleLayer(layerId, visible) {
    if (visible && !this.isLayerLoaded(layerId)) {
      await this.loadByLayerId(layerId, true);
    }

    if (this.map.getLayer(layerId)) {
      this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
    if (this.map.getLayer(`${layerId}-outline`)) {
      this.map.setLayoutProperty(`${layerId}-outline`, 'visibility', visible ? 'visible' : 'none');
    }
    if (this.map.getLayer(`${layerId}-fill`)) {
      this.map.setLayoutProperty(`${layerId}-fill`, 'visibility', visible ? 'visible' : 'none');
    }
    if (this.map.getLayer(`${layerId}-label`)) {
      this.map.setLayoutProperty(`${layerId}-label`, 'visibility', visible ? 'visible' : 'none');
    }
  }

  // 調整圖層透明度 (0.0 ~ 1.0)
  setLayerOpacity(layerId, opacity) {
    const val = parseFloat(opacity);
    const propMap = {
      'line': 'line-opacity',
      'fill': 'fill-opacity',
      'circle': 'circle-opacity',
      'symbol': 'icon-opacity',
      'raster': 'raster-opacity'
    };

    if (this.map.getLayer(layerId)) {
      const type = this.map.getLayer(layerId).type;
      const prop = propMap[type];
      if (prop) this.map.setPaintProperty(layerId, prop, val);
    }
    if (this.map.getLayer(`${layerId}-outline`)) {
      this.map.setPaintProperty(`${layerId}-outline`, 'line-opacity', Math.min(1.0, val + 0.2));
    }
  }

  // 依七大類別動態篩選 POI 點位
  filterPoiCategories(activeCategories) {
    const layerId = 'layer-poi';
    if (!this.map.getLayer(layerId)) return;

    const allCategories = Object.keys(window.APP_CONFIG.poiCategories);
    if (!activeCategories || activeCategories.length === 0) {
      // 全不勾選：隱藏所有點位
      this.map.setFilter(layerId, ['==', ['get', 'TYPE'], '___NONE___']);
    } else if (activeCategories.length === allCategories.length) {
      // 全部勾選：清除篩選條件
      this.map.setFilter(layerId, null);
    } else {
      // 依勾選類別陣列篩選
      this.map.setFilter(layerId, ['in', ['get', 'TYPE'], ['literal', activeCategories]]);
    }
  }

  // 依 A1 / A2 事故等級動態篩選
  filterAccidentTypes(activeTypes) {
    const layerId = 'layer-accidents';
    if (!this.map.getLayer(layerId)) return;

    if (!activeTypes || activeTypes.length === 0) {
      this.map.setFilter(layerId, ['==', ['get', 'ACC_TYPE'], '___NONE___']);
    } else if (activeTypes.length === 2) {
      this.map.setFilter(layerId, null);
    } else {
      this.map.setFilter(layerId, ['in', ['get', 'ACC_TYPE'], ['literal', activeTypes]]);
    }
  }

  // 初始化分析範圍專屬高亮圖層 (即便全域圖層關閉，範圍內點位亦能清晰展現)
  initAnalysisHighlightLayers() {
    this.registerCustomIcons();

    if (!this.map.getSource('analysis-highlight-poi-src')) {
      this.map.addSource('analysis-highlight-poi-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }

    if (!this.map.getSource('analysis-highlight-accidents-src')) {
      this.map.addSource('analysis-highlight-accidents-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }

    if (!this.map.getLayer('analysis-highlight-poi')) {
      const matchColors = ['match', ['get', 'TYPE']];
      Object.entries(window.APP_CONFIG.poiCategories).forEach(([type, conf]) => {
        matchColors.push(type, conf.color);
      });
      matchColors.push('#636e72');

      this.map.addLayer({
        id: 'analysis-highlight-poi',
        type: 'circle',
        source: 'analysis-highlight-poi-src',
        paint: {
          'circle-color': matchColors,
          'circle-radius': 6,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });
    }

    if (!this.map.getLayer('analysis-highlight-accidents-glow')) {
      this.map.addLayer({
        id: 'analysis-highlight-accidents-glow',
        type: 'circle',
        source: 'analysis-highlight-accidents-src',
        paint: {
          'circle-color': [
            'match', ['get', 'ACC_TYPE'],
            'A1', '#ef4444',
            '#f59e0b'
          ],
          'circle-radius': 13,
          'circle-opacity': 0.35
        }
      });
    }

    if (!this.map.getLayer('analysis-highlight-accidents')) {
      this.map.addLayer({
        id: 'analysis-highlight-accidents',
        type: 'symbol',
        source: 'analysis-highlight-accidents-src',
        layout: {
          'icon-image': [
            'match', ['get', 'ACC_TYPE'],
            'A1', 'icon-accident-a1',
            'icon-accident-a2'
          ],
          'icon-size': 0.85,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        },
        paint: {
          'icon-opacity': 1.0
        }
      });
    }
  }

  showAnalysisHighlights(accidentsGeojson, poiGeojson) {
    this.initAnalysisHighlightLayers();

    const accSrc = this.map.getSource('analysis-highlight-accidents-src');
    if (accSrc && accidentsGeojson) {
      accSrc.setData(accidentsGeojson);
    }

    const poiSrc = this.map.getSource('analysis-highlight-poi-src');
    if (poiSrc && poiGeojson) {
      poiSrc.setData(poiGeojson);
    }
  }

  clearAnalysisHighlights() {
    const accSrc = this.map.getSource('analysis-highlight-accidents-src');
    if (accSrc) accSrc.setData({ type: 'FeatureCollection', features: [] });

    const poiSrc = this.map.getSource('analysis-highlight-poi-src');
    if (poiSrc) poiSrc.setData({ type: 'FeatureCollection', features: [] });
  }

  // 點擊 Pop Up 與屬性聯動
  bindClickEvents() {
    this.initAnalysisHighlightLayers();

    const interactiveLayers = [
      'layer-road-priority',
      'layer-sidewalk',
      'layer-accidents',
      'analysis-highlight-accidents',
      'layer-poi',
      'analysis-highlight-poi',
      'layer-population',
      'layer-town-boundary-fill',
      'layer-village-boundary-fill'
    ];

    interactiveLayers.forEach(layerId => {
      this.map.on('mouseenter', layerId, () => {
        this.map.getCanvas().style.cursor = 'pointer';
      });
      this.map.on('mouseleave', layerId, () => {
        this.map.getCanvas().style.cursor = '';
      });

      this.map.on('click', layerId, (e) => {
        if (!e.features || !e.features[0]) return;
        const feat = e.features[0];
        const props = feat.properties;

        // 1. 於地圖上展示即時 HTML Pop Up
        this.showMapPopup(e.lngLat, layerId, props);

        // 2. 同步觸發右側抽屜面板
        window.dispatchEvent(new CustomEvent('object-selected', {
          detail: { layerId, properties: props, lngLat: e.lngLat }
        }));
      });
    });
  }

  showMapPopup(lngLat, layerId, props) {
    if (this.currentPopup) {
      this.currentPopup.remove();
    }

    let html = "";
    if (layerId === 'layer-town-boundary-fill') {
      html = `
        <div style="font-size: 14px; min-width: 180px; line-height: 1.6;">
          <div style="font-weight: bold; color: #1e293b; font-size: 15px; margin-bottom: 4px;">行政區界</div>
          <div>行政區名: <strong style="color: #2563eb; font-size: 16px;">${props.TOWNNAME || '-'}</strong></div>
          <div style="color: #64748b; font-size: 12px; margin-top: 3px;">代碼: ${props.TOWNCODE || '-'}</div>
        </div>
      `;
    } else if (layerId === 'layer-village-boundary-fill') {
      let villNameDisplay = props.VILLNAME;
      let specialNote = "";
      if (!villNameDisplay || villNameDisplay === '-' || villNameDisplay === 'None') {
        const code = String(props.VILLCODE || '');
        if (code.includes('S')) {
          villNameDisplay = '<span style="color: #ea580c; font-weight: bold;">未編定村里 (軍事用地／要塞管制區)</span>';
          specialNote = '<div style="font-size: 11px; color: #64748b; margin-top: 4px; line-height: 1.4; background: #fff7ed; padding: 4px 6px; border-radius: 4px; border: 1px solid #ffedd5;">國防軍事基地或管制用地（如岡山空軍官校與基地營區），依國土測繪中心標準不編設民政村里。</div>';
        } else if (code.includes('I')) {
          villNameDisplay = '<span style="color: #0284c7; font-weight: bold;">未編定村里 (外海島嶼／礁石)</span>';
          specialNote = '<div style="font-size: 11px; color: #64748b; margin-top: 4px; line-height: 1.4; background: #f0f9ff; padding: 4px 6px; border-radius: 4px; border: 1px solid #e0f2fe;">轄區外海附屬島嶼或礁石，無常住人口設里。</div>';
        } else if (code.includes('P')) {
          villNameDisplay = '<span style="color: #0d9488; font-weight: bold;">未編定村里 (港口專用區)</span>';
          specialNote = '<div style="font-size: 11px; color: #64748b; margin-top: 4px; line-height: 1.4;">商港或特定港務管制專區。</div>';
        } else if (code.includes('R')) {
          villNameDisplay = '<span style="color: #0284c7; font-weight: bold;">未編定村里 (河川水利區)</span>';
          specialNote = '<div style="font-size: 11px; color: #64748b; margin-top: 4px; line-height: 1.4;">主要河川水利地或未登錄行水區。</div>';
        } else {
          villNameDisplay = '<span style="color: #64748b; font-weight: bold;">未編定村里 (特殊公有地)</span>';
          specialNote = '<div style="font-size: 11px; color: #64748b; margin-top: 4px; line-height: 1.4;">特殊管制或公有地，不編設村里。</div>';
        }
      } else {
        villNameDisplay = `<strong style="color: #0d9488; font-size: 15px;">${villNameDisplay}</strong>`;
      }

      html = `
        <div style="font-size: 14px; min-width: 200px; max-width: 280px; line-height: 1.6;">
          <div style="font-weight: bold; color: #1e293b; font-size: 15px; margin-bottom: 4px;">村里界線</div>
          <div>所屬行政區: <strong>${props.TOWNNAME || '-'}</strong></div>
          <div>村里名稱: ${villNameDisplay}</div>
          <div style="color: #64748b; font-size: 12px; margin-top: 3px;">村里代碼: ${props.VILLCODE || '-'}</div>
          ${specialNote}
        </div>
      `;
    } else if (layerId === 'layer-poi' || layerId === 'analysis-highlight-poi') {
      const typeInfo = window.APP_CONFIG.poiCategories[props.TYPE] || { color: '#636e72', label: props.TYPE };
      const isRare = props.IS_SCOREABLE === 0 || props.IS_SCOREABLE === '0';
      const rareTag = isRare ? `<div style="margin-top: 4px;"><span style="background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 2px 6px; border-radius: 4px; font-size: 12px;">[稀少特例] 不納入生活圈豐富度計分</span></div>` : '';

      html = `
        <div style="font-size: 14px; min-width: 230px; line-height: 1.6;">
          <div style="font-weight: bold; font-size: 15px; margin-bottom: 5px; color: #1e293b;">
            ${props.POI_NAME || '未命名地標'}
          </div>
          <div style="margin-bottom: 6px;">
            <span style="background: ${typeInfo.color}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: bold;">
              ${props.TYPE || '未分類'}
            </span>
            <span style="color: #64748b; font-size: 12px; margin-left: 4px;">
              ${props.SUB_CLASS || ''}
            </span>
          </div>
          ${rareTag}
          <div style="color: #475569; font-size: 13px; margin-top: 5px;">
            <div>資料來源: <strong>${props.SOURCE || '通用版電子地圖'}</strong></div>
            <div>行政區: ${props.TOWNNAME || '-'}</div>
          </div>
        </div>
      `;
    } else if (layerId === 'layer-sidewalk') {
      const isOk = (props.SWW_WTH || 0) >= 1.5;
      html = `
        <div style="font-size: 14px; min-width: 220px; line-height: 1.6;">
          <div style="font-weight: bold; color: #1e293b; margin-bottom: 5px; font-size: 15px;">人行道路段: ${props.NAME || '未命名'}</div>
          <div>有效淨寬: <strong style="color: ${isOk ? '#27ae60' : '#e74c3c'};">${props.SWW_WTH || 0} m</strong> (${isOk ? '合規' : '淨寬不足'})</div>
          <div>人行道寬: ${props.SW_WTH || 0} m</div>
          <div>鋪面材質: ${props.SW_PAVE || '一般'}</div>
        </div>
      `;
    } else if (layerId === 'layer-accidents' || layerId === 'analysis-highlight-accidents') {
      html = `
        <div style="font-size: 14px; min-width: 220px; line-height: 1.6;">
          <div style="font-weight: bold; color: ${props.ACC_TYPE === 'A1' ? '#e74c3c' : '#f39c12'}; font-size: 15px;">${props.ACC_TYPE} 類事故 (${props.YEAR}年)</div>
          <div>死傷人數: 死亡 ${props.DEAD_CNT || 0} 人 / 受傷 ${props.INJ_CNT || 0} 人</div>
          <div style="color: #64748b; font-size: 12px; margin-top: 3px;">地點: ${props.LOCATION || '-'}</div>
        </div>
      `;
    } else if (layerId === 'layer-road-priority') {
      html = `
        <div style="font-size: 14px; min-width: 280px; line-height: 1.6;">
          <div style="font-weight: bold; color: #1e293b; font-size: 15px; margin-bottom: 4px;">12公尺以上道路人本交通環境評估</div>
          <div>路廊路段: <strong>${props.ROADNAME_F || '未命名'}</strong></div>
          <div>環境評估分: <strong style="color: #e74c3c;">${props.I_TOTAL || 0} 分</strong></div>
          <div style="white-space: nowrap;">評估優先度: <strong>${props.PRIORITY || '-'}</strong> <span style="color: #475569; font-size: 13px;">(第 ${props.RANK || '-'} 名)</span></div>
        </div>
      `;
    }

    // 行動端/觸控裝置優化：取消地圖畫布上的氣泡跳出，由底部抽屜卡片專屬承載，以「不影響圖面操作為最大原則」
    const isMobile = (window.MobileUI && window.MobileUI.isMobile()) || 
                     (window.innerWidth <= 820) || 
                     (window.matchMedia('(pointer: coarse)').matches);

    if (isMobile) {
      // 行動端不建立地圖氣泡 Pop up，保持圖面 100% 潔淨無遮擋
      return;
    }

    if (html) {
      this.currentPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 12, maxWidth: '360px' })
        .setLngLat(lngLat)
        .setHTML(html)
        .addTo(this.map);
    }
  }

  // 搜尋道路名稱並飛往定位高亮
  searchAndFlyToRoad(roadName) {
    if (!roadName || !this.roadFeatures.length) return false;
    const target = roadName.trim().toLowerCase();
    
    // 模糊搜尋候選路段
    const matched = this.roadFeatures.find(f => {
      const name = (f.properties.ROADNAME_F || "").toLowerCase();
      return name.includes(target);
    });

    if (matched && matched.geometry) {
      // 計算外框 bbox
      const bbox = turf.bbox(matched);
      this.map.fitBounds(bbox, { padding: 80, maxZoom: 16 });

      // 高亮標記
      const center = turf.center(matched).geometry.coordinates;
      this.showMapPopup(center, 'layer-road-priority', matched.properties);
      return true;
    }
    return false;
  }
}

window.LayerManager = LayerManager;
