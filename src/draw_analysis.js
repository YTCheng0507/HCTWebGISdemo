// ========================================================================
// 【區域框選分析模組：支援橡皮筋引導線多邊形、矩形、圓形框選】
// ========================================================================

class DrawAnalysisTool {
  constructor(mapInstance) {
    this.mapInstance = mapInstance;
    this.map = mapInstance.map;
    this.isDrawing = false;
    this.drawMode = null; // 'polygon' | 'rectangle' | 'circle'
    this.points = [];
    this.currentMouseCoord = null;
    this.sourceId = 'draw-analysis-src';
    this.finishedFeature = null;

    // 事件處理常式參照 (用於 bind / unbind)
    this._onClick = this.handleClick.bind(this);
    this._onMouseMove = this.handleMouseMove.bind(this);
    this._onDblClick = this.handleDblClick.bind(this);
    this._onKeyDown = this.handleKeyDown.bind(this);

    this.initSourceAndLayers();

    // 監聽底圖切換 (style.load) 時重新掛載圖層
    this.map.on('style.load', () => {
      this.initSourceAndLayers();
    });
  }

  initSourceAndLayers() {
    if (!this.map.getSource(this.sourceId)) {
      this.map.addSource(this.sourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }

    // 1. 多邊形半透明填色層
    if (!this.map.getLayer('draw-analysis-fill')) {
      this.map.addLayer({
        id: 'draw-analysis-fill',
        type: 'fill',
        source: this.sourceId,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': '#0284c7',
          'fill-opacity': 0.22
        }
      });
    }

    // 2. 已確認的固定線段 (實線)
    if (!this.map.getLayer('draw-analysis-solid-line')) {
      this.map.addLayer({
        id: 'draw-analysis-solid-line',
        type: 'line',
        source: this.sourceId,
        filter: ['==', 'lineType', 'solid'],
        paint: {
          'line-color': '#0284c7',
          'line-width': 2.8
        }
      });
    }

    // 3. 即時預覽引導線 (橡皮筋虛線 Rubber-band)
    if (!this.map.getLayer('draw-analysis-guide-line')) {
      this.map.addLayer({
        id: 'draw-analysis-guide-line',
        type: 'line',
        source: this.sourceId,
        filter: ['==', 'lineType', 'guide'],
        paint: {
          'line-color': '#0284c7',
          'line-width': 2.2,
          'line-dasharray': [3, 2]
        }
      });
    }

    // 4. 點位端點標記 (錨點圓圈)
    if (!this.map.getLayer('draw-analysis-points')) {
      this.map.addLayer({
        id: 'draw-analysis-points',
        type: 'circle',
        source: this.sourceId,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 5.5,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#0284c7',
          'circle-stroke-width': 2.5
        }
      });
    }
  }

  // --- 1. 啟用自由多邊形繪製 ---
  startPolygonDraw() {
    this.clear();
    this.initSourceAndLayers();
    this.isDrawing = true;
    this.drawMode = 'polygon';
    this.points = [];
    this.currentMouseCoord = null;
    this.map.getCanvas().style.cursor = 'crosshair';
    this.bindEvents();
  }

  // --- 2. 啟用矩形繪製 ---
  startRectangleDraw() {
    this.clear();
    this.initSourceAndLayers();
    this.isDrawing = true;
    this.drawMode = 'rectangle';
    this.points = [];
    this.currentMouseCoord = null;
    this.map.getCanvas().style.cursor = 'crosshair';
    this.bindEvents();
  }

  // --- 3. 啟用圓形繪製 ---
  startCircleDraw() {
    this.clear();
    this.initSourceAndLayers();
    this.isDrawing = true;
    this.drawMode = 'circle';
    this.points = [];
    this.currentMouseCoord = null;
    this.map.getCanvas().style.cursor = 'crosshair';
    this.bindEvents();
  }

  bindEvents() {
    this.map.on('click', this._onClick);
    this.map.on('mousemove', this._onMouseMove);
    this.map.on('dblclick', this._onDblClick);
    window.addEventListener('keydown', this._onKeyDown);
  }

  unbindEvents() {
    this.map.off('click', this._onClick);
    this.map.off('mousemove', this._onMouseMove);
    this.map.off('dblclick', this._onDblClick);
    window.removeEventListener('keydown', this._onKeyDown);
    this.map.getCanvas().style.cursor = '';
  }

  // 地圖點擊處理
  handleClick(e) {
    if (!this.isDrawing) return;
    const coord = [e.lngLat.lng, e.lngLat.lat];

    if (this.drawMode === 'polygon') {
      // 防呆：避免連續點擊同一坐標
      if (this.points.length > 0) {
        const last = this.points[this.points.length - 1];
        if (Math.abs(last[0] - coord[0]) < 1e-6 && Math.abs(last[1] - coord[1]) < 1e-6) {
          return;
        }
      }
      this.points.push(coord);
      this.updatePreview();
    } else if (this.drawMode === 'rectangle') {
      if (this.points.length === 0) {
        this.points.push(coord);
        this.updatePreview();
      } else {
        // 第二點：矩形閉合
        const p1 = this.points[0];
        const p2 = coord;
        const rectCoords = [
          [p1[0], p1[1]],
          [p2[0], p1[1]],
          [p2[0], p2[1]],
          [p1[0], p2[1]],
          [p1[0], p1[1]]
        ];
        const rectPoly = turf.polygon([rectCoords]);
        this.finishDrawing(rectPoly);
      }
    } else if (this.drawMode === 'circle') {
      if (this.points.length === 0) {
        this.points.push(coord);
        this.updatePreview();
      } else {
        // 第二點：確定半徑並閉合
        const center = this.points[0];
        const distKm = turf.distance(center, coord, { units: 'kilometers' });
        const circlePoly = turf.circle(center, Math.max(distKm, 0.05), { steps: 64, units: 'kilometers' });
        this.finishDrawing(circlePoly);
      }
    }
  }

  // 滑鼠移動即時更新橡皮筋預覽線 (Rubber-band Line)
  handleMouseMove(e) {
    if (!this.isDrawing || this.points.length === 0) return;
    this.currentMouseCoord = [e.lngLat.lng, e.lngLat.lat];
    this.updatePreview();
  }

  // 雙擊完成多邊形閉合
  handleDblClick(e) {
    if (!this.isDrawing || this.drawMode !== 'polygon') return;
    e.preventDefault();

    // 雙擊時需至少有 3 個點構成有效多邊形
    if (this.points.length >= 3) {
      // 避免雙擊將第二個點重複加進來
      const pCount = this.points.length;
      if (pCount > 3) {
        const last = this.points[pCount - 1];
        const prev = this.points[pCount - 2];
        if (Math.abs(last[0] - prev[0]) < 1e-5 && Math.abs(last[1] - prev[1]) < 1e-5) {
          this.points.pop();
        }
      }

      const closedCoords = [...this.points, this.points[0]];
      const poly = turf.polygon([closedCoords]);
      this.finishDrawing(poly);
    }
  }

  // 按下 ESC 鍵取消繪製
  handleKeyDown(e) {
    if (e.key === 'Escape') {
      this.clear();
    }
  }

  // 動態更新圖面特徵 (包含固定線段、游標橡皮筋線段、端點與半透明面)
  updatePreview() {
    const src = this.map.getSource(this.sourceId);
    if (!src) return;

    const features = [];
    const mouse = this.currentMouseCoord;

    if (this.drawMode === 'polygon') {
      // 1. 各錨點點位
      this.points.forEach((pt, idx) => {
        features.push(turf.point(pt, { index: idx }));
      });

      // 2. 已確定的固定線段 (實線)
      if (this.points.length >= 2) {
        features.push(turf.lineString(this.points, { lineType: 'solid' }));
      }

      // 3. 滑鼠橡皮筋導引線 (點位與游標之間的動態線段)
      if (mouse) {
        const lastPt = this.points[this.points.length - 1];
        
        if (this.points.length === 1) {
          // 只有一個點：拉出一條至游標的虛線
          features.push(turf.lineString([lastPt, mouse], { lineType: 'guide' }));
        } else if (this.points.length >= 2) {
          // 兩個點以上：拉出至游標並連回起點的預覽閉合虛線
          features.push(turf.lineString([lastPt, mouse], { lineType: 'guide' }));
          features.push(turf.lineString([mouse, this.points[0]], { lineType: 'guide' }));

          // 半透明面預覽
          const previewCoords = [...this.points, mouse, this.points[0]];
          try {
            features.push(turf.polygon([previewCoords], { isPreview: true }));
          } catch (err) {}
        }
      }
    } else if (this.drawMode === 'rectangle' && this.points.length === 1 && mouse) {
      const p1 = this.points[0];
      const p2 = mouse;
      const rectCoords = [
        [p1[0], p1[1]],
        [p2[0], p1[1]],
        [p2[0], p2[1]],
        [p1[0], p2[1]],
        [p1[0], p1[1]]
      ];
      features.push(turf.point(p1, { index: 0 }));
      features.push(turf.point(p2, { index: 1 }));
      features.push(turf.lineString(rectCoords, { lineType: 'solid' }));
      try {
        features.push(turf.polygon([rectCoords], { isPreview: true }));
      } catch (err) {}
    } else if (this.drawMode === 'circle' && this.points.length === 1 && mouse) {
      const center = this.points[0];
      const distKm = turf.distance(center, mouse, { units: 'kilometers' });
      features.push(turf.point(center, { index: 0 }));
      features.push(turf.lineString([center, mouse], { lineType: 'guide' }));
      if (distKm > 0.02) {
        const circle = turf.circle(center, distKm, { steps: 64, units: 'kilometers' });
        circle.properties = { isPreview: true };
        features.push(circle);
        features.push(turf.lineString(circle.geometry.coordinates[0], { lineType: 'solid' }));
      }
    }

    src.setData({
      type: 'FeatureCollection',
      features
    });
  }

  // 繪製完成：固化多邊形並觸發空間計算
  finishDrawing(polygonFeature) {
    this.isDrawing = false;
    this.unbindEvents();
    this.finishedFeature = polygonFeature;

    // 清空導引線，保留實體完成多邊形展示
    const src = this.map.getSource(this.sourceId);
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: [
          polygonFeature,
          turf.lineString(polygonFeature.geometry.coordinates[0], { lineType: 'solid' })
        ]
      });
    }

    // 移除框選按鈕 active 樣式
    ['btn-draw-polygon', 'btn-draw-rect', 'btn-draw-circle'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });

    // 發送幾何範圍進行人本交通指標計算
    this.triggerAnalysis(polygonFeature.geometry);
  }

  // 結束框選模式 (回復地圖瀏覽拖曳手勢，完全清除框選幾何、軌跡與標記)
  stopDrawing() {
    this.clear();
  }

  // 完全清除所有框選與標記
  clear() {
    this.isDrawing = false;
    this.drawMode = null;
    this.points = [];
    this.currentMouseCoord = null;
    this.finishedFeature = null;
    window.lastAnalysisGeometry = null;
    this.unbindEvents();

    const src = this.map.getSource(this.sourceId);
    if (src) {
      src.setData({ type: 'FeatureCollection', features: [] });
    }

    // 移除所有框選按鈕的 active 樣式與外框高亮
    ['btn-draw-polygon', 'btn-draw-rect', 'btn-draw-circle'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('active');
        el.style.outline = 'none';
        el.style.boxShadow = 'none';
      }
    });
  }

  // 後端分析請求
  async triggerAnalysis(geometry) {
    console.log('[DrawAnalysis] 正在發送框選幾何範圍至後端進行空間運算...');
    window.dispatchEvent(new CustomEvent('analysis-start'));

    try {
      const resp = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          county: this.mapInstance.currentCounty,
          polygon: geometry
        })
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || `伺服器回應狀態碼 ${resp.status}`);
      }

      const result = await resp.json();
      if (!result.valid) {
        throw new Error(result.error || result.message || '分析失敗');
      }

      result.geometry = geometry;
      window.lastAnalysisGeometry = geometry;
      console.log('[DrawAnalysis] 空間分析計算成功！結果:', result);
      window.dispatchEvent(new CustomEvent('analysis-complete', { detail: result }));
    } catch (err) {
      console.warn('[DrawAnalysis] 空間分析中止:', err.message);
      alert(err.message);
      this.clear(); // 空間分析失敗或不予分析時，立即清除地圖上的框選範圍與幾何，避免殘留
      window.dispatchEvent(new CustomEvent('analysis-error', { detail: err }));
    }
  }
}

window.DrawAnalysisTool = DrawAnalysisTool;
