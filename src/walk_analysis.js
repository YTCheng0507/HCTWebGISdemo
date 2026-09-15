// ========================================================================
// 【步行生活圈等時/等距分析模組：依據點座標與自訂速度計算服務範圍】
// ========================================================================

class WalkAnalysisTool {
  constructor(mapInstance) {
    this.mapInstance = mapInstance;
    this.map = mapInstance.map;
    this.isActive = false;
    this.sourceId = 'walk-isochrone-src';
    this.centerMarker = null;

    this._onClick = this.handleClick.bind(this);

    this.initSourceAndLayers();
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

    // 1. 生活圈填色面
    if (!this.map.getLayer('walk-isochrone-fill')) {
      this.map.addLayer({
        id: 'walk-isochrone-fill',
        type: 'fill',
        source: this.sourceId,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': '#7c3aed',
          'fill-opacity': 0.22
        }
      });
    }

    // 2. 生活圈外環邊界
    if (!this.map.getLayer('walk-isochrone-line')) {
      this.map.addLayer({
        id: 'walk-isochrone-line',
        type: 'line',
        source: this.sourceId,
        paint: {
          'line-color': '#7c3aed',
          'line-width': 2.5,
          'line-dasharray': [3, 2]
        }
      });
    }
  }

  startSelection() {
    this.isActive = true;
    this.map.getCanvas().style.cursor = 'crosshair';
    this.map.on('click', this._onClick);

    const btnStart = document.getElementById('btn-walk-start');
    if (btnStart) btnStart.classList.add('active');
  }

  stopSelection() {
    this.isActive = false;
    this.map.off('click', this._onClick);
    this.map.getCanvas().style.cursor = '';

    const btnStart = document.getElementById('btn-walk-start');
    if (btnStart) btnStart.classList.remove('active');
  }

  clear() {
    this.stopSelection();
    if (this.centerMarker) {
      this.centerMarker.remove();
      this.centerMarker = null;
    }
    const src = this.map.getSource(this.sourceId);
    if (src) {
      src.setData({ type: 'FeatureCollection', features: [] });
    }
  }

  handleClick(e) {
    if (!this.isActive) return;
    const center = [e.lngLat.lng, e.lngLat.lat];
    this.executeAnalysis(center);
  }

  // 執行分析：讀取介面參數、生成等時圈/等距圈多邊形並觸發後端分析
  executeAnalysis(center) {
    const mode = document.querySelector('input[name="walk-calc-mode"]:checked')?.value || 'time';
    const speedKmH = parseFloat(document.getElementById('walk-speed-select')?.value || '4.0');
    
    let radiusKm = 0.5;

    if (mode === 'time') {
      const minutes = parseFloat(document.getElementById('walk-time-input')?.value || '10');
      // 速度 (km/h) * (時間分鐘 / 60) = 距離 (km)
      radiusKm = (speedKmH * (minutes / 60));
    } else {
      const meters = parseFloat(document.getElementById('walk-dist-input')?.value || '500');
      radiusKm = meters / 1000;
    }

    radiusKm = Math.max(0.05, Math.min(5.0, radiusKm));

    // 生成平滑的圓形多邊形 (64 節點)
    const circlePoly = turf.circle(center, radiusKm, { steps: 64, units: 'kilometers' });

    const src = this.map.getSource(this.sourceId);
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: [circlePoly]
      });
    }

    if (this.centerMarker) this.centerMarker.remove();
    const el = document.createElement('div');
    el.style.background = '#7c3aed';
    el.style.color = '#fff';
    el.style.padding = '4px 8px';
    el.style.borderRadius = '4px';
    el.style.fontSize = '12px';
    el.style.fontWeight = 'bold';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    el.innerText = `步行生活圈中心 (半徑: ${(radiusKm * 1000).toFixed(0)}m)`;

    this.centerMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat(center)
      .addTo(this.map);

    this.stopSelection();
    this.triggerAnalysis(circlePoly.geometry);
  }

  async triggerAnalysis(geometry) {
    console.log('[WalkAnalysis] 發送生活圈範圍至後端進行空間運算...');
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
      console.log('[WalkAnalysis] 生活圈分析計算成功！', result);
      window.dispatchEvent(new CustomEvent('analysis-complete', { detail: result }));
    } catch (err) {
      console.warn('[WalkAnalysis] 生活圈分析中斷:', err.message);
      alert(err.message);
      window.dispatchEvent(new CustomEvent('analysis-error', { detail: err }));
    }
  }
}

window.WalkAnalysisTool = WalkAnalysisTool;
