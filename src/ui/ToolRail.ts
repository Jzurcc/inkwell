import { CanvasEngine } from '../canvas/CanvasEngine.ts';
import { ElementType, BrushType } from '../types.ts';

interface BrushOption {
  type: BrushType;
  label: string;
  shortcut: string;
  icon: string;
}

interface ShapeOption {
  type: ElementType;
  label: string;
  shortcut: string;
  icon: string;
}

export class ToolRail {
  private container: HTMLElement;
  private canvasEngine: CanvasEngine;

  // Active flyout state ('brush' | 'shape' | null)
  private openFlyout: 'brush' | 'shape' | null = null;
  // Remember last selected shape so clicking the primary shape tool retains it
  private lastSelectedShape: ElementType = 'rectangle';

  // Dwell hover timers (500ms)
  private brushHoverTimer: number | null = null;
  private brushLeaveTimer: number | null = null;
  private shapeHoverTimer: number | null = null;
  private shapeLeaveTimer: number | null = null;

  private brushOptions: BrushOption[] = [
    {
      type: 'pen',
      label: 'Pen',
      shortcut: 'B',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`
    },
    {
      type: 'marker',
      label: 'Marker',
      shortcut: '',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 2 8 8L10 22H2v-8L14 2z"/><path d="m10 6 8 8"/></svg>`
    },
    {
      type: 'neon',
      label: 'Neon',
      shortcut: '',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
    },
    {
      type: 'calligraphy',
      label: 'Calligraphy',
      shortcut: '',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 2-8.5 8.5L8 9.5 2 22l12.5-6-1-2.5L22 5z"/></svg>`
    },
    {
      type: 'spray',
      label: 'Spray',
      shortcut: '',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M8 4l2 3M16 4l-2 3"/><circle cx="12" cy="15" r="5"/><circle cx="10" cy="14" r="1" fill="currentColor"/><circle cx="14" cy="14" r="1" fill="currentColor"/></svg>`
    }
  ];

  private shapeOptions: ShapeOption[] = [
    {
      type: 'rectangle',
      label: 'Rectangle',
      shortcut: 'R',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="3"/></svg>`
    },
    {
      type: 'circle',
      label: 'Circle',
      shortcut: 'C',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>`
    },
    {
      type: 'triangle',
      label: 'Triangle',
      shortcut: 'G',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/></svg>`
    },
    {
      type: 'star',
      label: '5-Point Star',
      shortcut: 'K',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
    },
    {
      type: 'diamond',
      label: 'Decision Diamond',
      shortcut: 'D',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 12l10 10 10-10Z"/></svg>`
    },
    {
      type: 'line',
      label: 'Straight Line',
      shortcut: 'L',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="19" x2="19" y2="5"/></svg>`
    },
    {
      type: 'arrow',
      label: 'Arrow Line',
      shortcut: 'A',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`
    }
  ];

  constructor(container: HTMLElement, canvasEngine: CanvasEngine) {
    this.container = container;
    this.canvasEngine = canvasEngine;

    this.render();
    this.subscribe();
    this.setupGlobalClickOutside();
  }

  private subscribe(): void {
    this.canvasEngine.onToolChange((tool) => {
      // If current tool is a shape, update our lastSelectedShape
      if (this.shapeOptions.some((s) => s.type === tool)) {
        this.lastSelectedShape = tool as ElementType;
      }
      this.updateActiveStates();
    });

    this.canvasEngine.onEraserModeChange(() => {
      this.updateActiveStates();
    });

    this.canvasEngine.onStyleChange(() => {
      this.updateActiveStates();
    });
  }

  private isShapeToolActive(): boolean {
    return this.shapeOptions.some((s) => s.type === this.canvasEngine.activeTool);
  }

  private getActiveShapeOption(): ShapeOption {
    const found = this.shapeOptions.find((s) => s.type === this.canvasEngine.activeTool);
    if (found) return found;
    return this.shapeOptions.find((s) => s.type === this.lastSelectedShape) || this.shapeOptions[0];
  }

  private getActiveBrushOption(): BrushOption {
    const found = this.brushOptions.find((b) => b.type === this.canvasEngine.activeBrushType);
    return found || this.brushOptions[0];
  }

