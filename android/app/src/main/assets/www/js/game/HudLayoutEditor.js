/**
 * Vortex Arena - Mobile HUD Layout Editor
 * Provides drag-and-drop repositioning, scaling (60%-150%), opacity adjustment (20%-100%),
 * element visibility toggling, D-pad nudging, and persistent localStorage configuration.
 * Styled after tactical mobile shooters (COD Mobile HUD customizer).
 */

export class HudLayoutEditor {
  constructor(app) {
    this.app = app;
    this.isOpen = false;
    this.selectedElementId = 'touch-btn-fire';
    this.initialLayout = null;
    this.currentLayout = {};
    this.storageKey = 'vortex_custom_hud_layout';

    this.controllableIds = [
      'touch-btn-fire',
      'touch-btn-ads',
      'touch-btn-reload',
      'touch-btn-jump',
      'touch-btn-crouch',
      'touch-btn-swap',
      'joystick-base'
    ];

    this.friendlyNames = {
      'touch-btn-fire': 'FIRE BUTTON',
      'touch-btn-ads': 'ADS / SCOPE BUTTON',
      'touch-btn-reload': 'RELOAD BUTTON',
      'touch-btn-jump': 'JUMP BUTTON',
      'touch-btn-crouch': 'CROUCH / SLIDE BUTTON',
      'touch-btn-swap': 'SWAP WEAPON BUTTON',
      'joystick-base': 'MOVEMENT JOYSTICK'
    };

    this.activeDrag = null;
  }

  init() {
    this.loadAndApplySavedLayout();
    this.setupDragListeners();
  }

