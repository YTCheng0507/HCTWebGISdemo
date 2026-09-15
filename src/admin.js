// ========================================================================
// 【系統管理員登入、多帳號管理、操作稽核與線上圖資維護控制台模組】
// 提供多帳號身分驗證、PBKDF2 密碼雜湊、RBAC 權限分級、操作紀錄與圖資線上維護
// ========================================================================

class AdminPanel {
  constructor() {
    this.token = sessionStorage.getItem('admin_token') || null;
    this.currentUser = null;
    const cachedUser = sessionStorage.getItem('admin_user');
    if (cachedUser) {
      try { this.currentUser = JSON.parse(cachedUser); } catch (e) {}
    }

    this.initElements();
    this.bindEvents();
    this.updateAuthState();
  }

  initElements() {
    // 導覽列身分按鈕
    this.btnOpenLogin = document.getElementById('btn-open-login');
    this.adminUserControls = document.getElementById('admin-user-controls');
    this.adminUserName = document.getElementById('admin-user-name');
    this.adminRoleBadge = document.getElementById('admin-role-badge');
    this.btnOpenPanel = document.getElementById('btn-open-panel');
    this.btnLogout = document.getElementById('btn-admin-logout');

    // 登入彈窗
    this.modalLogin = document.getElementById('modal-admin-login');
    this.btnCloseLogin = document.getElementById('btn-close-login');
    this.btnCancelLogin = document.getElementById('btn-cancel-login');
    this.btnSubmitLogin = document.getElementById('btn-submit-login');
    this.inputUsername = document.getElementById('admin-username-input');
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

    // 分頁 4: 帳號權限管理
    this.tabBtnUsers = document.getElementById('admin-tab-btn-users');
    this.userListTbody = document.getElementById('user-list-tbody');
    this.btnToggleAddUser = document.getElementById('btn-toggle-add-user');
    this.formAddUser = document.getElementById('form-add-user');
    this.newUsername = document.getElementById('new-user-username');
    this.newName = document.getElementById('new-user-name');
    this.newPassword = document.getElementById('new-user-password');
    this.newRole = document.getElementById('new-user-role');
    this.addUserStatus = document.getElementById('add-user-status');
    this.btnCancelAddUser = document.getElementById('btn-cancel-add-user');
    this.btnSubmitAddUser = document.getElementById('btn-submit-add-user');
    this.inputChangePassword = document.getElementById('input-change-password');
    this.btnSubmitChangePassword = document.getElementById('btn-submit-change-password');
    this.changePwdStatus = document.getElementById('change-pwd-status');

    // 分頁 5: 稽核日誌
    this.tabBtnLogs = document.getElementById('admin-tab-btn-logs');
    this.auditLogTbody = document.getElementById('audit-log-tbody');
    this.btnRefreshLogs = document.getElementById('btn-refresh-logs');
  }

  bindEvents() {
    // 登入彈窗按鈕
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
    const handleEnterKey = (e) => {
      if (e.key === 'Enter') this.submitLogin();
    };
    if (this.inputUsername) this.inputUsername.addEventListener('keydown', handleEnterKey);
    if (this.inputPassword) this.inputPassword.addEventListener('keydown', handleEnterKey);

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

    // 後台分頁切換
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
        } else if (targetTab === 'admin-tab-users') {
          this.fetchUsers();
        } else if (targetTab === 'admin-tab-logs') {
          this.fetchAuditLogs();
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

    // 評鑑權重滑桿聯動
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

    // 儲存與重設權重
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

    // 帳號管理事件
    if (this.btnToggleAddUser) {
      this.btnToggleAddUser.addEventListener('click', () => {
        const isHidden = this.formAddUser.style.display === 'none';
        this.formAddUser.style.display = isHidden ? 'flex' : 'none';
      });
    }
    if (this.btnCancelAddUser) {
      this.btnCancelAddUser.addEventListener('click', () => {
        this.formAddUser.style.display = 'none';
      });
    }
    if (this.btnSubmitAddUser) {
      this.btnSubmitAddUser.addEventListener('click', () => this.submitAddUser());
    }
    if (this.btnSubmitChangePassword) {
      this.btnSubmitChangePassword.addEventListener('click', () => this.submitChangePassword());
    }

    // 稽核日誌重整
    if (this.btnRefreshLogs) {
      this.btnRefreshLogs.addEventListener('click', () => this.fetchAuditLogs());
    }
  }

