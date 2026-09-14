// ========================================================================
// 【系統管理員登入與線上圖資維護控制台模組】
// 提供非技術人員直接在瀏覽器線上置換 GeoJSON 圖資、微調評鑑權重與管理快取
// ========================================================================

class AdminPanel {
  constructor() {
    this.token = sessionStorage.getItem('admin_token') || null;
    this.initElements();
    this.bindEvents();
    this.updateAuthState();
  }

  initElements() {
    // 導覽列按鈕
    this.btnOpenLogin = document.getElementById('btn-open-login');
    this.adminUserControls = document.getElementById('admin-user-controls');
    this.btnOpenPanel = document.getElementById('btn-open-panel');
    this.btnLogout = document.getElementById('btn-admin-logout');

    // 登入彈窗
    this.modalLogin = document.getElementById('modal-admin-login');
    this.btnCloseLogin = document.getElementById('btn-close-login');
    this.btnCancelLogin = document.getElementById('btn-cancel-login');
    this.btnSubmitLogin = document.getElementById('btn-submit-login');
    this.inputPassword = document.getElementById('admin-password-input');
    this.loginError = document.getElementById('admin-login-error');

    // 維護後台彈窗
    this.modalPanel = document.getElementById('modal-admin-panel');
    this.btnClosePanel = document.getElementById('btn-close-panel');
    this.tabBtns = document.querySelectorAll('.admin-tab-btn');
    this.tabPanes = document.querySelectorAll('.admin-tab-pane');

    // 分頁 1: 圖資上傳
    this.uploadCountySelect = document.getElementById('admin-upload-county');
    this.uploadTypeSelect = document.getElementById('admin-upload-type');
    this.uploadFileInput = document.getElementById('admin-upload-file');
    this.fileInfo = document.getElementById('admin-file-info');
    this.uploadStatus = document.getElementById('admin-upload-status');
    this.btnSubmitUpload = document.getElementById('btn-submit-upload');

    // 分頁 2: 權重微調
    this.sliderWalk = document.getElementById('input-weight-walk');
    this.sliderSafety = document.getElementById('input-weight-safety');
    this.sliderLive = document.getElementById('input-weight-live');
    this.labelWalk = document.getElementById('label-weight-walk');
    this.labelSafety = document.getElementById('label-weight-safety');
    this.labelLive = document.getElementById('label-weight-live');
    this.weightWarning = document.getElementById('weight-sum-warning');
    this.inputWidth = document.getElementById('input-threshold-width');
    this.btnSaveWeights = document.getElementById('btn-save-weights');
    this.btnResetWeights = document.getElementById('btn-reset-weights');
    this.weightStatus = document.getElementById('admin-weight-status');

    // 分頁 3: 系統狀態與快取
    this.statusDetails = document.getElementById('admin-status-details');
    this.btnReloadCache = document.getElementById('btn-reload-cache');
    this.reloadStatus = document.getElementById('admin-reload-status');
  }

