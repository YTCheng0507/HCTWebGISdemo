// ========================================================================
// 【成果圖匯出模組：統一電腦版與行動端標準解析度 (1600 × 1000) 且範圍精準置中】
// ========================================================================

class ReportExporter {
  constructor() {
    this.isExporting = false;
  }

  showExportLoading(text = "正在產製標準高解析成果報告圖 (1600 × 1000)...") {
    let overlay = document.getElementById('report-export-loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'report-export-loading-overlay';
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(8px);
        z-index: 999999; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 16px; color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
      `;
      overlay.innerHTML = `
        <div class="spinner" style="width: 48px; height: 48px; border: 4px solid rgba(255,255,255,0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <div id="export-loading-msg" style="font-size: 15.5px; font-weight: 600; letter-spacing: 0.5px; text-align: center;"></div>
        <div style="font-size: 12.5px; color: #94a3b8;">系統自動校正視角置中並統一電腦版 16:10 標準版面，請稍候...</div>
      `;
      document.body.appendChild(overlay);
    }
    const msgEl = document.getElementById('export-loading-msg');
    if (msgEl) msgEl.innerText = text;
    overlay.style.display = 'flex';
  }

  hideExportLoading() {
    const overlay = document.getElementById('report-export-loading-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // 1. 匯出統一標準規格之「人本交通環境評估成果報告圖」 (1600 × 1000)
  async exportReportImage(map, data) {
    if (this.isExporting) return;
    this.isExporting = true;
    this.showExportLoading("正在產製標準高解析成果報告圖 (1600 × 1000)...");

    const mapEl = map.getContainer();
    const prevStyle = {
      width: mapEl.style.width,
      height: mapEl.style.height,
      position: mapEl.style.position,
      top: mapEl.style.top,
      left: mapEl.style.left,
      zIndex: mapEl.style.zIndex
    };
    const prevCenter = map.getCenter();
    const prevZoom = map.getZoom();

    const targetW = 1600;
    const targetH = 1000;

    try {
      // 1. 無論手機、平板或桌機，統一將地圖容器調整至電腦版高解析標準尺寸 (1600 × 1000)
      mapEl.style.width = `${targetW}px`;
      mapEl.style.height = `${targetH}px`;
      mapEl.style.position = 'fixed';
      mapEl.style.top = '0';
      mapEl.style.left = '0';
      mapEl.style.zIndex = '99990'; // 位於載入遮罩下方，使用者無感知
      map.resize();

      // 2. 自動將評估範圍幾何置中於開放視野中（避開右上評估卡與左上標題，永不切邊）
      const geometry = (data && data.geometry) || window.lastAnalysisGeometry;
      if (geometry && window.turf) {
        const bbox = turf.bbox(geometry);
        map.fitBounds(bbox, {
          padding: { top: 140, bottom: 90, left: 100, right: 500 },
          maxZoom: 16.5,
          duration: 0
        });
      }

      // 3. 等待地圖切片與向量資料在 1600x1000 下完全渲染
      await new Promise(resolve => {
        let finished = false;
        const done = () => {
          if (!finished) {
            finished = true;
            resolve();
          }
        };
        map.once('idle', done);
        setTimeout(done, 650); // 防超時回退
      });

      const mapCanvas = map.getCanvas();
      if (!mapCanvas) throw new Error("無法獲取地圖畫面");

      // 4. 建立統一標準 1600 x 1000 離屏輸出畫布
      const outCanvas = document.createElement('canvas');
      outCanvas.width = targetW;
      outCanvas.height = targetH;
      const ctx = outCanvas.getContext('2d');

      // 繪製地圖畫面作為滿版底圖
      ctx.drawImage(mapCanvas, 0, 0, targetW, targetH);

      // 5. 繪製左上角主標題 Banner (半透明高質感深色卡片)
      this.drawRoundedRect(ctx, 32, 32, 540, 110, 12, 'rgba(15, 23, 42, 0.90)');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px "Microsoft JhengHei", sans-serif';
      ctx.fillText('人本交通環境評估成果報告', 56, 72);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 13.5px "Microsoft JhengHei", sans-serif';
      ctx.fillText('人行環境 GIS 資料平台 ‧ 人本交通指標決策報告', 56, 96);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px "Microsoft JhengHei", sans-serif';
      const nowStr = new Date().toLocaleString('zh-TW', { hour12: false });
      ctx.fillText(`產製時間：${nowStr}`, 56, 122);

      // 6. 繪製右上角評估總分卡片
      const score = (data && data.score) || {};
      const cardW = 460;
      const cardH = 340;
      const cardX = targetW - cardW - 32;
      const cardY = 32;

      this.drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 12, 'rgba(15, 23, 42, 0.92)');

      // 頂部列：左側標題，右側等級評定膠囊徽章
      const level = score.env_level || '評估完成';
      const isUnscoreable = score.is_evaluable === false || level.includes('不適用');

      let badgeColor = '#4ade80';
      let badgeBg = 'rgba(74, 222, 128, 0.16)';
      if (isUnscoreable) {
        badgeColor = '#94a3b8';
        badgeBg = 'rgba(148, 163, 184, 0.20)';
      } else if (level.includes('D') || level.includes('E')) {
        badgeColor = '#f87171';
        badgeBg = 'rgba(248, 113, 113, 0.18)';
      } else if (level.includes('C')) {
        badgeColor = '#fbbf24';
        badgeBg = 'rgba(251, 191, 36, 0.18)';
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 13.5px "Microsoft JhengHei", sans-serif';
      ctx.fillText('人本步行環境優良度總分', cardX + 24, cardY + 36);

      // 右上角精緻等級膠囊徽章
      ctx.font = 'bold 12.5px "Microsoft JhengHei", sans-serif';
      const badgeText = isUnscoreable ? '無道路與人行道資料' : `${level}`;
      const badgeTextW = ctx.measureText(badgeText).width;
      const badgeW = badgeTextW + 20;
      const badgeH = 24;
      const badgeX = cardX + cardW - 24 - badgeW;
      const badgeY = cardY + 20;

      this.drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 4, badgeBg);
      ctx.strokeStyle = badgeColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = badgeColor;
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, badgeX + (badgeW / 2), badgeY + 17);
      ctx.textAlign = 'left';

      // 第二列：超大評分數字 + 自動動態間距的 / 100 分 (永不重疊)
      const totalScore = isUnscoreable ? '--' : (score.total_score !== undefined ? score.total_score : '--');
      ctx.fillStyle = isUnscoreable ? '#94a3b8' : '#38bdf8';
      ctx.font = 'bold 42px "Microsoft JhengHei", sans-serif';
      ctx.fillText(`${totalScore}`, cardX + 24, cardY + 90);

      const scoreW = ctx.measureText(`${totalScore}`).width;
      ctx.fillStyle = '#64748b';
      ctx.font = '16px "Microsoft JhengHei", sans-serif';
      ctx.fillText(isUnscoreable ? '(不適用)' : '/ 100 分', cardX + 24 + scoreW + 8, cardY + 90);

      // 分隔線
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cardX + 20, cardY + 110);
      ctx.lineTo(cardX + cardW - 20, cardY + 110);
      ctx.stroke();

      // 四大維度細項統計
      const sw = (data && data.sidewalk) || {};
      const acc = (data && data.accidents) || {};
      const pop = (data && data.population) || {};
      const poi = (data && data.poi) || {};

      let lineY = cardY + 138;
      const stepY = 32;

      const sWalkText = isUnscoreable ? '-- 分' : `${score.s_walk || 0} 分`;
      const sLiveText = isUnscoreable ? '-- 分' : `${score.i_live || 0} 分 (POI: ${poi.total_poi || 0}處)`;
      const sSafetyText = isUnscoreable ? '-- 分' : `${score.s_safety || 0} 分 (近3年A1: ${acc.a1_count || 0}, A2: ${acc.a2_count || 0})`;

      this.drawMetricRow(ctx, cardX + 24, lineY, '🚶 步行環境 (45%):', sWalkText, '#38bdf8', 1);
      lineY += stepY;
      this.drawMetricRow(ctx, cardX + 24, lineY, '   • 人行道總長:', `${(sw.total_length_m || 0).toLocaleString()} m`, '#e2e8f0', 1);
      lineY += stepY;
      this.drawMetricRow(ctx, cardX + 24, lineY, '   • 平均有效淨寬:', `${sw.avg_effective_width_m || 0} m`, sw.avg_effective_width_m >= 1.5 ? '#4ade80' : '#f87171', 1);
      lineY += stepY;
      this.drawMetricRow(ctx, cardX + 24, lineY, '🏪 生活機能 (45%):', sLiveText, '#86efac', 1);
      lineY += stepY;
      this.drawMetricRow(ctx, cardX + 24, lineY, '🛡️ 交通安全 (10%):', sSafetyText, '#fca5a5', 1);
      lineY += stepY;
      this.drawMetricRow(ctx, cardX + 24, lineY, '👥 涵蓋推估人口:', `${(pop.total_population || 0).toLocaleString()} 人 (${(pop.density_per_km2 || 0).toLocaleString()} 人/km²)`, '#cbd5e1', 1);

      // 7. 繪製右下角指北針與圖資來源
      this.drawRoundedRect(ctx, targetW - 220, targetH - 60, 188, 36, 6, 'rgba(15, 23, 42, 0.82)');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
      ctx.fillText('🧭 北 N  |  NLSC 圖資', targetW - 200, targetH - 37);

      // 8. 繪製底部中央浮水印
      this.drawRoundedRect(ctx, (targetW / 2) - 200, targetH - 46, 400, 32, 16, 'rgba(15, 23, 42, 0.75)');
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '12.5px "Microsoft JhengHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('人本交通環境 WebGIS 資料平台 - 成果報告匯出', targetW / 2, targetH - 25);
      ctx.textAlign = 'left';

      // 9. 轉換為 Blob 並下載
      const filename = `人本交通評估報告_${this.formatDateFilename(new Date())}.png`;
      this.triggerDownload(outCanvas, filename);

    } catch (err) {
      console.error('[ReportExporter] 匯出失敗:', err);
      alert(`匯出成果圖失敗: ${err.message}`);
    } finally {
      // 10. 精確復原地圖容器原始尺寸與視角
      mapEl.style.width = prevStyle.width;
      mapEl.style.height = prevStyle.height;
      mapEl.style.position = prevStyle.position;
      mapEl.style.top = prevStyle.top;
      mapEl.style.left = prevStyle.left;
      mapEl.style.zIndex = prevStyle.zIndex;
      map.resize();
      map.easeTo({ center: prevCenter, zoom: prevZoom, duration: 150 });

      this.hideExportLoading();
      this.isExporting = false;
    }
  }

  // 2. 匯出純地圖高解析畫面截圖 (統一 1600 × 1000 標準橫式規格且置中)
  async exportMapSnapshot(map) {
    if (this.isExporting) return;
    this.isExporting = true;
    this.showExportLoading("正在截取高解析地圖畫面 (1600 × 1000)...");

    const mapEl = map.getContainer();
    const prevStyle = {
      width: mapEl.style.width,
      height: mapEl.style.height,
      position: mapEl.style.position,
      top: mapEl.style.top,
      left: mapEl.style.left,
      zIndex: mapEl.style.zIndex
    };
    const prevCenter = map.getCenter();
    const prevZoom = map.getZoom();

    const targetW = 1600;
    const targetH = 1000;

    try {
      mapEl.style.width = `${targetW}px`;
      mapEl.style.height = `${targetH}px`;
      mapEl.style.position = 'fixed';
      mapEl.style.top = '0';
      mapEl.style.left = '0';
      mapEl.style.zIndex = '99990';
      map.resize();

      if (window.lastAnalysisGeometry && window.turf) {
        const bbox = turf.bbox(window.lastAnalysisGeometry);
        map.fitBounds(bbox, { padding: 100, maxZoom: 16.5, duration: 0 });
      }

      await new Promise(resolve => {
        let finished = false;
        const done = () => {
          if (!finished) {
            finished = true;
            resolve();
          }
        };
        map.once('idle', done);
        setTimeout(done, 600);
      });

      const mapCanvas = map.getCanvas();
      if (!mapCanvas) throw new Error("無法獲取地圖畫面");

      const outCanvas = document.createElement('canvas');
      outCanvas.width = targetW;
      outCanvas.height = targetH;
      const ctx = outCanvas.getContext('2d');
      ctx.drawImage(mapCanvas, 0, 0, targetW, targetH);

      // 右下角指北針與來源標籤
      this.drawRoundedRect(ctx, targetW - 240, targetH - 60, 208, 36, 6, 'rgba(15, 23, 42, 0.82)');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
      ctx.fillText('🧭 北 N  |  人行環境 WebGIS', targetW - 220, targetH - 37);

      const filename = `WebGIS地圖截圖_${this.formatDateFilename(new Date())}.png`;
      this.triggerDownload(outCanvas, filename);

    } catch (err) {
      console.error('[ReportExporter] 截圖失敗:', err);
      alert(`截圖失敗: ${err.message}`);
    } finally {
      mapEl.style.width = prevStyle.width;
      mapEl.style.height = prevStyle.height;
      mapEl.style.position = prevStyle.position;
      mapEl.style.top = prevStyle.top;
      mapEl.style.left = prevStyle.left;
      mapEl.style.zIndex = prevStyle.zIndex;
      map.resize();
      map.easeTo({ center: prevCenter, zoom: prevZoom, duration: 150 });

      this.hideExportLoading();
      this.isExporting = false;
    }
  }

  // 繪製單行指標資訊 (文字靠左，數值靠右)
  drawMetricRow(ctx, x, y, label, val, valColor, scale = 1) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${13 * scale}px "Microsoft JhengHei", sans-serif`;
    ctx.fillText(label, x, y);

    ctx.fillStyle = valColor;
    ctx.font = `bold ${13 * scale}px "Microsoft JhengHei", sans-serif`;
    ctx.fillText(val, x + (170 * scale), y);
  }

  // 繪製圓角矩形輔助方法
  drawRoundedRect(ctx, x, y, width, height, radius, fillColor) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.restore();
  }

  // 日期字串格式化 (YYYYMMDD_HHmmss)
  formatDateFilename(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  // 下載觸發
  triggerDownload(canvas, filename) {
    canvas.toBlob((blob) => {
      if (!blob) {
        alert("無法轉換圖片格式！");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      console.log(`[ReportExporter] 成功下載標準高解析圖片: ${filename}`);
    }, 'image/png');
  }
}

window.ReportExporter = ReportExporter;
