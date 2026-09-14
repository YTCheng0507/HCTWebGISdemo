// ========================================================================
// 【成果圖匯出模組：繪製高解析成果報告圖與純地圖快照】
// ========================================================================

class ReportExporter {
  constructor() {
    this.isExporting = false;
  }

  // 1. 匯出「人本交通環境評估成果報告圖」 (地圖畫面 + 專業評估指標卡)
  async exportReportImage(map, data) {
    if (this.isExporting) return;
    this.isExporting = true;

    try {
      const mapCanvas = map.getCanvas();
      if (!mapCanvas) {
        throw new Error("無法獲取地圖畫面");
      }

      // 建立離屏高解析 Canvas
      const outCanvas = document.createElement('canvas');
      const w = mapCanvas.width;
      const h = mapCanvas.height;
      outCanvas.width = w;
      outCanvas.height = h;
      const ctx = outCanvas.getContext('2d');

      // 1. 繪製地圖畫面作為底圖
      ctx.drawImage(mapCanvas, 0, 0, w, h);

      // 2. 繪製左上角主標題 Banner (半透明高質感深色卡片)
      const scale = Math.max(1, w / 1600); // 依螢幕解析度縮放字體與卡片
      
      const bannerW = Math.min(560 * scale, w * 0.45);
      const bannerH = 100 * scale;
      this.drawRoundedRect(ctx, 24 * scale, 24 * scale, bannerW, bannerH, 12 * scale, 'rgba(15, 23, 42, 0.88)');

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${22 * scale}px "Microsoft JhengHei", sans-serif`;
      ctx.fillText('人本交通環境評估成果報告', 42 * scale, 58 * scale);

      ctx.fillStyle = '#94a3b8';
      ctx.font = `${13 * scale}px "Microsoft JhengHei", sans-serif`;
      const nowStr = new Date().toLocaleString('zh-TW', { hour12: false });
      ctx.fillText(`產製時間：${nowStr}  |  坐標系統：TWD97 / WGS84`, 42 * scale, 86 * scale);
      ctx.fillText(`圖資來源：內政部國土測繪中心 (NLSC) / 高雄市政府`, 42 * scale, 106 * scale);

      // 3. 繪製右上角評估總分卡片
      const score = data.score || {};
      const cardW = Math.min(420 * scale, w * 0.38);
      const cardH = 340 * scale;
      const cardX = w - cardW - (24 * scale);
      const cardY = 24 * scale;

      this.drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 12 * scale, 'rgba(15, 23, 42, 0.92)');

      // 總分標題與大分數
      ctx.fillStyle = '#94a3b8';
      ctx.font = `bold ${14 * scale}px "Microsoft JhengHei", sans-serif`;
      ctx.fillText('人本步行環境優良度總分', cardX + 24 * scale, cardY + 36 * scale);

      const totalScore = score.total_score !== undefined ? score.total_score : '--';
      ctx.fillStyle = '#38bdf8';
      ctx.font = `bold ${40 * scale}px "Microsoft JhengHei", sans-serif`;
      ctx.fillText(`${totalScore}`, cardX + 24 * scale, cardY + 84 * scale);

      ctx.fillStyle = '#64748b';
      ctx.font = `${16 * scale}px "Microsoft JhengHei", sans-serif`;
      ctx.fillText('/ 100 分', cardX + (120 * scale), cardY + 84 * scale);

      // 等級評定文字 (無底框，靠右對齊 cardX + cardW - 24，絕對不超出卡片)
      const level = score.env_level || '評估完成';
      let badgeColor = '#4ade80'; // 綠
      if (level.includes('D') || level.includes('E')) badgeColor = '#f87171';
      else if (level.includes('C')) badgeColor = '#fbbf24';
      
      ctx.fillStyle = badgeColor;
      ctx.font = `bold ${14 * scale}px "Microsoft JhengHei", sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(`等級評定：${level}`, cardX + cardW - (24 * scale), cardY + 80 * scale);
      ctx.textAlign = 'left';

      // 分隔線
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cardX + 20 * scale, cardY + 104 * scale);
      ctx.lineTo(cardX + cardW - (20 * scale), cardY + 104 * scale);
      ctx.stroke();

      // 四大維度細項統計
      const sw = data.sidewalk || {};
      const acc = data.accidents || {};
      const pop = data.population || {};
      const poi = data.poi || {};

      let lineY = cardY + 130 * scale;
      const stepY = 32 * scale;

      this.drawMetricRow(ctx, cardX + 24 * scale, lineY, '🚶 步行環境 (45%):', `${score.s_walk || 0} 分`, '#38bdf8', scale);
      lineY += stepY;
      this.drawMetricRow(ctx, cardX + 24 * scale, lineY, '   • 人行道總長:', `${(sw.total_length_m || 0).toLocaleString()} m`, '#e2e8f0', scale);
      lineY += stepY;
      this.drawMetricRow(ctx, cardX + 24 * scale, lineY, '   • 平均有效淨寬:', `${sw.avg_effective_width_m || 0} m`, sw.avg_effective_width_m >= 1.5 ? '#4ade80' : '#f87171', scale);
      lineY += stepY;
      this.drawMetricRow(ctx, cardX + 24 * scale, lineY, '🏪 生活機能 (45%):', `${score.i_live || 0} 分 (POI: ${poi.total_poi || 0}處)`, '#86efac', scale);
      lineY += stepY;
      this.drawMetricRow(ctx, cardX + 24 * scale, lineY, '🛡️ 交通安全 (10%):', `${score.s_safety || 0} 分 (近3年A1: ${acc.a1_count || 0}, A2: ${acc.a2_count || 0})`, '#fca5a5', scale);
      lineY += stepY;
      this.drawMetricRow(ctx, cardX + 24 * scale, lineY, '👥 涵蓋推估人口:', `${(pop.total_population || 0).toLocaleString()} 人 (${(pop.density_per_km2 || 0).toLocaleString()} 人/km²)`, '#cbd5e1', scale);

      // 4. 底部中央浮水印
      this.drawRoundedRect(ctx, (w / 2) - (180 * scale), h - (40 * scale), 360 * scale, 30 * scale, 6 * scale, 'rgba(15, 23, 42, 0.7)');
      ctx.fillStyle = '#cbd5e1';
      ctx.font = `${12 * scale}px "Microsoft JhengHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('人本交通環境 WebGIS 資料平台 - 成果報告匯出', w / 2, h - (20 * scale));
      ctx.textAlign = 'left';

      // 5. 轉換為 Blob 並下載
      const filename = `人本交通評估報告_${this.formatDateFilename(new Date())}.png`;
      this.triggerDownload(outCanvas, filename);

    } catch (err) {
      console.error('[ReportExporter] 匯出失敗:', err);
      alert(`匯出成果圖失敗: ${err.message}`);
    } finally {
      this.isExporting = false;
    }
  }

  // 2. 匯出純地圖高解析畫面截圖
  exportMapSnapshot(map) {
    try {
      const mapCanvas = map.getCanvas();
      if (!mapCanvas) throw new Error("無法獲取地圖畫面");
      const filename = `WebGIS地圖截圖_${this.formatDateFilename(new Date())}.png`;
      this.triggerDownload(mapCanvas, filename);
    } catch (err) {
      console.error('[ReportExporter] 截圖失敗:', err);
      alert(`截圖失敗: ${err.message}`);
    }
  }

  // 繪製單行指標資訊 (文字靠左，數值靠右)
  drawMetricRow(ctx, x, y, label, val, valColor, scale) {
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

  // 日期字串格式化 (YYYYMMDD_HHmm)
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
      console.log(`[ReportExporter] 成功下載圖片: ${filename}`);
    }, 'image/png');
  }
}

window.ReportExporter = ReportExporter;
