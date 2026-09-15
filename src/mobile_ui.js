// ========================================================================
// 【行動端 UI 與手勢控制模組 (Mobile UI Manager)】
// 核心原則：「不影響圖面操作為最大原則」
// - 直式 (Portrait)：三段式底部抽屜 (Peek / Half / Full) + 觸控滑動手勢
// - 橫式 (Landscape)：緊湊側靠欄 (Side Dock)，保留 70%+ 水平地圖視野
// - 點擊 Feature：取消地圖氣泡，統一由底部檢視卡顯示，並自動微調視角
// ========================================================================

class MobileUIManager {
  constructor() {
    this.leftPanel = document.getElementById('left-panel');
    this.rightDrawer = document.getElementById('right-drawer');
    this.btnExpand = document.getElementById('btn-expand-panel');
    this.navbar = document.querySelector('.navbar');
    
    // 狀態變數：'peek', 'half', 'full'
    this.currentSheetState = 'peek';
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    // 手勢追蹤變數
    this.touchStartY = 0;
    this.touchCurrentY = 0;
    this.isDragging = false;
    this.startSheetHeight = 0;

    this.init();
  }

  init() {
    this.setupDragHandle();
    this.setupGestureListeners();
    this.setupResponsiveMode();
    this.setupFeatureSelectionListener();
    this.setupToolStateListener();

    window.addEventListener('resize', () => {
      this.setupResponsiveMode();
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.setupResponsiveMode(), 200);
    });

