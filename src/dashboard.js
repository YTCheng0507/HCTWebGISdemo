// ========================================================================
// 【Dashboard 儀表板：整合正面評估版 V2 模型與七大類 POI 視覺化】
// ========================================================================

class DashboardManager {
  constructor() {
    this.drawer = document.getElementById('right-drawer');
    this.drawerTitle = document.getElementById('drawer-title');
    this.drawerContent = document.getElementById('drawer-content');
    this.drawerTabs = document.getElementById('drawer-analysis-tabs');
    this.currentTab = 'overview';
    this.accidentChart = null;
    this.poiChart = null;
    this.currentAnalysisData = null;
    this.initEvents();
  }

  initEvents() {
    window.addEventListener('object-selected', (e) => {
      this.renderObjectProperties(e.detail);
    });

    window.addEventListener('analysis-start', () => {
      this.showLoading();
    });

    window.addEventListener('analysis-complete', (e) => {
      this.renderAnalysisResult(e.detail);
    });

    window.addEventListener('analysis-error', () => {
      this.closeDrawer();
    });

    const closeBtn = document.getElementById('drawer-close-btn');
    if (closeBtn) {
      const handleClose = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeDrawer();
      };
      closeBtn.addEventListener('click', handleClose);
      closeBtn.addEventListener('touchend', handleClose);
    }