  // 統一封裝帶 Bearer Token 的 Fetch 請求
  async authFetch(url, options = {}) {
    const headers = options.headers || {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    options.headers = headers;
    const resp = await fetch(url, options);
    if (resp.status === 401) {
      this.token = null;
      this.currentUser = null;
      sessionStorage.removeItem('admin_token');
      sessionStorage.removeItem('admin_user');
      this.updateAuthState();
      this.closePanelModal();
      alert('您的登入時效已過期，請重新登入！');
    }
    return resp;
  }

  updateAuthState() {
    if (this.token && this.currentUser) {
      if (this.btnOpenLogin) this.btnOpenLogin.style.display = 'none';
      if (this.adminUserControls) this.adminUserControls.style.display = 'flex';
      if (this.adminUserName) {
        this.adminUserName.innerText = `👤 ${this.currentUser.name || this.currentUser.username}`;
      }
      if (this.adminRoleBadge) {
        if (this.currentUser.role === 'superadmin') {
          this.adminRoleBadge.innerText = '超級管理員';
          this.adminRoleBadge.style.background = '#16a34a';
        } else {
          this.adminRoleBadge.innerText = '維護人員';
          this.adminRoleBadge.style.background = '#0284c7';
        }
      }
      // 帳號管理分頁僅超級管理員可見
      if (this.tabBtnUsers) {
        this.tabBtnUsers.style.display = this.currentUser.role === 'superadmin' ? 'block' : 'none';
      }
    } else {
      if (this.btnOpenLogin) this.btnOpenLogin.style.display = 'flex';
      if (this.adminUserControls) this.adminUserControls.style.display = 'none';
    }
  }

  openLoginModal() {
    if (this.modalLogin) {
      this.modalLogin.classList.add('show');
      if (this.loginError) this.loginError.style.display = 'none';
      if (this.inputUsername) {
        this.inputUsername.value = '';
        setTimeout(() => this.inputUsername.focus(), 100);
      }
      if (this.inputPassword) this.inputPassword.value = '';
    }
  }

  closeLoginModal() {
    if (this.modalLogin) {
      this.modalLogin.classList.remove('show');
    }
  }

  async submitLogin() {
    const username = this.inputUsername ? this.inputUsername.value.trim() : '';
    const password = this.inputPassword ? this.inputPassword.value.trim() : '';
    if (!username || !password) {
      this.showLoginError('請輸入管理者帳號與密碼');
      return;
    }

    this.btnSubmitLogin.disabled = true;
    this.btnSubmitLogin.innerText = '驗證中...';

    try {
      const resp = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await resp.json();

      if (resp.ok && data.success) {
        this.token = data.token;
        this.currentUser = data.user;
        sessionStorage.setItem('admin_token', this.token);
        sessionStorage.setItem('admin_user', JSON.stringify(this.currentUser));
        this.updateAuthState();
        this.closeLoginModal();
        this.openPanelModal();
      } else {
        this.showLoginError(data.error || '帳號或密碼錯誤，請重新確認！');
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

  async logout() {
    try {
      await this.authFetch('/api/admin/logout', { method: 'POST' });
    } catch (e) {}

    this.token = null;
    this.currentUser = null;
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_user');
    this.updateAuthState();
    this.closePanelModal();
    alert('已成功安全登出管理者帳號。');
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

  // --- 分頁 1: 圖資上傳 ---
  async uploadLayerFile() {
    const file = this.uploadFileInput.files[0];
    if (!file) {
      alert('請先點擊按鈕選擇要上傳的 GeoJSON 檔案！');
      return;
    }

    const county = this.uploadCountySelect.value;
    const layer_key = this.uploadTypeSelect.value;

    if (!confirm(`確定要將本機檔案「${file.name}」上傳並覆蓋 ${county} 的「${layer_key}」圖資嗎？\n\n上傳完成後，後台將自動更新記憶體快取、寫入稽核紀錄並同步刷新地圖顯示。`)) {
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
        this.uploadStatus.innerText = `格式驗證正確 (共 ${count.toLocaleString()} 筆圖徵)，正在上傳伺服器並重置快取...`;

        const resp = await this.authFetch('/api/admin/upload_layer', {
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

  // --- 分頁 2: 評鑑權重微調 ---
  async fetchWeights() {
    try {
      const resp = await this.authFetch('/api/admin/status');
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
      console.warn('無法獲取權重設定:', e);
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
      const resp = await this.authFetch('/api/admin/update_weights', {
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

  // --- 分頁 3: 系統快取與狀態 ---
  async fetchSystemStatus() {
    if (!this.statusDetails) return;
    this.statusDetails.innerHTML = '<div style="color: #64748b;">🔄 正在讀取伺服器狀態與圖資快取...</div>';

    try {
      const resp = await this.authFetch('/api/admin/status');
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

  async reloadCache() {
    this.btnReloadCache.disabled = true;
    this.reloadStatus.innerText = '⏳ 重新預熱快取中...';
    try {
      const resp = await this.authFetch('/api/admin/reload_cache', {
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

  // --- 分頁 4: 帳號權限管理 ---
  async fetchUsers() {
    if (!this.userListTbody) return;
    this.userListTbody.innerHTML = `<tr><td colspan="5" style="padding: 12px; text-align: center; color: #94a3b8;">讀取帳號名冊中...</td></tr>`;

    try {
      const resp = await this.authFetch('/api/admin/users');
      const data = await resp.json();
      if (resp.ok && data.users) {
        if (data.users.length === 0) {
          this.userListTbody.innerHTML = `<tr><td colspan="5" style="padding: 12px; text-align: center; color: #94a3b8;">目前尚無使用者</td></tr>`;
          return;
        }

        let html = '';
        data.users.forEach(u => {
          const roleLabel = u.role === 'superadmin' ? '<span style="color:#16a34a; font-weight:600;">超級管理員</span>' : '<span style="color:#0284c7;">維護人員</span>';
          const isSelf = this.currentUser && this.currentUser.username === u.username;
          const deleteBtn = isSelf 
            ? '<span style="color: #94a3b8; font-size: 11px;">(目前登入)</span>'
            : `<button class="btn btn-del-user" data-uid="${u.id}" data-name="${u.username}" style="padding: 2px 6px; font-size: 11px; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 4px; cursor: pointer;">刪除</button>`;

          html += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 6px 8px; font-weight: 600; color: #0f172a;">${u.username}</td>
              <td style="padding: 6px 8px;">${u.name}</td>
              <td style="padding: 6px 8px;">${roleLabel}</td>
              <td style="padding: 6px 8px; color: #64748b; font-size: 11.5px;">${u.last_login || '未曾登入'}</td>
              <td style="padding: 6px 8px; text-align: center;">${deleteBtn}</td>
            </tr>
          `;
        });
        this.userListTbody.innerHTML = html;

        // 綁定刪除按鈕
        document.querySelectorAll('.btn-del-user').forEach(btn => {
          btn.addEventListener('click', () => {
            const uid = btn.getAttribute('data-uid');
            const uname = btn.getAttribute('data-name');
            this.deleteUser(uid, uname);
          });
        });
      } else {
        this.userListTbody.innerHTML = `<tr><td colspan="5" style="padding: 12px; text-align: center; color: #dc2626;">無法載入帳號清單 (${data.error || '未授權'})</td></tr>`;
      }
    } catch (e) {
      this.userListTbody.innerHTML = `<tr><td colspan="5" style="padding: 12px; text-align: center; color: #dc2626;">載入失敗: ${e.message}</td></tr>`;
    }
  }

  async submitAddUser() {
    const u = this.newUsername.value.trim();
    const n = this.newName.value.trim();
    const p = this.newPassword.value.trim();
    const r = this.newRole.value;

    if (!u || !n || !p) {
      alert('所有新增欄位 (帳號、姓名、密碼) 皆為必填！');
      return;
    }

    this.btnSubmitAddUser.disabled = true;
    this.btnSubmitAddUser.innerText = '建立中...';
    this.addUserStatus.style.display = 'none';

    try {
      const resp = await this.authFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, name: n, password: p, role: r })
      });
      const data = await resp.json();

      if (resp.ok && data.success) {
        alert(`🎉 帳號「${u}」(${n}) 已建立成功！`);
        this.newUsername.value = '';
        this.newName.value = '';
        this.newPassword.value = '';
        this.formAddUser.style.display = 'none';
        this.fetchUsers();
      } else {
        alert(`❌ 建立失敗: ${data.error || '不明錯誤'}`);
      }
    } catch (e) {
      alert(`連線錯誤: ${e.message}`);
    } finally {
      this.btnSubmitAddUser.disabled = false;
      this.btnSubmitAddUser.innerText = '儲存建立';
    }
  }

  async deleteUser(userId, username) {
    if (!confirm(`確定要刪除管理者「${username}」嗎？刪除後此帳號將無法登入系統。`)) {
      return;
    }

    try {
      const resp = await this.authFetch('/api/admin/delete_user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: parseInt(userId, 10) })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        alert('已成功刪除該使用者！');
        this.fetchUsers();
      } else {
        alert(`❌ 刪除失敗: ${data.error || '不明錯誤'}`);
      }
    } catch (e) {
      alert(`連線錯誤: ${e.message}`);
    }
  }

  async submitChangePassword() {
    const newPwd = this.inputChangePassword.value.trim();
    if (!newPwd || newPwd.length < 4) {
      alert('請輸入新密碼，長度至少需 4 個字元！');
      return;
    }

    this.btnSubmitChangePassword.disabled = true;
    this.btnSubmitChangePassword.innerText = '更新中...';
    this.changePwdStatus.innerText = '';

    try {
      const resp = await this.authFetch('/api/admin/change_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPwd })
      });
      const data = await resp.json();

      if (resp.ok && data.success) {
        this.changePwdStatus.style.color = '#16a34a';
        this.changePwdStatus.innerText = '✓ 您的密碼已成功更新！下次登入請使用新密碼。';
        this.inputChangePassword.value = '';
      } else {
        this.changePwdStatus.style.color = '#dc2626';
        this.changePwdStatus.innerText = `❌ 修改失敗: ${data.error || '不明錯誤'}`;
      }
    } catch (e) {
      this.changePwdStatus.style.color = '#dc2626';
      this.changePwdStatus.innerText = `連線錯誤: ${e.message}`;
    } finally {
      this.btnSubmitChangePassword.disabled = false;
      this.btnSubmitChangePassword.innerText = '確認修改密碼';
    }
  }

  // --- 分頁 5: 操作稽核日誌 ---
  async fetchAuditLogs() {
    if (!this.auditLogTbody) return;
    this.auditLogTbody.innerHTML = `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #94a3b8;">讀取稽核紀錄中...</td></tr>`;

    try {
      const resp = await this.authFetch('/api/admin/audit_logs');
      const data = await resp.json();

      if (resp.ok && data.logs) {
        if (data.logs.length === 0) {
          this.auditLogTbody.innerHTML = `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #94a3b8;">目前尚無操作日誌</td></tr>`;
          return;
        }

        const actionBadges = {
          'login': '<span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-weight:600;">登入成功</span>',
          'login_fail': '<span style="background:#fee2e2; color:#dc2626; padding:2px 6px; border-radius:4px; font-weight:600;">登入失敗</span>',
          'logout': '<span style="background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px;">登出</span>',
          'upload_layer': '<span style="background:#dcfce7; color:#15803d; padding:2px 6px; border-radius:4px; font-weight:600;">圖資置換</span>',
          'update_weights': '<span style="background:#fef3c7; color:#b45309; padding:2px 6px; border-radius:4px; font-weight:600;">權重調整</span>',
          'reload_cache': '<span style="background:#e0e7ff; color:#4338ca; padding:2px 6px; border-radius:4px;">快取重載</span>',
          'create_user': '<span style="background:#ede9fe; color:#6d28d9; padding:2px 6px; border-radius:4px; font-weight:600;">新增帳號</span>',
          'delete_user': '<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:600;">刪除帳號</span>',
          'change_password': '<span style="background:#fef9c3; color:#854d0e; padding:2px 6px; border-radius:4px;">變更密碼</span>'
        };

        let html = '';
        data.logs.forEach(log => {
          const badge = actionBadges[log.action] || `<span style="background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px;">${log.action}</span>`;
          html += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 6px 8px; color: #64748b; font-family: monospace;">${log.timestamp}</td>
              <td style="padding: 6px 8px; font-weight: 600; color: #0f172a;">${log.username}</td>
              <td style="padding: 6px 8px;">${badge}</td>
              <td style="padding: 6px 8px; color: #334155;">${log.detail}</td>
            </tr>
          `;
        });
        this.auditLogTbody.innerHTML = html;
      } else {
        this.auditLogTbody.innerHTML = `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #dc2626;">無法載入日誌 (${data.error || '未授權'})</td></tr>`;
      }
    } catch (e) {
      this.auditLogTbody.innerHTML = `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #dc2626;">載入失敗: ${e.message}</td></tr>`;
    }
  }
}

// 暴露全域以利調用
window.AdminPanel = AdminPanel;