  public render(): void {
    const activeBrush = this.getActiveBrushOption();
    const activeShape = this.getActiveShapeOption();
    const isPen = this.canvasEngine.activeTool === 'pen';
    const isShape = this.isShapeToolActive();
    const isSelect = this.canvasEngine.activeTool === 'select';
    const isText = this.canvasEngine.activeTool === 'text';
    const isSticky = this.canvasEngine.activeTool === 'sticky_note';
    const isEraseMode = this.canvasEngine.isEraserMode;

    this.container.innerHTML = `
      <div class="studio-rail-inner" role="toolbar" aria-label="Creation Tools" aria-orientation="vertical">
        <div class="rail-tools-group">
          <!-- 1. Select & Move (V) -->
          <button 
            class="rail-tool-btn ${isSelect && !isEraseMode ? 'active' : ''}" 
            id="rail-btn-select"
            data-tool="select"
            title="Select & Move (V)"
            aria-label="Select & Move"
          >
            <div class="tool-icon-wrap">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 7 18 3-7 7-3L3 3z"/></svg>
            </div>
            <span class="rail-shortcut-hint">V</span>
          </button>

          <!-- 2. Creative Brushes with Flyout Sub-UI (B) -->
          <div class="rail-flyout-anchor" id="anchor-brush-flyout">
            <button 
              class="rail-tool-btn has-flyout ${isPen && !isEraseMode ? 'active' : ''}" 
              id="rail-btn-brush"
              title="${activeBrush.label} (B) — Click again or hover 0.5s to open brush menu"
              aria-label="${activeBrush.label}"
              aria-haspopup="true"
              aria-expanded="${this.openFlyout === 'brush'}"
            >
              <div class="tool-icon-wrap" id="rail-brush-icon-wrap">
                ${activeBrush.icon}
              </div>
              <span class="rail-shortcut-hint">B</span>
              <span class="rail-expand-arrow">›</span>
            </button>

            <!-- Brushes Semi-UI Flyout -->
            <div class="rail-flyout-menu ${this.openFlyout === 'brush' ? 'visible' : ''}" id="rail-brush-flyout">
              <div class="rail-flyout-header">
                <div class="rail-flyout-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
                  <span>Brushes</span>
                </div>
              </div>
              <div class="rail-flyout-list">
                ${this.brushOptions
                  .map(
                    (b) => `
                  <button 
                    class="flyout-brush-item ${this.canvasEngine.activeBrushType === b.type && isPen ? 'active' : ''}" 
                    data-brush-type="${b.type}"
                    title="${b.label}"
                  >
                    <div class="flyout-item-icon">${b.icon}</div>
                    <span class="flyout-item-title">${b.label}</span>
                    ${b.shortcut ? `<span class="flyout-item-key">${b.shortcut}</span>` : ''}
                  </button>
                `
                  )
                  .join('')}
              </div>
            </div>
          </div>

          <!-- 3. Shapes Subsection with Flyout Semi-UI -->
          <div class="rail-flyout-anchor" id="anchor-shape-flyout">
            <button 
              class="rail-tool-btn has-flyout ${isShape && !isEraseMode ? 'active' : ''}" 
              id="rail-btn-shape"
              title="${activeShape.label} (${activeShape.shortcut}) — Click again or hover 0.5s to open shape menu"
              aria-label="${activeShape.label}"
              aria-haspopup="true"
              aria-expanded="${this.openFlyout === 'shape'}"
            >
              <div class="tool-icon-wrap" id="rail-shape-icon-wrap">
                ${activeShape.icon}
              </div>
              <span class="rail-shortcut-hint">${activeShape.shortcut}</span>
              <span class="rail-expand-arrow">›</span>
            </button>

            <!-- Shapes Semi-UI Flyout -->
            <div class="rail-flyout-menu ${this.openFlyout === 'shape' ? 'visible' : ''}" id="rail-shape-flyout">
              <div class="rail-flyout-header">
                <div class="rail-flyout-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>
                  <span>Shapes Subsection</span>
                </div>
                <span class="flyout-tip">Click to draw</span>
              </div>
              <div class="rail-flyout-grid">
                ${this.shapeOptions
                  .map(
                    (s) => `
                  <button 
                    class="flyout-shape-item ${this.canvasEngine.activeTool === s.type ? 'active' : ''}" 
                    data-shape-type="${s.type}"
                    title="${s.label} (${s.shortcut})"
                  >
                    <div class="flyout-shape-icon">${s.icon}</div>
                    <span class="flyout-shape-name">${s.label}</span>
                    <span class="flyout-shape-key">${s.shortcut}</span>
                  </button>
                `
                  )
                  .join('')}
              </div>
            </div>
          </div>

          <!-- 4. Text Tool (T) -->
          <button 
            class="rail-tool-btn ${isText && !isEraseMode ? 'active' : ''}" 
            id="rail-btn-text"
            data-tool="text"
            title="Text Label (T)"
            aria-label="Text Label"
          >
            <div class="tool-icon-wrap">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
            </div>
            <span class="rail-shortcut-hint">T</span>
          </button>

          <!-- 5. Sticky Note (S) -->
          <button 
            class="rail-tool-btn ${isSticky && !isEraseMode ? 'active' : ''}" 
            id="rail-btn-sticky"
            data-tool="sticky_note"
            title="Sticky Note (S)"
            aria-label="Sticky Note"
          >
            <div class="tool-icon-wrap">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/></svg>
            </div>
            <span class="rail-shortcut-hint">S</span>
          </button>

          <div class="rail-divider"></div>

          <!-- 6. Erase Mode Toggle (E) — Universal toggle preserving current brush -->
          <button 
            class="rail-tool-btn rail-erase-toggle ${isEraseMode ? 'erase-toggle-active active' : ''}" 
            id="rail-btn-erase-toggle"
            title="Toggle Eraser Mode (E) — works over all brushes without resetting"
            aria-label="Toggle Eraser Mode"
          >
            <div class="tool-icon-wrap">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
            </div>
            <span class="rail-shortcut-hint">E</span>
            ${isEraseMode ? '<span class="erase-mode-pill">ON</span>' : ''}
          </button>
        </div>

        <div class="rail-divider"></div>

        <!-- Quick Sticky Note Color Presets -->
        <div class="rail-sticky-presets" title="Quick Sticky Note Presets">
          <span class="rail-section-label">Notes</span>
          <button class="sticky-preset-btn yellow" data-note-fill="#FEF08A" data-note-stroke="#EAB308" title="Yellow Note"></button>
          <button class="sticky-preset-btn green" data-note-fill="#BBF7D0" data-note-stroke="#16A34A" title="Mint Note"></button>
          <button class="sticky-preset-btn purple" data-note-fill="#E9D5FF" data-note-stroke="#9333EA" title="Lavender Note"></button>
          <button class="sticky-preset-btn blue" data-note-fill="#BAE6FD" data-note-stroke="#0284C7" title="Sky Note"></button>
        </div>

        <div class="rail-spacer"></div>

        <!-- Delete Selected Action (Clean Enlarged Button) -->
        <div class="rail-bottom-actions">
          <button class="rail-tool-btn delete-btn" id="rail-btn-delete" title="Delete Selected (Del)" aria-label="Delete Selected">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private setFlyout(flyout: 'brush' | 'shape' | null): void {
    this.openFlyout = flyout;
    const brushMenu = this.container.querySelector('#rail-brush-flyout');
    const shapeMenu = this.container.querySelector('#rail-shape-flyout');
    const brushBtn = this.container.querySelector('#rail-btn-brush');
    const shapeBtn = this.container.querySelector('#rail-btn-shape');

    brushMenu?.classList.toggle('visible', flyout === 'brush');
    brushBtn?.setAttribute('aria-expanded', String(flyout === 'brush'));

    shapeMenu?.classList.toggle('visible', flyout === 'shape');
    shapeBtn?.setAttribute('aria-expanded', String(flyout === 'shape'));
  }

  private closeFlyouts(): void {
    this.setFlyout(null);
  }

  private attachEvents(): void {
    // 1. Select tool
    this.container.querySelector('#rail-btn-select')?.addEventListener('click', () => {
      this.closeFlyouts();
      this.canvasEngine.setEraserMode(false);
      this.canvasEngine.setTool('select');
      this.updateActiveStates();
    });

    // 2. Brush button: click to activate, click again when already active to open dropdown, or hover 500ms
    const brushBtn = this.container.querySelector('#rail-btn-brush');
    const brushAnchor = this.container.querySelector('#anchor-brush-flyout');

    brushBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isAlreadyPen = this.canvasEngine.activeTool === 'pen' && !this.canvasEngine.isEraserMode;
      if (isAlreadyPen) {
        // Clicked again while already active -> toggle flyout!
        this.setFlyout(this.openFlyout === 'brush' ? null : 'brush');
      } else {
        // First click: activate pen tool cleanly
        this.canvasEngine.setEraserMode(false);
        this.canvasEngine.setTool('pen');
        this.closeFlyouts();
        this.updateActiveStates();
      }
    });

    // 500ms hover dwell on Brush tool
    brushAnchor?.addEventListener('mouseenter', () => {
      if (this.brushLeaveTimer) {
        clearTimeout(this.brushLeaveTimer);
        this.brushLeaveTimer = null;
      }
      this.brushHoverTimer = window.setTimeout(() => {
        this.setFlyout('brush');
      }, 500);
    });

    brushAnchor?.addEventListener('mouseleave', () => {
      if (this.brushHoverTimer) {
        clearTimeout(this.brushHoverTimer);
        this.brushHoverTimer = null;
      }
      this.brushLeaveTimer = window.setTimeout(() => {
        if (this.openFlyout === 'brush') {
          this.setFlyout(null);
        }
      }, 300);
    });

    // Brush flyout items selection
    this.container.querySelectorAll('.flyout-brush-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const brushType = (e.currentTarget as HTMLElement).dataset.brushType as BrushType;
        if (brushType) {
          this.canvasEngine.activeBrushType = brushType;
          this.canvasEngine.setEraserMode(false);
          this.canvasEngine.setTool('pen');
          this.closeFlyouts();
          this.updateActiveStates();
        }
      });
    });

    // 3. Shape button: click to activate, click again when already active to open dropdown, or hover 500ms
    const shapeBtn = this.container.querySelector('#rail-btn-shape');
    const shapeAnchor = this.container.querySelector('#anchor-shape-flyout');

    shapeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isAlreadyShape = this.isShapeToolActive() && !this.canvasEngine.isEraserMode;
      if (isAlreadyShape) {
        // Clicked again while already active -> toggle flyout!
        this.setFlyout(this.openFlyout === 'shape' ? null : 'shape');
      } else {
        // First click: activate last shape
        this.canvasEngine.setEraserMode(false);
        this.canvasEngine.setTool(this.lastSelectedShape);
        this.closeFlyouts();
        this.updateActiveStates();
      }
    });

    // 500ms hover dwell on Shape tool
    shapeAnchor?.addEventListener('mouseenter', () => {
      if (this.shapeLeaveTimer) {
        clearTimeout(this.shapeLeaveTimer);
        this.shapeLeaveTimer = null;
      }
      this.shapeHoverTimer = window.setTimeout(() => {
        this.setFlyout('shape');
      }, 500);
    });

    shapeAnchor?.addEventListener('mouseleave', () => {
      if (this.shapeHoverTimer) {
        clearTimeout(this.shapeHoverTimer);
        this.shapeHoverTimer = null;
      }
      this.shapeLeaveTimer = window.setTimeout(() => {
        if (this.openFlyout === 'shape') {
          this.setFlyout(null);
        }
      }, 300);
    });

    // Shape flyout grid item selection
    this.container.querySelectorAll('.flyout-shape-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const shapeType = (e.currentTarget as HTMLElement).dataset.shapeType as ElementType;
        if (shapeType) {
          this.lastSelectedShape = shapeType;
          this.canvasEngine.setEraserMode(false);
          this.canvasEngine.setTool(shapeType);
          this.closeFlyouts();
          this.updateActiveStates();
        }
      });
    });

    // 4. Text tool
    this.container.querySelector('#rail-btn-text')?.addEventListener('click', () => {
      this.closeFlyouts();
      this.canvasEngine.setEraserMode(false);
      this.canvasEngine.setTool('text');
      this.updateActiveStates();
    });

    // 5. Sticky note
    this.container.querySelector('#rail-btn-sticky')?.addEventListener('click', () => {
      this.closeFlyouts();
      this.canvasEngine.setEraserMode(false);
      this.canvasEngine.setTool('sticky_note');
      this.updateActiveStates();
    });

    // 6. Erase mode universal toggle
    this.container.querySelector('#rail-btn-erase-toggle')?.addEventListener('click', () => {
      this.closeFlyouts();
      this.canvasEngine.toggleEraserMode();
    });

    // Sticky presets
    this.container.querySelectorAll('.sticky-preset-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.closeFlyouts();
        const fill = (e.currentTarget as HTMLElement).dataset.noteFill;
        const stroke = (e.currentTarget as HTMLElement).dataset.noteStroke;
        this.canvasEngine.setEraserMode(false);
        this.canvasEngine.setTool('sticky_note');
        if (fill) this.canvasEngine.fillColor = fill;
        if (stroke) this.canvasEngine.setStrokeColor(stroke);
        this.updateActiveStates();
      });
    });

    // Delete selected button
    this.container.querySelector('#rail-btn-delete')?.addEventListener('click', () => {
      this.closeFlyouts();
      this.canvasEngine.deleteSelected();
    });
  }

  private setupGlobalClickOutside(): void {
    window.addEventListener('click', (e) => {
      if (this.openFlyout !== null) {
        const target = e.target as HTMLElement;
        if (!this.container.contains(target)) {
          this.closeFlyouts();
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.openFlyout !== null) {
        this.closeFlyouts();
      }
    });
  }

  public updateActiveStates(): void {
    const isPen = this.canvasEngine.activeTool === 'pen';
    const isShape = this.isShapeToolActive();
    const isSelect = this.canvasEngine.activeTool === 'select';
    const isText = this.canvasEngine.activeTool === 'text';
    const isSticky = this.canvasEngine.activeTool === 'sticky_note';
    const isEraseMode = this.canvasEngine.isEraserMode;

    const selectBtn = this.container.querySelector('#rail-btn-select');
    const brushBtn = this.container.querySelector('#rail-btn-brush');
    const shapeBtn = this.container.querySelector('#rail-btn-shape');
    const textBtn = this.container.querySelector('#rail-btn-text');
    const stickyBtn = this.container.querySelector('#rail-btn-sticky');
    const eraseBtn = this.container.querySelector('#rail-btn-erase-toggle');

    selectBtn?.classList.toggle('active', isSelect && !isEraseMode);
    brushBtn?.classList.toggle('active', isPen && !isEraseMode);
    shapeBtn?.classList.toggle('active', isShape && !isEraseMode);
    textBtn?.classList.toggle('active', isText && !isEraseMode);
    stickyBtn?.classList.toggle('active', isSticky && !isEraseMode);

    if (eraseBtn) {
      eraseBtn.classList.toggle('erase-toggle-active', isEraseMode);
      eraseBtn.classList.toggle('active', isEraseMode);
      let pill = eraseBtn.querySelector('.erase-mode-pill');
      if (isEraseMode && !pill) {
        eraseBtn.insertAdjacentHTML('beforeend', '<span class="erase-mode-pill">ON</span>');
      } else if (!isEraseMode && pill) {
        pill.remove();
      }
    }

    // Update active icons in case brush or shape changed
    const activeBrush = this.getActiveBrushOption();
    const brushWrap = this.container.querySelector('#rail-brush-icon-wrap');
    if (brushWrap) brushWrap.innerHTML = activeBrush.icon;

    const activeShape = this.getActiveShapeOption();
    const shapeWrap = this.container.querySelector('#rail-shape-icon-wrap');
    if (shapeWrap) shapeWrap.innerHTML = activeShape.icon;

    // Update active highlight on items in flyout
    this.container.querySelectorAll('.flyout-brush-item').forEach((item) => {
      const bType = (item as HTMLElement).dataset.brushType;
      item.classList.toggle('active', bType === this.canvasEngine.activeBrushType && isPen);
    });

    this.container.querySelectorAll('.flyout-shape-item').forEach((item) => {
      const sType = (item as HTMLElement).dataset.shapeType;
      item.classList.toggle('active', sType === this.canvasEngine.activeTool);
    });
  }
}
