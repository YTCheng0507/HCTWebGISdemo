// ========================================================================
// 【GIS 工具模組：支援 TWD97/WGS84 雙坐標換算、量測與精準定位】
// ========================================================================

class MeasureTool {
  constructor(mapInstance) {
    this.mapInstance = mapInstance;
    this.map = mapInstance.map;
    this.isMeasuring = false;
    this.activeMode = null; // 'distance' | 'area' | 'pick-coord'
    this.measurePoints = [];
    this.currentMouseCoord = null;
    this.markers = [];
    this.tempSourceId = 'measure-temp-src';
    this.finishedFeatures = [];

    // 事件常式參照 (用於 bind / unbind)
    this._onClick = this.handleClick.bind(this);
    this._onMouseMove = this.handleMouseMove.bind(this);
    this._onDblClick = this.handleDblClick.bind(this);
    this._onKeyDown = this.handleKeyDown.bind(this);

    this.initProj4();
    this.initTempLayer();
    this.initMouseMoveCoord();

    // 監聽底圖切換 (style.load) 時重新掛載圖層並保留既有量測圖形
    this.map.on('style.load', () => {
      this.initTempLayer();
      if (this.finishedFeatures.length > 0) {
        const src = this.map.getSource(this.tempSourceId);
        if (src) {
          src.setData({
            type: 'FeatureCollection',
            features: this.finishedFeatures
          });
        }
      }
    });
  }

  initProj4() {
    // 註冊 TWD97 臺灣二度分帶 (EPSG:3826)
    proj4.defs("EPSG:3826", window.APP_CONFIG.proj4Defs.EPSG3826);
  }

  // WGS84 [lng, lat] 轉 TWD97 [X, Y]
  wgs84ToTwd97(lng, lat) {
    return proj4("EPSG:4326", "EPSG:3826", [lng, lat]);
  }

  // TWD97 [X, Y] 轉 WGS84 [lng, lat]
  twd97ToWgs84(x, y) {
    return proj4("EPSG:3826", "EPSG:4326", [x, y]);
  }

  initMouseMoveCoord() {
    this.map.on('mousemove', (e) => {
      const coordEl = document.getElementById('mouse-coord');
      if (!coordEl) return;
      const [lng, lat] = [e.lngLat.lng, e.lngLat.lat];
      const [twd97X, twd97Y] = this.wgs84ToTwd97(lng, lat);
      coordEl.innerHTML = `
        <span>經緯度 (WGS84): <strong>${lng.toFixed(5)}°, ${lat.toFixed(5)}°</strong></span>
        <span style="margin: 0 8px; color: #94a3b8;">|</span>
        <span>二度分帶 (TWD97): <strong>X: ${twd97X.toFixed(1)} m, Y: ${twd97Y.toFixed(1)} m</strong></span>
      `;
    });
  }

  initTempLayer() {
    if (!this.map.getSource(this.tempSourceId)) {
      this.map.addSource(this.tempSourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }

    // 1. 測量多邊形半透明填色
    if (!this.map.getLayer('measure-poly')) {
      this.map.addLayer({
        id: 'measure-poly',
        type: 'fill',
        source: this.tempSourceId,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': '#dc2626',
          'fill-opacity': 0.22
        }
      });
    }

    // 2-1. 實線折線白色外暈光框 (Casing，確保在任何道路或底圖上皆清晰可見)
    if (!this.map.getLayer('measure-line-casing')) {
      this.map.addLayer({
        id: 'measure-line-casing',
        type: 'line',
        source: this.tempSourceId,
        filter: ['==', 'lineType', 'solid'],
        paint: {
          'line-color': '#ffffff',
          'line-width': 7,
          'line-opacity': 0.95,
          'line-join': 'round',
          'line-cap': 'round'
        }
      });
    }

    // 2-2. 已確定的固定線段 (鮮明粗實線)
    if (!this.map.getLayer('measure-line')) {
      this.map.addLayer({
        id: 'measure-line',
        type: 'line',
        source: this.tempSourceId,
        filter: ['==', 'lineType', 'solid'],
        paint: {
          'line-color': '#dc2626',
          'line-width': 4,
          'line-join': 'round',
          'line-cap': 'round'
        }
      });
    }

    // 3-1. 橡皮筋導引虛線外暈白色底
    if (!this.map.getLayer('measure-guide-casing')) {
      this.map.addLayer({
        id: 'measure-guide-casing',
        type: 'line',
        source: this.tempSourceId,
        filter: ['==', 'lineType', 'guide'],
        paint: {
          'line-color': '#ffffff',
          'line-width': 5.5,
          'line-opacity': 0.9,
          'line-dasharray': [4, 3]
        }
      });
    }

    // 3-2. 橡皮筋即時引導虛線 (Rubber-band Line，隨游標動態牽引)
    if (!this.map.getLayer('measure-guide-line')) {
      this.map.addLayer({
        id: 'measure-guide-line',
        type: 'line',
        source: this.tempSourceId,
        filter: ['==', 'lineType', 'guide'],
        paint: {
          'line-color': '#dc2626',
          'line-width': 3,
          'line-dasharray': [4, 3]
        }
      });
    }

    // 4. 節點端點錨點標記
    if (!this.map.getLayer('measure-points')) {
      this.map.addLayer({
        id: 'measure-points',
        type: 'circle',
        source: this.tempSourceId,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 6.5,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#dc2626',
          'circle-stroke-width': 3
        }
      });
    }
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