    console.log('[MobileUI] 行動端 UI 模組初始化完成！(支援直式 Bottom Sheet 與橫式 Side Dock)');
  }

  // 判斷當前是否處於行動端/觸控螢幕尺寸 (涵蓋手機與平板直橫向)
  isMobile() {
    const isTouch = ('ontouchstart' in window) || 
                    (navigator.maxTouchPoints > 0) || 
                    (navigator.msMaxTouchPoints > 0) ||
                    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
                    (window.matchMedia && window.matchMedia('(any-pointer: coarse)').matches) ||
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
                    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return Boolean(
      window.innerWidth <= 820 || 
      (window.innerHeight <= 600 && window.innerWidth <= 1024) ||
      (isTouch && window.innerWidth <= 1366)
    );
  }

  // 判斷是否為直式模式
  isPortrait() {
    return window.innerHeight >= window.innerWidth;
  }

  // 設定拖移條元素 (Drag Handle)
  setupDragHandle() {
    if (this.leftPanel && !this.leftPanel.querySelector('.sheet-drag-handle')) {
      const handle = document.createElement('div');
      handle.className = 'sheet-drag-handle';
      handle.innerHTML = '<span class="drag-pill"></span>';
      this.leftPanel.insertBefore(handle, this.leftPanel.firstChild);

      // 點擊拖移條可在 peek 與 half 之間快速切換
      handle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.isMobile() && this.isPortrait()) {
          if (this.currentSheetState === 'peek') {
            this.setSheetState('half');
          } else {
            this.setSheetState('peek');
          }
        }
      });
    }

    // 右側抽屜在手機直式也提供拖移條
    if (this.rightDrawer && !this.rightDrawer.querySelector('.sheet-drag-handle')) {
      const handle = document.createElement('div');
      handle.className = 'sheet-drag-handle right-drawer-handle';
      handle.innerHTML = '<span class="drag-pill"></span>';
      this.rightDrawer.insertBefore(handle, this.rightDrawer.firstChild);

      handle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.isMobile() && this.isPortrait()) {
          this.closeRightDrawerMobile();
        }
      });
    }
  }

  // 設定觸控手勢滑動監聽 (Swipe Up / Swipe Down)
  setupGestureListeners() {
    const handle = this.leftPanel ? this.leftPanel.querySelector('.sheet-drag-handle') : null;
    const targetElement = handle || (this.leftPanel ? this.leftPanel.querySelector('.panel-header') : null);

    if (!targetElement) return;

    targetElement.addEventListener('touchstart', (e) => {
      if (!this.isMobile() || !this.isPortrait()) return;
      this.touchStartY = e.touches[0].clientY;
      this.touchCurrentY = this.touchStartY;
      this.isDragging = true;
      this.startSheetHeight = this.leftPanel.getBoundingClientRect().height;
      this.leftPanel.style.transition = 'none'; // 拖動時關閉動畫，跟隨手指
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!this.isDragging || !this.isMobile() || !this.isPortrait()) return;
      this.touchCurrentY = e.touches[0].clientY;
      const deltaY = this.touchStartY - this.touchCurrentY; // 往上滑為正，往下滑為負
      const newHeight = Math.max(54, Math.min(window.innerHeight * 0.88, this.startSheetHeight + deltaY));
      this.leftPanel.style.height = `${newHeight}px`;
    }, { passive: true });

    window.addEventListener('touchend', () => {
      if (!this.isDragging || !this.isMobile() || !this.isPortrait()) return;
      this.isDragging = false;
      this.leftPanel.style.transition = ''; // 恢復 CSS smooth transition

      const deltaY = this.touchStartY - this.touchCurrentY;
      const threshold = 40; // 滑動靈敏度門檻

      if (deltaY > threshold) {
        // 向上推
        if (this.currentSheetState === 'peek') {
          this.setSheetState('half');
        } else if (this.currentSheetState === 'half') {
          this.setSheetState('full');
        } else {
          this.setSheetState('full');
        }
      } else if (deltaY < -threshold) {
        // 向下拉
        if (this.currentSheetState === 'full') {
          this.setSheetState('half');
        } else if (this.currentSheetState === 'half') {
          this.setSheetState('peek');
        } else {
          this.setSheetState('peek');
        }
      } else {
        // 回彈至最近的狀態
        this.snapToClosestState();
      }
    });

    // 點擊分頁標籤按鈕時，若處於 peek 狀態則自動升起至 half 方便使用者操作
    if (this.leftPanel) {
      this.leftPanel.querySelectorAll('.panel-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (this.isMobile() && this.isPortrait()) {
            if (this.currentSheetState === 'peek') {
              this.setSheetState('half');
            }
          }
        });
      });
    }
  }

  // 設置吸附狀態 ('peek' | 'half' | 'full')
  setSheetState(state) {
    this.currentSheetState = state;
    if (!this.leftPanel) return;

    this.leftPanel.classList.remove('sheet-peek', 'sheet-half', 'sheet-full');
    this.leftPanel.style.height = ''; // 清除 inline height，由 class 接管

    if (state === 'peek') {
      this.leftPanel.classList.add('sheet-peek');
    } else if (state === 'half') {
      this.leftPanel.classList.add('sheet-half');
    } else if (state === 'full') {
      this.leftPanel.classList.add('sheet-full');
    }

    // 觸發地圖與圖表尺寸更新
    setTimeout(() => {
      if (window.webgisMap && window.webgisMap.map) {
        window.webgisMap.map.resize();
      }
    }, 320);
  }

  // 依據目前高度自動吸附至最靠近的狀態
  snapToClosestState() {
    const currentH = this.leftPanel.getBoundingClientRect().height;
    const windowH = window.innerHeight;

    const peekH = 54;
    const halfH = windowH * 0.45;
    const fullH = windowH * 0.85;

    const distPeek = Math.abs(currentH - peekH);
    const distHalf = Math.abs(currentH - halfH);
    const distFull = Math.abs(currentH - fullH);

    const min = Math.min(distPeek, distHalf, distFull);
    if (min === distPeek) {
      this.setSheetState('peek');
    } else if (min === distHalf) {
      this.setSheetState('half');
    } else {
      this.setSheetState('full');
    }
  }

  // 響應式佈局適應
  setupResponsiveMode() {
    const isMob = this.isMobile();
    const isPort = this.isPortrait();

    document.body.classList.toggle('is-mobile', isMob);
    document.body.classList.toggle('is-portrait', isPort);
    document.body.classList.toggle('is-landscape', !isPort);

    if (isMob) {
      if (isPort) {
        // 直式：啟用底部抽屜，預設 Peek 狀態以釋放 90%+ 地圖畫布
        this.leftPanel.classList.remove('collapsed');
        if (!this.leftPanel.classList.contains('sheet-peek') &&
            !this.leftPanel.classList.contains('sheet-half') &&
            !this.leftPanel.classList.contains('sheet-full')) {
          this.setSheetState('peek');
        }
        if (this.btnExpand) this.btnExpand.style.display = 'none';
      } else {
        // 橫式：移除底部抽屜樣式，轉為緊湊側邊欄
        this.leftPanel.classList.remove('sheet-peek', 'sheet-half', 'sheet-full');
        this.leftPanel.style.height = '';
      }
    } else {
      // 電腦版：重設所有行動端 class
      this.leftPanel.classList.remove('sheet-peek', 'sheet-half', 'sheet-full');
      this.leftPanel.style.height = '';
    }

    if (window.webgisMap && window.webgisMap.map) {
      window.webgisMap.map.resize();
    }
  }

  // 當 Feature 物件被選取時的連動
  setupFeatureSelectionListener() {
    window.addEventListener('object-selected', (e) => {
      if (!this.isMobile()) return;

      const { lngLat } = e.detail || {};

      // 1. 直式手機模式下，自動平移地圖視角，避開下方抽屜
      if (lngLat && window.webgisMap && window.webgisMap.map) {
        const offsetPx = this.isPortrait() ? -window.innerHeight * 0.22 : 0;
        window.webgisMap.map.easeTo({
          center: [lngLat.lng, lngLat.lat],
          offset: [0, offsetPx],
          duration: 350
        });
      }

      // 2. 在直式模式下，如果選中了物件，收合左側工具底板至 peek，展開右側詳情抽屜至 half
      if (this.isPortrait()) {
        this.setSheetState('peek');
        if (this.rightDrawer) {
          this.rightDrawer.classList.add('mobile-sheet-show');
        }
      }
    });

    // 關閉右側抽屜按鈕
    const rightCloseBtn = document.getElementById('drawer-close-btn');
    if (rightCloseBtn) {
      const handleClose = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeRightDrawerMobile();
      };
      rightCloseBtn.addEventListener('click', handleClose);
      rightCloseBtn.addEventListener('touchend', handleClose);
    }
  }

  closeRightDrawerMobile() {
    if (this.rightDrawer) {
      this.rightDrawer.classList.remove('mobile-sheet-show');
      this.rightDrawer.classList.remove('open');
      if (this.isPortrait()) {
        this.rightDrawer.style.transform = 'translateY(115%)';
      } else {
        this.rightDrawer.style.transform = 'translateX(115%)';
      }
    }
    if (window.webgisDashboard) {
      window.webgisDashboard.closeDrawer();
    }
  }

  // 繪圖、測量與等時圈分析啟動時的互動優化
  setupToolStateListener() {
    const drawingTools = [
      'btn-draw-polygon', 'btn-draw-rect', 'btn-draw-circle',
      'btn-walk-start', 'btn-measure-dist', 'btn-measure-area', 'btn-pick-coord'
    ];

    drawingTools.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          if (this.isMobile() && this.isPortrait()) {
            // 啟動繪圖/量測時，底板自動最小化為 Peek 狀態，提供 100% 無阻礙畫布供手指點擊！
            this.setSheetState('peek');
            this.showFloatingActionHint("地圖標定中：請於畫面上點擊，雙擊結束");
          }
        });
      }
    });

    // 停止與清除按鈕點擊時，關閉操作提示膠囊
    const stopClearTools = [
      'btn-draw-stop', 'btn-draw-clear', 'btn-walk-stop', 'btn-walk-clear',
      'btn-measure-stop', 'btn-clear-tools'
    ];
    stopClearTools.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          this.hideFloatingActionHint();
        });
      }
    });

    // 分析完成事件
    window.addEventListener('analysis-complete', () => {
      if (this.isMobile() && this.isPortrait()) {
        this.hideFloatingActionHint();
        // 分析完成後，展開結果抽屜
        if (this.rightDrawer) {
          this.rightDrawer.classList.add('mobile-sheet-show');
        }
      }
    });

    // 分析中止/錯誤事件：關閉浮動提示膠囊
    window.addEventListener('analysis-error', () => {
      this.hideFloatingActionHint();
    });
  }

  // 顯示頂部輕量化操作提示膠囊 (不遮擋畫布)
  showFloatingActionHint(msg) {
    let hint = document.getElementById('mobile-action-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'mobile-action-hint';
      hint.className = 'mobile-action-hint';
      document.querySelector('.main-container')?.appendChild(hint);
    }
    hint.innerHTML = `<span>📍 ${msg}</span><button id="btn-close-action-hint" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer;padding:0 4px;">✕</button>`;
    hint.style.display = 'flex';

    document.getElementById('btn-close-action-hint')?.addEventListener('click', () => {
      this.hideFloatingActionHint();
    });
  }

  hideFloatingActionHint() {
    const hint = document.getElementById('mobile-action-hint');
    if (hint) hint.style.display = 'none';
  }
}

window.MobileUIManager = MobileUIManager;