  bindEvents() {
    // 登入按鈕
    if (this.btnOpenLogin) {
      this.btnOpenLogin.addEventListener('click', () => this.openLoginModal());
    }
    if (this.btnCloseLogin) {
      this.btnCloseLogin.addEventListener('click', () => this.closeLoginModal());
    }
    if (this.btnCancelLogin) {
      this.btnCancelLogin.addEventListener('click', () => this.closeLoginModal());
    }
    if (this.btnSubmitLogin) {
      this.btnSubmitLogin.addEventListener('click', () => this.submitLogin());
    }
    if (this.inputPassword) {
      this.inputPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.submitLogin();
      });
    }

    // 登出按鈕
    if (this.btnLogout) {
      this.btnLogout.addEventListener('click', () => this.logout());
    }

    // 打開維護後台
    if (this.btnOpenPanel) {
      this.btnOpenPanel.addEventListener('click', () => this.openPanelModal());
    }
    if (this.btnClosePanel) {
      this.btnClosePanel.addEventListener('click', () => this.closePanelModal());
    }

    // 分頁切換
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-admin-tab');
        this.tabBtns.forEach(b => b.classList.remove('active'));
        this.tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const pane = document.getElementById(targetTab);
        if (pane) pane.classList.add('active');

        if (targetTab === 'admin-tab-status') {
          this.fetchSystemStatus();
        } else if (targetTab === 'admin-tab-weights') {
          this.fetchWeights();
        }
      });
    });

    // 檔案選擇變更
    if (this.uploadFileInput) {
      this.uploadFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const mb = (file.size / (1024 * 1024)).toFixed(2);
          this.fileInfo.innerText = `📄 檔案大小: ${mb} MB (${file.size.toLocaleString()} bytes)`;
          this.fileInfo.style.color = file.size > 100 * 1024 * 1024 ? '#d97706' : '#16a34a';
        } else {
          this.fileInfo.innerText = '';
        }
      });
    }

    // 提交圖資上傳
    if (this.btnSubmitUpload) {
      this.btnSubmitUpload.addEventListener('click', () => this.uploadLayerFile());
    }

    // 權重滑桿聯動
    const onWeightChange = () => {
      const w1 = parseInt(this.sliderWalk.value, 10);
      const w2 = parseInt(this.sliderSafety.value, 10);
      const w3 = parseInt(this.sliderLive.value, 10);

      this.labelWalk.innerText = `${w1}%`;
      this.labelSafety.innerText = `${w2}%`;
      this.labelLive.innerText = `${w3}%`;

      const sum = w1 + w2 + w3;
      if (sum === 100) {
        this.weightWarning.innerText = `✓ 權重合計：100% (正常)`;
        this.weightWarning.style.color = '#16a34a';
      } else {
        this.weightWarning.innerText = `⚠️ 權重合計：${sum}% (建議調整至恰好 100%)`;
        this.weightWarning.style.color = '#d97706';
      }
    };

    if (this.sliderWalk) this.sliderWalk.addEventListener('input', onWeightChange);
    if (this.sliderSafety) this.sliderSafety.addEventListener('input', onWeightChange);
    if (this.sliderLive) this.sliderLive.addEventListener('input', onWeightChange);

    // 儲存權重
    if (this.btnSaveWeights) {
      this.btnSaveWeights.addEventListener('click', () => this.saveWeights());
    }
    if (this.btnResetWeights) {
      this.btnResetWeights.addEventListener('click', () => {
        this.sliderWalk.value = 45;
        this.sliderSafety.value = 10;
        this.sliderLive.value = 45;
        this.inputWidth.value = 1.5;
        onWeightChange();
      });
    }

    // 快取重新載入
    if (this.btnReloadCache) {
      this.btnReloadCache.addEventListener('click', () => this.reloadCache());
    }
  }

  updateAuthState() {
    if (this.token) {
      if (this.btnOpenLogin) this.btnOpenLogin.style.display = 'none';
      if (this.adminUserControls) this.adminUserControls.style.display = 'flex';
    } else {
      if (this.btnOpenLogin) this.btnOpenLogin.style.display = 'flex';
      if (this.adminUserControls) this.adminUserControls.style.display = 'none';
    }
  }

  openLoginModal() {
    if (this.modalLogin) {
      this.modalLogin.classList.add('show');
      if (this.loginError) this.loginError.style.display = 'none';
      if (this.inputPassword) {
        this.inputPassword.value = '';
        setTimeout(() => this.inputPassword.focus(), 100);
      }
    }
  }

  closeLoginModal() {
    if (this.modalLogin) {
      this.modalLogin.classList.remove('show');
    }
  }

  async submitLogin() {
    const password = this.inputPassword ? this.inputPassword.value.trim() : '';
    if (!password) {
      this.showLoginError('請輸入管理者密碼');
      return;
    }

    this.btnSubmitLogin.disabled = true;
    this.btnSubmitLogin.innerText = '驗證中...';

    try {
      const resp = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await resp.json();

      if (resp.ok && data.success) {
        this.token = data.token || 'admin-session-ok';
        sessionStorage.setItem('admin_token', this.token);
        this.updateAuthState();
        this.closeLoginModal();
        this.openPanelModal();
      } else {
        this.showLoginError(data.error || '密碼錯誤，請重新確認！');
      }
    } catch (e) {
      this.showLoginError(`連線錯誤: ${e.message}`);
    } finally {
      this.btnSubmitLogin.disabled = false;
      this.btnSubmitLogin.innerText = '登入系統';
    }
  }

  showLoginError(msg) {
    if (this.loginError) {
      this.loginError.innerText = msg;
      this.loginError.style.display = 'block';
    }
  }

  logout() {
    this.token = null;
    sessionStorage.removeItem('admin_token');
    this.updateAuthState();
    this.closePanelModal();
    alert('已成功登出管理者帳號。');
  }

  openPanelModal() {
    if (this.modalPanel) {
      this.modalPanel.classList.add('show');
      this.fetchSystemStatus();
    }
  }

  closePanelModal() {
    if (this.modalPanel) {
      this.modalPanel.classList.remove('show');
    }
  }

  async fetchSystemStatus() {
    if (!this.statusDetails) return;
    this.statusDetails.innerHTML = '<div style="color: #64748b;">🔄 正在讀取伺服器狀態與圖資快取...</div>';

    try {
      const resp = await fetch('/api/admin/status');
      const data = await resp.json();

      if (resp.ok) {
        const stats = data.layer_stats || {};
        const weights = data.weights || {};
        const layerNames = {
          'sidewalk': '🚶 人行道實體普查',
          'accidents': '🛡️ 交通事故統計',
          'poi': '🏪 生活機能 POI',
          'road_priority': '🛣️ 道路路網改善',
          'population_bsa': '👥 最小統計區人口',
          'town_boundary': '🏙️ 行政區界線',
          'village_boundary': '🏘️ 里界線圖資'
        };

        let layerHtml = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px;">';
        for (const [k, name] of Object.entries(layerNames)) {
          const cnt = stats[k] !== undefined ? `${stats[k].toLocaleString()} 筆` : '未載入';
          layerHtml += `<div style="background: #f8fafc; padding: 6px 10px; border-radius: 4px; border: 1px solid #e2e8f0; font-size: 12px;">
            <div style="font-weight: 600; color: #1e293b;">${name}</div>
            <div style="color: #0284c7; font-weight: 700;">${cnt}</div>
          </div>`;
        }
        layerHtml += '</div>';

        this.statusDetails.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
            <span>🟢 <strong>伺服器服務狀態</strong>: 運行正常 (Online)</span>
            <span style="font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">記憶體 STRtree 空間索引就緒</span>
          </div>
          <div style="margin-top: 4px;">
            <strong>當前快取縣市</strong>: <span>${(data.cached_counties || ['kaohsiung']).join(', ')}</span>
          </div>
          <div style="margin-top: 4px;">
            <strong>各圖層特徵物件數量 (Features)</strong>:
            ${layerHtml}
          </div>
        `;

        // 同步權重欄位
        if (weights.weight_walk !== undefined) {
          this.sliderWalk.value = Math.round(weights.weight_walk * 100);
          this.sliderSafety.value = Math.round(weights.weight_safety * 100);
          this.sliderLive.value = Math.round(weights.weight_live * 100);
          if (weights.threshold_width) this.inputWidth.value = weights.threshold_width;
          this.labelWalk.innerText = `${this.sliderWalk.value}%`;
          this.labelSafety.innerText = `${this.sliderSafety.value}%`;
          this.labelLive.innerText = `${this.sliderLive.value}%`;
        }
      } else {
        this.statusDetails.innerHTML = `<div style="color: #dc2626;">無法獲取伺服器狀態</div>`;
      }
    } catch (e) {
      this.statusDetails.innerHTML = `<div style="color: #dc2626;">連線失敗: ${e.message}</div>`;
    }
  }

  async fetchWeights() {
    try {
      const resp = await fetch('/api/admin/status');
      const data = await resp.json();
      if (resp.ok && data.weights) {
        const w = data.weights;
        this.sliderWalk.value = Math.round((w.weight_walk || 0.45) * 100);
        this.sliderSafety.value = Math.round((w.weight_safety || 0.10) * 100);
        this.sliderLive.value = Math.round((w.weight_live || 0.45) * 100);
        if (w.threshold_width) this.inputWidth.value = w.threshold_width;
        this.labelWalk.innerText = `${this.sliderWalk.value}%`;
        this.labelSafety.innerText = `${this.sliderSafety.value}%`;
        this.labelLive.innerText = `${this.sliderLive.value}%`;
      }
    } catch (e) {
      console.warn('無法更新權重設定:', e);
    }
  }

  async saveWeights() {
    const w1 = parseInt(this.sliderWalk.value, 10) / 100;
    const w2 = parseInt(this.sliderSafety.value, 10) / 100;
    const w3 = parseInt(this.sliderLive.value, 10) / 100;
    const width = parseFloat(this.inputWidth.value || '1.5');

    this.btnSaveWeights.disabled = true;
    this.btnSaveWeights.innerText = '儲存中...';
    this.weightStatus.style.display = 'none';

    try {
      const resp = await fetch('/api/admin/update_weights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weight_walk: w1,
          weight_safety: w2,
          weight_live: w3,
          threshold_width: width
        })
      });
      const data = await resp.json();

      if (resp.ok && data.success) {
        this.weightStatus.style.display = 'block';
        this.weightStatus.style.background = '#f0fdf4';
        this.weightStatus.style.color = '#16a34a';
        this.weightStatus.style.border = '1px solid #bbf7d0';
        this.weightStatus.innerText = '✅ 評鑑權重已成功即時更新！下次進行框選或生活圈分析將採用新設定。';
      } else {
        throw new Error(data.error || '儲存失敗');
      }
    } catch (e) {
      this.weightStatus.style.display = 'block';
      this.weightStatus.style.background = '#fef2f2';
      this.weightStatus.style.color = '#dc2626';
      this.weightStatus.style.border = '1px solid #fecaca';
      this.weightStatus.innerText = `❌ 更新失敗: ${e.message}`;
    } finally {
      this.btnSaveWeights.disabled = false;
      this.btnSaveWeights.innerText = '💾 儲存權重設定';
    }
  }

  async uploadLayerFile() {
    const file = this.uploadFileInput.files[0];
    if (!file) {
      alert('請先點擊按鈕選擇要上傳的 GeoJSON 檔案！');
      return;
    }

    const county = this.uploadCountySelect.value;
    const layer_key = this.uploadTypeSelect.value;

    if (!confirm(`確定要將本機檔案「${file.name}」上傳並覆蓋 ${county} 的「${layer_key}」圖資嗎？\n\n上傳完成後，後台將自動更新記憶體快取並同步刷新地圖顯示。`)) {
      return;
    }

    this.btnSubmitUpload.disabled = true;
    this.btnSubmitUpload.innerText = '⏳ 正在讀取並解析 GeoJSON...';
    this.uploadStatus.style.display = 'block';
    this.uploadStatus.style.background = '#eff6ff';
    this.uploadStatus.style.color = '#1d4ed8';
    this.uploadStatus.style.border = '1px solid #bfdbfe';
    this.uploadStatus.innerText = '正在讀取檔案內容，請稍候...';

    const reader = new FileReader();
    reader.onerror = () => {
      this.uploadStatus.style.background = '#fef2f2';
      this.uploadStatus.style.color = '#dc2626';
      this.uploadStatus.innerText = '❌ 本機讀取檔案失敗！';
      this.btnSubmitUpload.disabled = false;
      this.btnSubmitUpload.innerText = '🚀 確認上傳並更新圖資';
    };

    reader.onload = async (e) => {
      try {
        this.uploadStatus.innerText = '檔案讀取完成，正在驗證 JSON 語法格式...';
        const text = e.target.result;
        const geojsonData = JSON.parse(text);

        if (!geojsonData.type || (!geojsonData.features && geojsonData.type !== 'FeatureCollection')) {
          throw new Error('該檔案不是標準的 GeoJSON FeatureCollection 格式！');
        }

        const count = geojsonData.features ? geojsonData.features.length : 0;
        this.uploadStatus.innerText = `格式驗證正確 (共 ${count.toLocaleString()} 筆圖徵)，正在上傳至伺服器儲存並更新快取...`;

        const resp = await fetch('/api/admin/upload_layer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            county,
            layer_key,
            geojson: geojsonData
          })
        });

        const data = await resp.json();
        if (resp.ok && data.success) {
          this.uploadStatus.style.background = '#f0fdf4';
          this.uploadStatus.style.color = '#16a34a';
          this.uploadStatus.style.border = '1px solid #bbf7d0';
          this.uploadStatus.innerText = `🎉 上傳成功！已替換 ${data.message}。地圖正在自動重載圖資...`;

          // 重新整理圖層與狀態
          if (window.layerManager) {
            try {
              await window.layerManager.loadCountyLayers(county);
            } catch (err) {
              console.warn('地圖圖資重載通知:', err);
            }
          }
          this.fetchSystemStatus();
        } else {
          throw new Error(data.error || '伺服器上傳處理失敗');
        }
      } catch (err) {
        this.uploadStatus.style.background = '#fef2f2';
        this.uploadStatus.style.color = '#dc2626';
        this.uploadStatus.style.border = '1px solid #fecaca';
        this.uploadStatus.innerText = `❌ 錯誤: ${err.message}`;
      } finally {
        this.btnSubmitUpload.disabled = false;
        this.btnSubmitUpload.innerText = '🚀 確認上傳並更新圖資';
      }
    };

    reader.readAsText(file);
  }

  async reloadCache() {
    this.btnReloadCache.disabled = true;
    this.reloadStatus.innerText = '⏳ 重新預熱快取中...';
    try {
      const resp = await fetch('/api/admin/reload_cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ county: 'kaohsiung' })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        this.reloadStatus.innerText = '✓ 快取重載完成！';
        this.fetchSystemStatus();
      } else {
        this.reloadStatus.innerText = '❌ 重載失敗';
      }
    } catch (e) {
      this.reloadStatus.innerText = `連線失敗: ${e.message}`;
    } finally {
      this.btnReloadCache.disabled = false;
      setTimeout(() => { this.reloadStatus.innerText = ''; }, 3000);
    }
  }
}

// 暴露全域以利調用
window.AdminPanel = AdminPanel;