    if (this.drawerTabs) {
      this.drawerTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.drawer-tab-btn');
        if (btn && btn.dataset.tab) {
          this.switchTab(btn.dataset.tab);
        }
      });
    }

    window.addEventListener('resize', () => {
      if (this.accidentChart) this.accidentChart.resize();
      if (this.poiChart) this.poiChart.resize();
    });
  }

  switchTab(tabKey) {
    this.currentTab = tabKey;
    if (this.drawerTabs) {
      this.drawerTabs.querySelectorAll('.drawer-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabKey);
      });
    }
    const panes = this.drawerContent.querySelectorAll('.drawer-tab-pane');
    panes.forEach(pane => {
      pane.classList.toggle('active', pane.id === `pane-${tabKey}`);
    });

    // 分頁切換時立即觸發圖表尺寸重新計算，徹底避免寬高擠壓
    setTimeout(() => {
      if (tabKey === 'accidents' && this.accidentChart) {
        this.accidentChart.resize();
      } else if (tabKey === 'poi' && this.poiChart) {
        this.poiChart.resize();
      }
    }, 60);
  }

  openDrawer() {
    this.drawer.classList.add('open');
    if (window.MobileUI && window.MobileUI.isPortrait && window.MobileUI.isPortrait()) {
      this.drawer.classList.add('mobile-sheet-show');
      this.drawer.style.transform = '';
    } else {
      this.drawer.style.transform = 'translateX(0)';
    }
  }

  closeDrawer() {
    this.drawer.classList.remove('open');
    this.drawer.classList.remove('mobile-sheet-show');
    if (window.MobileUI && window.MobileUI.isPortrait && window.MobileUI.isPortrait()) {
      this.drawer.style.transform = 'translateY(115%)';
    } else {
      this.drawer.style.transform = 'translateX(115%)';
    }
  }

  showLoading() {
    this.openDrawer();
    if (this.drawerTabs) this.drawerTabs.style.display = 'none';
    this.drawerTitle.innerHTML = '空間動態交集運算中...';
    this.drawerContent.innerHTML = `
      <div class="empty-hint">
        <div class="spinner" style="margin: 0 auto 16px auto;"></div>
        <p style="font-weight: bold; font-size: 14px; color: #1e293b;">正在執行長度權重加權與面積比例分攤...</p>
        <p style="font-size: 12px; color: #64748b; margin-top: 6px;">依據《人本交通環境評估模型》即時運算中</p>
      </div>
    `;
  }

  // 1. 渲染單一物件屬性檢視 (包含 POI 七大分類與資料來源)
  renderObjectProperties({ layerId, properties }) {
    this.openDrawer();
    if (this.drawerTabs) this.drawerTabs.style.display = 'none';
    
    let title = "物件詳細資訊";
    let rowsHtml = "";

    if (layerId === 'layer-poi' || layerId === 'analysis-highlight-poi') {
      const catInfo = window.APP_CONFIG.poiCategories[properties.TYPE] || { color: '#636e72', label: properties.TYPE };
      title = `${properties.POI_NAME || '未命名地標'}`;
      rowsHtml = `
        <tr><th>點位名稱</th><td><strong>${properties.POI_NAME || '-'}</strong></td></tr>
        <tr><th>七大類分類</th><td>
          <span style="background: ${catInfo.color}; color: white; padding: 2px 10px; border-radius: 12px; font-weight: bold; font-size: 12px;">
            ${properties.TYPE || '未分類'}
          </span>
        </td></tr>
        <tr><th>生活圈計分</th><td>
          ${(properties.IS_SCOREABLE === 0 || properties.IS_SCOREABLE === '0') ? 
            '<span style="color: #b91c1c; font-weight: bold;">[排除計分] (全市稀有特例，不納入步行豐富度加分)</span>' : 
            '<span style="color: #15803d;">✓ 納入生活圈豐富度計分</span>'}
        </td></tr>
        <tr><th>細部類別 (代碼)</th><td><code>${properties.SUB_CLASS || '-'}</code></td></tr>
        <tr><th>資料來源</th><td><strong style="color: #0284c7;">${properties.SOURCE || '通用版電子地圖'}</strong></td></tr>
        <tr><th>行政區</th><td>${properties.TOWNNAME || '-'}</td></tr>
        <tr><th>地標編號 (ID)</th><td>${properties.POI_ID || '-'}</td></tr>
      `;
    } else if (layerId === 'layer-sidewalk') {
      const isOk = (properties.SWW_WTH || 0) >= 1.5;
      title = `人行道: ${properties.NAME || '未命名路段'}`;
      rowsHtml = `
        <tr><th>人行道編號 (ID)</th><td>${properties.ID || '-'}</td></tr>
        <tr><th>道路名稱 (NAME)</th><td>${properties.NAME || '-'}</td></tr>
        <tr><th>有效淨寬度 (SWW_WTH)</th><td>
          <span style="color: ${isOk ? '#27ae60' : '#e74c3c'}; font-weight: bold; font-size: 15px;">
            ${properties.SWW_WTH || 0} m ${isOk ? '(合規 ≥ 1.5m)' : '(淨寬不足)'}
          </span>
        </td></tr>
        <tr><th>人行道總寬 (SW_WTH)</th><td>${properties.SW_WTH || 0} m</td></tr>
        <tr><th>鋪面材質 (SW_PAVE)</th><td>${properties.SW_PAVE || '一般鋪面'}</td></tr>
        <tr><th>鋪面破損率 (SW_BRKRAT)</th><td>${properties.SW_BRKRAT || 0} %</td></tr>
        <tr><th>電箱占用 (SW_BK_B)</th><td>${properties.SW_BK_B || 0} 處</td></tr>
        <tr><th>桿類占用 (SW_BK_L)</th><td>${properties.SW_BK_L || 0} 處</td></tr>
        <tr><th>騎樓行走 (ARCADE)</th><td>${properties.ARCADE || '否'}</td></tr>
        <tr><th>騎樓平整度 (AC_EVEN)</th><td>${properties.AC_EVEN || '-'}</td></tr>
      `;
    } else if (layerId === 'layer-road-priority') {
      title = `道路步行環境: ${properties.ROADNAME_F || '路廊'}`;
      const iTotal = parseFloat(properties.I_TOTAL) || 0;
      const walkScore = Math.max(0, Math.min(100, Math.round((100 - iTotal) * 10) / 10));
      let gradeText = 'E級 (亟待改善)';
      let gradeColor = '#dc2626';
      let gradeBg = '#fee2e2';

      if (walkScore >= 80) {
        gradeText = 'A級 (優良環境)';
        gradeColor = '#16a34a';
        gradeBg = '#dcfce7';
      } else if (walkScore >= 65) {
        gradeText = 'B級 (良好通行)';
        gradeColor = '#0d9488';
        gradeBg = '#ccfbf1';
      } else if (walkScore >= 50) {
        gradeText = 'C級 (普通環境)';
        gradeColor = '#d97706';
        gradeBg = '#fef3c7';
      } else if (walkScore >= 35) {
        gradeText = 'D級 (待改善)';
        gradeColor = '#ea580c';
        gradeBg = '#ffedd5';
      }

      rowsHtml = `
        <tr><th>道路名稱</th><td><strong>${properties.ROADNAME_F || '-'}</strong></td></tr>
        <tr><th>行政區</th><td>${properties.TOWNNAME || '-'}</td></tr>
        <tr><th>路段總長</th><td>${properties.LENGTH || '-'} m</td></tr>
        <tr><th>路面寬度</th><td>${properties.WIDTH || '-'} m</td></tr>
        <tr><th>步行良好度評分</th><td>
          <strong style="color: ${gradeColor}; font-size: 18px; font-weight: 800;">${walkScore}</strong>
          <span style="color: #64748b; font-size: 12px;"> / 100 分</span>
        </td></tr>
        <tr><th>步行環境品質</th><td>
          <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-weight: bold; font-size: 12px; color: ${gradeColor}; background: ${gradeBg}; border: 1px solid ${gradeColor}40;">
            ${gradeText}
          </span>
        </td></tr>
        <tr style="border-top: 1px dashed #cbd5e1;"><th style="color: #64748b;">工務改善優先度</th><td style="color: #475569;">${properties.PRIORITY || '-'} (全市第 ${properties.RANK || '-'} 名)</td></tr>
        <tr><th style="color: #64748b;">工務急迫扣分</th><td style="color: #475569;">${properties.I_TOTAL || '-'} 分 (人行道扣分: ${properties.I_SIDEWALK || '-'}, 事故扣分: ${properties.I_ACCIDENT || '-'})</td></tr>
        <tr><th>歷年事故統計</th><td>A1 (死亡): ${properties.CNT_A1 || 0} 件, A2 (受傷): ${properties.CNT_A2 || 0} 件</td></tr>
      `;
    } else if (layerId === 'layer-accidents' || layerId === 'analysis-highlight-accidents') {
      title = `交通事故 (${properties.ACC_TYPE || '事故'})`;
      rowsHtml = `
        <tr><th>事故類型</th><td><strong style="color: ${properties.ACC_TYPE === 'A1' ? '#dc2626' : '#ea580c'};">▲ ${properties.ACC_TYPE === 'A1' ? 'A1 (死亡事故)' : 'A2 (受傷事故)'}</strong></td></tr>
        <tr><th>發生年份</th><td>民國 ${properties.YEAR || '-'} 年</td></tr>
        <tr><th>死亡人數</th><td>${properties.DEAD_CNT || 0} 人</td></tr>
        <tr><th>受傷人數</th><td>${properties.INJ_CNT || 0} 人</td></tr>
        <tr><th>事故位置</th><td>${properties.LOCATION || '-'}</td></tr>
      `;
    } else if (layerId === 'layer-village-boundary-fill') {
      let villNameDisplay = properties.VILLNAME;
      let note = "一般民政村里編組。";
      if (!villNameDisplay || villNameDisplay === '-' || villNameDisplay === 'None') {
        const code = String(properties.VILLCODE || '');
        if (code.includes('S')) {
          villNameDisplay = '<span style="color: #ea580c; font-weight: bold;">未編定村里 (軍事用地／要塞管制區)</span>';
          note = '國防軍事基地或營區（如岡山空軍官校與基地營區），依國土測繪中心標準不編設民政村里。';
        } else if (code.includes('I')) {
          villNameDisplay = '<span style="color: #0284c7; font-weight: bold;">未編定村里 (外海島嶼／礁石)</span>';
          note = '轄區外海附屬島嶼或礁石，無常住人口設里。';
        } else if (code.includes('P')) {
          villNameDisplay = '<span style="color: #0d9488; font-weight: bold;">未編定村里 (港口專用區)</span>';
          note = '商港或特定港務管制專區。';
        } else {
          villNameDisplay = '<span style="color: #64748b; font-weight: bold;">未編定村里 (特殊公有地)</span>';
          note = '特殊管制或公有地，不編設村里。';
        }
      } else {
        villNameDisplay = `<strong>${villNameDisplay}</strong>`;
      }
      title = `村里界線: ${properties.VILLNAME || '未編定村里'}`;
      rowsHtml = `
        <tr><th>所屬行政區</th><td>${properties.TOWNNAME || '-'}</td></tr>
        <tr><th>村里名稱</th><td>${villNameDisplay}</td></tr>
        <tr><th>村里代碼</th><td><code>${properties.VILLCODE || '-'}</code></td></tr>
        <tr><th>區域性質說明</th><td style="font-size: 12px; color: #475569;">${note}</td></tr>
      `;
    } else if (layerId === 'layer-town-boundary-fill') {
      title = `行政區界: ${properties.TOWNNAME || '-'}`;
      rowsHtml = `
        <tr><th>行政區名稱</th><td><strong style="color: #2563eb; font-size: 16px;">${properties.TOWNNAME || '-'}</strong></td></tr>
        <tr><th>行政區代碼</th><td><code>${properties.TOWNCODE || '-'}</code></td></tr>
        <tr><th>所屬縣市</th><td>${properties.COUNTYNAME || '高雄市'}</td></tr>
      `;
    } else {
      title = "圖層物件屬性";
      for (const [k, v] of Object.entries(properties)) {
        if (typeof v !== 'object') {
          rowsHtml += `<tr><th>${k}</th><td>${v}</td></tr>`;
        }
      }
    }

    this.drawerTitle.innerText = title;
    this.drawerContent.innerHTML = `
      <table class="prop-table">
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  }

  // 2. 渲染框選「人本交通環境評估儀表板」(4 大可切換子分頁 + 順暢滾動)
  renderAnalysisResult(data) {
    this.openDrawer();
    this.currentAnalysisData = data;
    this.drawerTitle.innerHTML = `人本交通環境評估儀表板`;

    // 顯示子分頁導覽列並預設選中 overview
    if (this.drawerTabs) {
      this.drawerTabs.style.display = 'flex';
      this.drawerTabs.querySelectorAll('.drawer-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === this.currentTab);
      });
    }

    const score = data.score || {};
    const pop = data.population || {};
    const sw = data.sidewalk || {};
    const acc = data.accidents || {};
    const poi = data.poi || {};

    const isUnscoreable = score.is_evaluable === false || (score.env_level && score.env_level.includes('不適用'));

    const levelColors = {
      "A級": "badge-low",    // 優良 (綠)
      "B級": "badge-mid",    // 良好 (青綠/黃)
      "C級": "badge-mid",    // 普通 (黃)
      "D級": "badge-high",   // 待改善 (橙)
      "E級": "badge-urgent"  // 亟需改善 (紅)
    };
    const prefix = (score.env_level || "").substring(0, 2);
    const badgeClass = isUnscoreable ? "badge-neutral" : (levelColors[prefix] || "badge-mid");

    // 計算合規長度與佔比
    const totalSwLen = sw.total_length_m || 0;
    const insuffLen = sw.insufficient_width_m || 0;
    const suffLen = sw.sufficient_width_m || Math.max(0, totalSwLen - insuffLen);
    const suffRate = totalSwLen > 0 ? ((suffLen / totalSwLen) * 100).toFixed(1) : '0.0';

    // POI 分類資料整理
    const poiCats = poi.categories || {};
    const totalPoi = poi.total_count || 0;

    const scoreNumDisplay = isUnscoreable ? '--' : (score.total_score !== undefined ? score.total_score : 0);
    const scoreNumColor = isUnscoreable ? '#94a3b8' : '#38bdf8';
    const scoreUnitDisplay = isUnscoreable ? '<span style="font-size: 14px; font-weight: normal; color: #94a3b8;">/ 100 分 (不適用)</span>' : '<span style="font-size: 15px; font-weight: normal; color: #94a3b8;">/ 100 分</span>';
    const badgeStyle = isUnscoreable ? 'background: #475569; color: #f8fafc; border: 1px solid #64748b;' : '';

    const unscoreableNotice = isUnscoreable ? `
      <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px 14px; margin-top: 12px; font-size: 13px; color: #9a3412; line-height: 1.5; display: flex; align-items: flex-start; gap: 8px;">
        <span style="font-size: 18px; line-height: 1;">⚠️</span>
        <div>
          <div style="font-weight: bold; margin-bottom: 2px;">範圍內無道路與人行道資料，不予分析</div>
          <div>${score.unscoreable_reason || '所選範圍內查無道路與人行道資料，不予分析。請重新框選包含道路的區域。'}</div>
        </div>
      </div>
    ` : '';

    const sWalkDisplay = isUnscoreable ? '--' : `${score.s_walk || 0} 分`;
    const sSafetyDisplay = isUnscoreable ? '--' : `${score.s_safety || 0} 分`;
    const sLiveDisplay = isUnscoreable ? '--' : `${score.i_live || 0} 分`;

    this.drawerContent.innerHTML = `
      <!-- 分頁 1：📌 綜合總覽 -->
      <div id="pane-overview" class="drawer-tab-pane ${this.currentTab === 'overview' ? 'active' : ''}">
        <!-- 成果圖匯出按鈕 -->
        <button id="btn-export-report" class="btn" style="width: 100%; padding: 11px 14px; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; font-weight: 700; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35); transition: transform 0.15s;">
          📥 輸出評估成果圖 (PNG 高解析度下載)
        </button>

        <!-- 總分 Banner (高對比深色科技卡片) -->
        <div class="score-banner" style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 18px; border-radius: 10px; border: 1px solid #334155; box-shadow: 0 4px 14px rgba(0,0,0,0.25);">
          <div>
            <div style="font-size: 13px; color: #94a3b8; font-weight: 600;">人本步行環境優良度總分</div>
            <div class="score-num" style="color: ${scoreNumColor}; font-size: 38px; font-weight: 800; line-height: 1.1; margin: 4px 0;">
              ${scoreNumDisplay} ${scoreUnitDisplay}
            </div>
            <span class="score-badge ${badgeClass}" style="font-size: 13px; padding: 4px 12px; font-weight: bold; ${badgeStyle}">${score.env_level || '評估完成'}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; text-align: right; justify-content: center;">
            <div style="background: rgba(56, 189, 248, 0.12); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.25);">
              <span style="color: #cbd5e1;">🚶 步行環境 (45%):</span> <strong style="color: #38bdf8; font-size: 14px; margin-left: 4px;">${sWalkDisplay}</strong>
            </div>
            <div style="background: rgba(244, 63, 94, 0.12); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(244, 63, 94, 0.25);">
              <span style="color: #cbd5e1;">🛡️ 交通安全 (10%):</span> <strong style="color: #fb7185; font-size: 14px; margin-left: 4px;">${sSafetyDisplay}</strong>
            </div>
            <div style="background: rgba(34, 197, 94, 0.12); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(34, 197, 94, 0.25);">
              <span style="color: #cbd5e1;">🏪 生活機能 (45%):</span> <strong style="color: #4ade80; font-size: 14px; margin-left: 4px;">${sLiveDisplay}</strong>
            </div>
          </div>
        </div>

        ${unscoreableNotice}

        <!-- 區域空間與人口環境核心卡片 -->
        <div class="section-title">區域空間與人口環境 (面積比例分攤)</div>
        <div class="stats-grid">
          <div class="stat-card highlight">
            <span class="stat-label">框選推估總人口</span>
            <span class="stat-value">${(pop.total_population || 0).toLocaleString()}<span class="stat-unit">人</span></span>
          </div>
          <div class="stat-card">
            <span class="stat-label">區域實質人口密度</span>
            <span class="stat-value">${(pop.density_per_km2 || 0).toLocaleString()}<span class="stat-unit">人/km²</span></span>
          </div>
          <div class="stat-card">
            <span class="stat-label">框內人行道總長</span>
            <span class="stat-value">${totalSwLen.toLocaleString()}<span class="stat-unit">m</span></span>
          </div>
          <div class="stat-card">
            <span class="stat-label">平均有效淨寬</span>
            <span class="stat-value" style="color: ${(sw.avg_effective_width_m || 0) < 1.5 ? '#e11d48' : '#16a34a'}">
              ${sw.avg_effective_width_m || 0}<span class="stat-unit">m ${(sw.avg_effective_width_m || 0) >= 1.5 ? '(合規)' : '(不足)'}</span>
            </span>
          </div>
          <div class="stat-card">
            <span class="stat-label">淨寬不足路段 (< 1.5m)</span>
            <span class="stat-value" style="color: ${insuffLen > 0 ? '#e11d48' : '#16a34a'};">
              ${insuffLen.toLocaleString()}<span class="stat-unit">m</span>
            </span>
          </div>
          <div class="stat-card">
            <span class="stat-label">箱桿占用與破損</span>
            <span class="stat-value">${(sw.obstacle_count || 0) + (sw.broken_count || 0)}<span class="stat-unit">處</span></span>
          </div>
        </div>

        <!-- 快速跨分頁導引捷徑 -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 12px; font-weight: 700; color: #475569;">💡 深入查看專項分析與統計圖表：</div>
          <div style="display: grid; grid-template-columns: 1fr; gap: 6px;">
            <button type="button" class="btn-goto-tab" data-tab="accidents" style="padding: 8px 12px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; text-align: left; font-size: 12.5px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
              <span>🛡️ <strong>近三年涉入事故</strong>：共 ${acc.total_count || 0} 件 (A1: ${acc.total_a1 || 0}, A2: ${acc.total_a2 || 0})</span>
              <span style="color: #2563eb; font-weight: bold;">查看圖表 →</span>
            </button>
            <button type="button" class="btn-goto-tab" data-tab="poi" style="padding: 8px 12px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; text-align: left; font-size: 12.5px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
              <span>🏪 <strong>生活圈 POI 設施</strong>：共 ${totalPoi} 處 (七大分類)</span>
              <span style="color: #2563eb; font-weight: bold;">查看圖表 →</span>
            </button>
            <button type="button" class="btn-goto-tab" data-tab="sidewalk" style="padding: 8px 12px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; text-align: left; font-size: 12.5px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
              <span>🚶 <strong>人行道淨寬與平整度</strong>：合規率 ${suffRate}%</span>
              <span style="color: #2563eb; font-weight: bold;">查看詳情 →</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 分頁 2：🛡️ 交通事故 -->
      <div id="pane-accidents" class="drawer-tab-pane ${this.currentTab === 'accidents' ? 'active' : ''}">
        <!-- 事故總覽卡 -->
        <div style="background: #fff; border: 1px solid #fecaca; border-left: 4px solid #ef4444; border-radius: 8px; padding: 12px;">
          <div style="font-weight: 700; font-size: 14px; color: #991b1b; margin-bottom: 4px;">框內行人涉入交通事故總結</div>
          <div style="display: flex; gap: 16px; font-size: 13px; color: #334155; margin-top: 6px;">
            <div>事故件數：<strong style="color: #dc2626; font-size: 16px;">${acc.total_count || 0}</strong> 件</div>
            <div>A1死亡：<strong style="color: #dc2626;">${acc.total_a1 || 0}</strong> 件 (${acc.total_dead || 0} 死)</div>
            <div>A2受傷：<strong style="color: #ea580c;">${acc.total_a2 || 0}</strong> 件 (${acc.total_inj || 0} 傷)</div>
          </div>
          <div style="font-size: 12px; color: #64748b; margin-top: 8px; line-height: 1.4;">
            ※ 地圖上已將範圍內事故點位高亮呈現為 <strong style="color: #dc2626;">▲ 警示三角形</strong>，點選標記可查看詳細肇事地點與死傷統計。
          </div>
        </div>

        <!-- 近三年事故拆分長條圖 (111-113年) -->
        <div class="section-title">近三年行人涉入事故統計 (民國 111-113 年分年統計)</div>
        <div id="chart-accidents" class="chart-container" style="height: 260px; min-height: 260px; width: 100%; padding: 8px;"></div>

        <!-- 歷年對比統計小卡 -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; font-size: 12px; color: #475569;">
          <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">歷年事故件數分佈：</div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center;">
            <div style="background: #fff; padding: 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
              <div>111 年</div>
              <strong style="font-size: 14px; color: #1e293b;">${(acc.by_year?.[111]?.a1 || 0) + (acc.by_year?.[111]?.a2 || 0)} 件</strong>
            </div>
            <div style="background: #fff; padding: 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
              <div>112 年</div>
              <strong style="font-size: 14px; color: #1e293b;">${(acc.by_year?.[112]?.a1 || 0) + (acc.by_year?.[112]?.a2 || 0)} 件</strong>
            </div>
            <div style="background: #fff; padding: 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
              <div>113 年</div>
              <strong style="font-size: 14px; color: #1e293b;">${(acc.by_year?.[113]?.a1 || 0) + (acc.by_year?.[113]?.a2 || 0)} 件</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- 分頁 3：🏪 生活機能 -->
      <div id="pane-poi" class="drawer-tab-pane ${this.currentTab === 'poi' ? 'active' : ''}">
        <!-- POI 設施概況卡 -->
        <div style="background: #fff; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; border-radius: 8px; padding: 12px;">
          <div style="font-weight: 700; font-size: 14px; color: #166534; margin-bottom: 4px;">生活圈 POI 設施總覽</div>
          <div style="display: flex; gap: 16px; font-size: 13px; color: #334155; margin-top: 6px;">
            <div>設施總數：<strong style="color: #16a34a; font-size: 16px;">${totalPoi}</strong> 處</div>
            <div>計分設施：<strong style="color: #0284c7;">${poi.total_scoreable || totalPoi}</strong> 處</div>
            <div>機能評估分：<strong style="color: #16a34a;">${score.i_live || 0}</strong> 分</div>
          </div>
          <div style="font-size: 12px; color: #64748b; margin-top: 8px; line-height: 1.4;">
            ※ 地圖已高亮顯示範圍內之生活設施圓點，點擊地圖圓點可查看設施名稱、子分類與資料來源。
          </div>
        </div>

        <!-- 臺灣通用電子地圖七大分類圓環圖 -->
        <div class="section-title">生活圈 POI 設施分佈 (通用電子地圖七大分類)</div>
        <div id="chart-poi" class="chart-container" style="height: 280px; min-height: 280px; width: 100%; padding: 8px;"></div>

        <!-- 七大分類詳細清單 -->
        <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px;">
          <div style="font-weight: 700; font-size: 13px; color: #1e293b; margin-bottom: 8px;">各類別設施數量與佔比：</div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${Object.entries(window.APP_CONFIG.poiCategories).map(([catName, conf]) => {
              const count = poiCats[catName] || 0;
              const pct = totalPoi > 0 ? ((count / totalPoi) * 100).toFixed(1) : 0;
              return `
                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; padding: 4px 6px; border-radius: 4px; background: #f8fafc;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: ${conf.color}; display: inline-block;"></span>
                    <span style="color: #334155;">${catName}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <strong style="color: #0f172a;">${count} 處</strong>
                    <span style="color: #94a3b8; font-size: 11px; width: 40px; text-align: right;">${pct}%</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- 分頁 4：🚶 人行環境 -->
      <div id="pane-sidewalk" class="drawer-tab-pane ${this.currentTab === 'sidewalk' ? 'active' : ''}">
        <!-- 國家標準淨寬合規檢驗 -->
        <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
          <div style="font-weight: 700; font-size: 14px; color: #1e293b; margin-bottom: 4px;">國家標準人行道淨寬合規評估 (≥ 1.5m)</div>
          <div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">依市區道路人行道標準規範，通行淨寬應大於等於 1.5 公尺。</div>
          
          <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr); margin-bottom: 10px;">
            <div class="stat-card" style="background: #f0fdf4; border-color: #bbf7d0;">
              <span class="stat-label" style="color: #166534;">淨寬合規路段 (≥1.5m)</span>
              <span class="stat-value" style="color: #16a34a;">${suffLen.toLocaleString()}<span class="stat-unit">m</span></span>
            </div>
            <div class="stat-card" style="background: #fef2f2; border-color: #fecaca;">
              <span class="stat-label" style="color: #991b1b;">淨寬不足路段 (<1.5m)</span>
              <span class="stat-value" style="color: #dc2626;">${insuffLen.toLocaleString()}<span class="stat-unit">m</span></span>
            </div>
          </div>

          <!-- 合規比例進度條 -->
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
              <span>合規長度比率：</span>
              <strong style="color: ${parseFloat(suffRate) >= 70 ? '#16a34a' : '#e11d48'};">${suffRate}%</strong>
            </div>
            <div style="width: 100%; height: 8px; background: #fee2e2; border-radius: 4px; overflow: hidden;">
              <div style="width: ${suffRate}%; height: 100%; background: #22c55e; border-radius: 4px;"></div>
            </div>
          </div>
        </div>

        <!-- 鋪面平整度與障礙物 -->
        <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
          <div style="font-weight: 700; font-size: 14px; color: #1e293b; margin-bottom: 8px;">鋪面品質與通行障礙分析</div>
          <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr);">
            <div class="stat-card">
              <span class="stat-label">鋪面破損處數</span>
              <span class="stat-value">${sw.broken_count || 0}<span class="stat-unit">處</span></span>
            </div>
            <div class="stat-card">
              <span class="stat-label">箱桿占用障礙</span>
              <span class="stat-value">${sw.obstacle_count || 0}<span class="stat-unit">處</span></span>
            </div>
            <div class="stat-card">
              <span class="stat-label">平均鋪面有效寬度</span>
              <span class="stat-value">${sw.avg_effective_width_m || 0}<span class="stat-unit">m</span></span>
            </div>
            <div class="stat-card">
              <span class="stat-label">人行道實體路段</span>
              <span class="stat-value">${sw.count || 0}<span class="stat-unit">段</span></span>
            </div>
          </div>
        </div>
      </div>
    `;

    // 綁定成果圖匯出與快速導航按鈕
    setTimeout(() => {
      this.initAccidentChart(acc.by_year || {});
      this.initPoiChart(poiCats);

      const btnExport = document.getElementById('btn-export-report');
      if (btnExport) {
        btnExport.addEventListener('click', () => {
          window.dispatchEvent(new CustomEvent('export-report-requested', { detail: data }));
        });
      }

      this.drawerContent.querySelectorAll('.btn-goto-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.tab;
          if (tab) this.switchTab(tab);
        });
      });
    }, 60);
  }

  initAccidentChart(yearsData) {
    const chartDom = document.getElementById('chart-accidents');
    if (!chartDom) return;
    if (this.accidentChart) this.accidentChart.dispose();
    this.accidentChart = echarts.init(chartDom);

    const years = ['111年', '112年', '113年'];
    const a1Data = [yearsData[111]?.a1 || 0, yearsData[112]?.a1 || 0, yearsData[113]?.a1 || 0];
    const a2Data = [yearsData[111]?.a2 || 0, yearsData[112]?.a2 || 0, yearsData[113]?.a2 || 0];

    const option = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        data: ['A1 死亡事故 (▲)', 'A2 受傷事故 (▲)'],
        top: '2%',
        textStyle: { fontSize: 12, fontWeight: 'bold', color: '#334155' },
        itemGap: 16
      },
      grid: { left: '3%', right: '4%', bottom: '5%', top: '20%', containLabel: true },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: { fontSize: 12, fontWeight: 'bold', color: '#475569' },
        axisLine: { lineStyle: { color: '#cbd5e1' } }
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { fontSize: 11, color: '#64748b' },
        splitLine: { lineStyle: { type: 'dashed', color: '#f1f5f9' } }
      },
      series: [
        {
          name: 'A1 死亡事故 (▲)',
          type: 'bar',
          stack: 'total',
          color: '#dc2626',
          barWidth: '38%',
          label: {
            show: true,
            position: 'inside',
            formatter: (p) => p.value > 0 ? `${p.value}件` : '',
            fontSize: 11,
            fontWeight: 'bold',
            color: '#fff'
          },
          data: a1Data
        },
        {
          name: 'A2 受傷事故 (▲)',
          type: 'bar',
          stack: 'total',
          color: '#ea580c',
          barWidth: '38%',
          label: {
            show: true,
            position: 'inside',
            formatter: (p) => p.value > 0 ? `${p.value}件` : '',
            fontSize: 11,
            fontWeight: 'bold',
            color: '#fff'
          },
          data: a2Data
        }
      ]
    };
    this.accidentChart.setOption(option);
  }

  initPoiChart(categories) {
    const chartDom = document.getElementById('chart-poi');
    if (!chartDom) return;
    if (this.poiChart) this.poiChart.dispose();
    this.poiChart = echarts.init(chartDom);

    const data = Object.entries(categories).map(([k, count]) => {
      const conf = window.APP_CONFIG.poiCategories[k] || { color: '#636e72', label: k };
      return {
        name: k,
        value: count,
        itemStyle: { color: conf.color }
      };
    }).filter(d => d.value > 0);

    const totalCount = data.reduce((sum, d) => sum + d.value, 0);

    const option = {
      tooltip: { trigger: 'item', formatter: '{b}: <strong>{c} 處</strong> ({d}%)' },
      legend: {
        orient: 'vertical',
        right: '2%',
        top: 'middle',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { fontSize: 11, color: '#334155' },
        formatter: (name) => {
          const item = data.find(d => d.name === name);
          const val = item ? item.value : 0;
          return `${name} (${val}處)`;
        }
      },
      series: [
        {
          name: '七大分類',
          type: 'pie',
          radius: ['45%', '72%'],
          center: ['28%', '50%'],
          avoidLabelOverlap: false,
          label: {
            show: false
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 13,
              fontWeight: 'bold',
              formatter: '{b}\n{c} 處'
            }
          },
          data: data.length > 0 ? data : [{ value: 0, name: '無設施' }]
        }
      ],
      graphic: [{
        type: 'text',
        left: '24%',
        top: '46%',
        style: {
          text: `設施共\n${totalCount} 處`,
          textAlign: 'center',
          fill: '#1e293b',
          fontSize: 13,
          fontWeight: 'bold'
        }
      }]
    };
    this.poiChart.setOption(option);
  }
}

window.DashboardManager = DashboardManager;