  startMeasure(mode) {
    this.clear();
    this.initTempLayer();
    this.isMeasuring = true;
    this.activeMode = mode;
    this.measurePoints = [];
    this.currentMouseCoord = null;
    this.finishedFeatures = [];

    this.map.getCanvas().style.cursor = 'crosshair';
    this.bindEvents();

    // 標記 UI 按鈕 active 樣式
    const btnMap = {
      'distance': 'btn-measure-dist',
      'area': 'btn-measure-area',
      'pick-coord': 'btn-pick-coord'
    };
    ['btn-measure-dist', 'btn-measure-area', 'btn-pick-coord'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.classList.remove('active');
    });
    const targetBtn = document.getElementById(btnMap[mode]);
    if (targetBtn) targetBtn.classList.add('active');
  }

  stopMeasure() {
    // 防呆：若使用者點選了點位但尚未雙擊，直接點擊「結束量測」時自動為其固化線條/多邊形，絕不遺失折線！
    if (this.isMeasuring) {
      if (this.activeMode === 'distance' && this.measurePoints.length >= 2) {
        this.finishMeasure();
        return;
      } else if (this.activeMode === 'area' && this.measurePoints.length >= 3) {
        this.finishMeasure();
        return;
      }
    }

    this.isMeasuring = false;
    this.unbindEvents();

    // 清除即時引導虛線，若有已固化的成果則予以保留
    const src = this.map.getSource(this.tempSourceId);
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: this.finishedFeatures
      });
    }

    // 移除按鈕 active 樣式
    ['btn-measure-dist', 'btn-measure-area', 'btn-pick-coord'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.classList.remove('active');
    });
  }

  clear() {
    this.isMeasuring = false;
    this.activeMode = null;
    this.measurePoints = [];
    this.currentMouseCoord = null;
    this.finishedFeatures = [];
    this.unbindEvents();

    this.markers.forEach(m => m.remove());
    this.markers = [];

    const src = this.map.getSource(this.tempSourceId);
    if (src) {
      src.setData({ type: 'FeatureCollection', features: [] });
    }

    ['btn-measure-dist', 'btn-measure-area', 'btn-pick-coord'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.classList.remove('active');
    });
  }

  handleClick(e) {
    if (!this.isMeasuring) return;
    const coord = [e.lngLat.lng, e.lngLat.lat];

    if (this.activeMode === 'pick-coord') {
      const [twd97X, twd97Y] = this.wgs84ToTwd97(coord[0], coord[1]);
      alert(`【坐標取得成功】\n\n• WGS84 經緯度：\n  經度: ${coord[0].toFixed(6)}°\n  緯度: ${coord[1].toFixed(6)}°\n\n• TWD97 二度分帶 (公尺)：\n  X (東向): ${twd97X.toFixed(2)} m\n  Y (北向): ${twd97Y.toFixed(2)} m`);
      this.stopMeasure();
      return;
    }

    // 防呆：連續點擊同一坐標
    if (this.measurePoints.length > 0) {
      const last = this.measurePoints[this.measurePoints.length - 1];
      if (Math.abs(last[0] - coord[0]) < 1e-6 && Math.abs(last[1] - coord[1]) < 1e-6) {
        return;
      }
    }

    this.measurePoints.push(coord);
    this.updatePreview();
  }

  handleMouseMove(e) {
    if (!this.isMeasuring || this.measurePoints.length === 0) return;
    this.currentMouseCoord = [e.lngLat.lng, e.lngLat.lat];
    this.updatePreview();
  }

  handleDblClick(e) {
    if (!this.isMeasuring) return;
    e.preventDefault();

    // 雙擊完成量測：剔除連續觸發可能導致之重複末點
    const pCount = this.measurePoints.length;
    if (pCount >= 2) {
      const last = this.measurePoints[pCount - 1];
      const prev = this.measurePoints[pCount - 2];
      if (Math.abs(last[0] - prev[0]) < 1e-5 && Math.abs(last[1] - prev[1]) < 1e-5) {
        this.measurePoints.pop();
      }
    }

    if (this.activeMode === 'distance' && this.measurePoints.length >= 2) {
      this.finishMeasure();
    } else if (this.activeMode === 'area' && this.measurePoints.length >= 3) {
      this.finishMeasure();
    }
  }

  handleKeyDown(e) {
    if (e.key === 'Escape') {
      this.stopMeasure();
    }
  }

  // 與區域框選分析完全一致的動態繪製預覽 (包含固定實線、游標橡皮筋導引線、閉合導引線與填色預覽)
  updatePreview() {
    const src = this.map.getSource(this.tempSourceId);
    if (!src) return;

    const features = [];
    const mouse = this.currentMouseCoord;

    // 1. 各錨點點位
    this.measurePoints.forEach((pt, idx) => {
      features.push(turf.point(pt, { ptIndex: idx }));
    });

    // 2. 距離量測預覽 (折線拉線)
    if (this.activeMode === 'distance') {
      if (this.measurePoints.length >= 2) {
        features.push(turf.lineString(this.measurePoints, { lineType: 'solid' }));
      }

      if (mouse) {
        const lastPt = this.measurePoints[this.measurePoints.length - 1];
        // 動態橡皮筋虛線導引
        features.push(turf.lineString([lastPt, mouse], { lineType: 'guide' }));

        // 計算累計動態總長度
        const previewPoints = [...this.measurePoints, mouse];
        const dist = turf.length(turf.lineString(previewPoints), { units: 'kilometers' });
        const distText = dist < 1 ? `${(dist * 1000).toFixed(1)} 公尺` : `${dist.toFixed(2)} 公里`;
        this.updateTooltip(mouse, `距離: ${distText} (雙擊結束)`);
      }
    } 
    // 3. 面積量測預覽 (多邊形框選，完全比照區域框選分析)
    else if (this.activeMode === 'area') {
      if (this.measurePoints.length >= 2) {
        features.push(turf.lineString(this.measurePoints, { lineType: 'solid' }));
      }

      if (mouse) {
        const lastPt = this.measurePoints[this.measurePoints.length - 1];

        if (this.measurePoints.length === 1) {
          // 只有 1 個點：拉出到游標的導引虛線
          features.push(turf.lineString([lastPt, mouse], { lineType: 'guide' }));
          const dist = turf.distance(lastPt, mouse, { units: 'kilometers' });
          const distText = dist < 1 ? `${(dist * 1000).toFixed(1)} 公尺` : `${dist.toFixed(2)} 公里`;
          this.updateTooltip(mouse, `邊長: ${distText} (點擊下一頂點)`);
        } else if (this.measurePoints.length >= 2) {
          // 2 個點以上：
          // (A) 拉出至游標的導引虛線
          features.push(turf.lineString([lastPt, mouse], { lineType: 'guide' }));
          // (B) 從游標連回起點的閉合導引虛線
          features.push(turf.lineString([mouse, this.measurePoints[0]], { lineType: 'guide' }));

          // (C) 半透明面預覽
          const previewCoords = [...this.measurePoints, mouse, this.measurePoints[0]];
          try {
            const poly = turf.polygon([previewCoords]);
            features.push(poly);
            const area = turf.area(poly);
            const areaText = area > 10000 ? `${(area / 10000).toFixed(2)} 公頃` : `${area.toFixed(1)} 平方公尺`;
            this.updateTooltip(mouse, `即時面積: ${areaText} (雙擊閉合)`);
          } catch (err) {}
        }
      }
    }

    src.setData({
      type: 'FeatureCollection',
      features
    });
  }

  // 固化量測結果 (閉合線/面，清除導引虛線，並在適當位置固定成果 Tooltip)
  finishMeasure() {
    this.isMeasuring = false;
    this.unbindEvents();

    const src = this.map.getSource(this.tempSourceId);
    this.finishedFeatures = [];

    // 錨點
    this.measurePoints.forEach((pt, idx) => {
      this.finishedFeatures.push(turf.point(pt, { ptIndex: idx }));
    });

    if (this.activeMode === 'distance') {
      const line = turf.lineString(this.measurePoints, { lineType: 'solid' });
      this.finishedFeatures.push(line);

      const totalDist = turf.length(line, { units: 'kilometers' });
      const distText = totalDist < 1 ? `${(totalDist * 1000).toFixed(1)} 公尺` : `${totalDist.toFixed(2)} 公里`;
      const endPoint = this.measurePoints[this.measurePoints.length - 1];
      this.updateTooltip(endPoint, `總長度: ${distText}`, true);
    } else if (this.activeMode === 'area') {
      const closedCoords = [...this.measurePoints, this.measurePoints[0]];
      const poly = turf.polygon([closedCoords]);
      const perimeter = turf.lineString(closedCoords, { lineType: 'solid' });

      this.finishedFeatures.push(poly);
      this.finishedFeatures.push(perimeter);

      const totalArea = turf.area(poly);
      const areaText = totalArea > 10000 ? `${(totalArea / 10000).toFixed(2)} 公頃` : `${totalArea.toFixed(1)} 平方公尺`;

      // 將 Tooltip 標註於多邊形重心 (Center of mass) 或起點
      let centerPt;
      try {
        centerPt = turf.centerOfMass(poly).geometry.coordinates;
      } catch (e) {
        centerPt = this.measurePoints[0];
      }
      this.updateTooltip(centerPt, `總面積: ${areaText}`, true);
    }

    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: this.finishedFeatures
      });
    }

    // 移除按鈕 active 樣式
    ['btn-measure-dist', 'btn-measure-area', 'btn-pick-coord'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.classList.remove('active');
    });
  }

  updateTooltip(coord, text, isFinal = false) {
    this.markers.forEach(m => m.remove());
    this.markers = [];

    const el = document.createElement('div');
    el.style.background = isFinal ? '#0f172a' : 'rgba(15, 23, 42, 0.9)';
    el.style.color = '#fff';
    el.style.padding = isFinal ? '5px 10px' : '4px 8px';
    el.style.borderRadius = '4px';
    el.style.fontSize = isFinal ? '13px' : '12px';
    el.style.fontWeight = '600';
    el.style.border = isFinal ? '1.5px solid #dc2626' : '1px solid rgba(220, 38, 38, 0.8)';
    el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
    el.style.pointerEvents = 'none';
    el.style.whiteSpace = 'nowrap';
    el.innerText = text;

    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat(coord)
      .addTo(this.map);
    this.markers.push(marker);
  }

  // 雙模坐標快速定位 (支援輸入 TWD97 或 WGS84)
  zoomToInput(inputStr) {
    const parts = inputStr.trim().split(/[,，\s]+/);
    if (parts.length < 2) return false;
    let v1 = parseFloat(parts[0]);
    let v2 = parseFloat(parts[1]);

    let lng, lat;
    if (v1 > 10000 && v2 > 10000) {
      // 判定為 TWD97 二度分帶坐標
      const wgs = this.twd97ToWgs84(v1, v2);
      lng = wgs[0];
      lat = wgs[1];
    } else {
      // 判定為 WGS84 經緯度
      lng = v1;
      lat = v2;
    }

    if (isNaN(lng) || isNaN(lat)) return false;

    this.map.flyTo({
      center: [lng, lat],
      zoom: 16,
      essential: true
    });

    const [tX, tY] = this.wgs84ToTwd97(lng, lat);
    const el = document.createElement('div');
    el.innerHTML = '📍';
    el.style.fontSize = '24px';
    new maplibregl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(this.map);

    return true;
  }
}

window.MeasureTool = MeasureTool;