  loadAndApplySavedLayout() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data !== 'object' || data === null) return;
      this.currentLayout = data;
      this.applyLayoutToDOM(data);
    } catch (e) {
      console.warn('[HudEditor] Could not load saved layout:', e);
    }
  }

  applyLayoutToDOM(layout) {
    for (const [id, cfg] of Object.entries(layout)) {
      const el = document.getElementById(id);
      if (!el || !cfg) continue;

      if (cfg.scale !== undefined) {
        el.style.transform = `scale(${cfg.scale})`;
      }
      if (cfg.opacity !== undefined) {
        el.style.opacity = cfg.opacity;
      }
      if (cfg.hidden !== undefined) {
        el.style.display = cfg.hidden ? 'none' : '';
      }
      if (cfg.left !== undefined) {
        el.style.left = typeof cfg.left === 'number' ? `${cfg.left}px` : cfg.left;
        el.style.right = 'auto';
      } else if (cfg.right !== undefined) {
        el.style.right = typeof cfg.right === 'number' ? `${cfg.right}px` : cfg.right;
        el.style.left = 'auto';
      }
      if (cfg.top !== undefined) {
        el.style.top = typeof cfg.top === 'number' ? `${cfg.top}px` : cfg.top;
        el.style.bottom = 'auto';
      } else if (cfg.bottom !== undefined) {
        el.style.bottom = typeof cfg.bottom === 'number' ? `${cfg.bottom}px` : cfg.bottom;
        el.style.top = 'auto';
      }
    }
  }

  open() {
    this.isOpen = true;
    const modal = document.getElementById('modal-hud-editor');
    const controls = document.getElementById('mobile-controls');
    if (modal) modal.style.display = 'flex';
    if (controls) controls.style.display = 'block';

    document.body.classList.add('in-hud-editor');

    // Save initial state for cancelation
    this.initialLayout = JSON.parse(JSON.stringify(this.currentLayout));

    // Ensure all controllable elements have editing class
    this.controllableIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('hud-editable-item');
        if (el.style.display === 'none') {
          // Temporarily show with dimmed indicator during editing
          el.setAttribute('data-was-hidden', 'true');
          el.style.display = 'flex';
          el.style.filter = 'grayscale(1) opacity(0.4)';
        }
      }
    });

    this.selectElement(this.selectedElementId);
  }

  close() {
    this.isOpen = false;
    const modal = document.getElementById('modal-hud-editor');
    if (modal) modal.style.display = 'none';

    document.body.classList.remove('in-hud-editor');

    this.controllableIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('hud-editable-item', 'hud-editing-selected');
        el.style.filter = '';
        if (el.getAttribute('data-was-hidden') === 'true' && !this.currentLayout[id]?.hidden) {
          el.removeAttribute('data-was-hidden');
        } else if (this.currentLayout[id]?.hidden) {
          el.style.display = 'none';
        }
      }
    });

    // If on desktop and not in gameplay, hide mobile controls again
    if (window.app && window.app.currentScreen !== 'gameplay' && !document.documentElement.classList.contains('is-native-android')) {
      const controls = document.getElementById('mobile-controls');
      if (controls) controls.style.display = 'none';
    }
  }

  selectElement(id) {
    if (!this.controllableIds.includes(id)) return;
    this.selectedElementId = id;

    this.controllableIds.forEach(otherId => {
      const el = document.getElementById(otherId);
      if (el) el.classList.toggle('hud-editing-selected', otherId === id);
    });

    const target = document.getElementById(id);
    const titleEl = document.getElementById('hud-editor-item-name');
    const scaleSlider = document.getElementById('hud-editor-scale');
    const scaleVal = document.getElementById('hud-editor-scale-val');
    const opacitySlider = document.getElementById('hud-editor-opacity');
    const opacityVal = document.getElementById('hud-editor-opacity-val');
    const hideBox = document.getElementById('hud-editor-hide-btn');

    if (titleEl) titleEl.textContent = this.friendlyNames[id] || id.toUpperCase();

    const cfg = this.currentLayout[id] || {};
    const curScale = cfg.scale !== undefined ? Math.round(cfg.scale * 100) : 100;
    const curOpacity = cfg.opacity !== undefined ? Math.round(cfg.opacity * 100) : 100;
    const isHidden = Boolean(cfg.hidden);

    if (scaleSlider) scaleSlider.value = curScale;
    if (scaleVal) scaleVal.textContent = `${curScale}%`;
    if (opacitySlider) opacitySlider.value = curOpacity;
    if (opacityVal) opacityVal.textContent = `${curOpacity}%`;
    if (hideBox) hideBox.checked = isHidden;
  }

  onScaleChange(val) {
    const scale = parseInt(val, 10) / 100;
    const scaleVal = document.getElementById('hud-editor-scale-val');
    if (scaleVal) scaleVal.textContent = `${Math.round(scale * 100)}%`;

    if (!this.currentLayout[this.selectedElementId]) {
      this.currentLayout[this.selectedElementId] = {};
    }
    this.currentLayout[this.selectedElementId].scale = scale;

    const el = document.getElementById(this.selectedElementId);
    if (el) el.style.transform = `scale(${scale})`;
  }

  onOpacityChange(val) {
    const opacity = parseInt(val, 10) / 100;
    const opacityVal = document.getElementById('hud-editor-opacity-val');
    if (opacityVal) opacityVal.textContent = `${Math.round(opacity * 100)}%`;

    if (!this.currentLayout[this.selectedElementId]) {
      this.currentLayout[this.selectedElementId] = {};
    }
    this.currentLayout[this.selectedElementId].opacity = opacity;

    const el = document.getElementById(this.selectedElementId);
    if (el) el.style.opacity = opacity;
  }

  onHideToggle(checked) {
    if (!this.currentLayout[this.selectedElementId]) {
      this.currentLayout[this.selectedElementId] = {};
    }
    this.currentLayout[this.selectedElementId].hidden = checked;

    const el = document.getElementById(this.selectedElementId);
    if (el) {
      if (this.isOpen) {
        el.style.filter = checked ? 'grayscale(1) opacity(0.3)' : '';
      } else {
        el.style.display = checked ? 'none' : '';
      }
    }
  }

  nudge(dx, dy) {
    const el = document.getElementById(this.selectedElementId);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const newLeft = Math.max(10, Math.min(window.innerWidth - rect.width - 10, rect.left + dx));
    const newTop = Math.max(60, Math.min(window.innerHeight - rect.height - 10, rect.top + dy));

    if (!this.currentLayout[this.selectedElementId]) {
      this.currentLayout[this.selectedElementId] = {};
    }
    this.currentLayout[this.selectedElementId].left = Math.round(newLeft);
    this.currentLayout[this.selectedElementId].top = Math.round(newTop);
    delete this.currentLayout[this.selectedElementId].right;
    delete this.currentLayout[this.selectedElementId].bottom;

    el.style.left = `${Math.round(newLeft)}px`;
    el.style.top = `${Math.round(newTop)}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

  setupDragListeners() {
    const onPointerDown = (e) => {
      if (!this.isOpen) return;

      const target = e.target.closest('.hud-editable-item, .touch-action-btn, #joystick-base');
      if (!target || !this.controllableIds.includes(target.id)) return;

      e.preventDefault();
      e.stopPropagation();

      this.selectElement(target.id);

      const rect = target.getBoundingClientRect();
      this.activeDrag = {
        id: target.id,
        el: target,
        startX: e.clientX || (e.touches && e.touches[0].clientX) || 0,
        startY: e.clientY || (e.touches && e.touches[0].clientY) || 0,
        origLeft: rect.left,
        origTop: rect.top,
        width: rect.width,
        height: rect.height
      };
    };

    const onPointerMove = (e) => {
      if (!this.isOpen || !this.activeDrag) return;

      e.preventDefault();
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      const deltaX = clientX - this.activeDrag.startX;
      const deltaY = clientY - this.activeDrag.startY;

      const safeMinX = 8;
      const safeMaxX = window.innerWidth - this.activeDrag.width - 8;
      const safeMinTop = 64; // Keep below editor action bar
      const safeMaxTop = window.innerHeight - this.activeDrag.height - 8;

      const newLeft = Math.max(safeMinX, Math.min(safeMaxX, this.activeDrag.origLeft + deltaX));
      const newTop = Math.max(safeMinTop, Math.min(safeMaxTop, this.activeDrag.origTop + deltaY));

      const el = this.activeDrag.el;
      el.style.left = `${Math.round(newLeft)}px`;
      el.style.top = `${Math.round(newTop)}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';

      if (!this.currentLayout[this.activeDrag.id]) {
        this.currentLayout[this.activeDrag.id] = {};
      }
      this.currentLayout[this.activeDrag.id].left = Math.round(newLeft);
      this.currentLayout[this.activeDrag.id].top = Math.round(newTop);
      delete this.currentLayout[this.activeDrag.id].right;
      delete this.currentLayout[this.activeDrag.id].bottom;
    };

    const onPointerUp = () => {
      if (this.activeDrag) {
        this.activeDrag = null;
      }
    };

    window.addEventListener('mousedown', onPointerDown, { passive: false });
    window.addEventListener('mousemove', onPointerMove, { passive: false });
    window.addEventListener('mouseup', onPointerUp);

    window.addEventListener('touchstart', onPointerDown, { passive: false });
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
  }

  cancel() {
    this.currentLayout = this.initialLayout || {};
    // Clear inline transforms from elements
    this.controllableIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.left = '';
        el.style.top = '';
        el.style.right = '';
        el.style.bottom = '';
        el.style.transform = '';
        el.style.opacity = '';
        el.style.display = '';
      }
    });
    this.applyLayoutToDOM(this.currentLayout);
    this.close();
    if (this.app) this.app.showToast('HUD customization canceled');
  }

  reset() {
    localStorage.removeItem(this.storageKey);
    this.currentLayout = {};
    this.controllableIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.left = '';
        el.style.top = '';
        el.style.right = '';
        el.style.bottom = '';
        el.style.transform = '';
        el.style.opacity = '';
        el.style.display = '';
        el.style.filter = '';
      }
    });
    this.selectElement(this.selectedElementId);
    if (this.app) this.app.showToast('HUD layout reset to ergonomic default arc');
  }

  confirm() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.currentLayout));
      this.close();
      if (this.app) this.app.showToast('✅ Custom HUD layout saved successfully!');
    } catch (e) {
      console.warn('[HudEditor] Could not save layout:', e);
      this.close();
    }
  }
}
