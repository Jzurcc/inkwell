import { CanvasEngine } from '../canvas/CanvasEngine.ts';
import { DashStyle } from '../types.ts';
import { TextEditModal } from './TextEditModal.ts';

export class PropertyBar {
  private container: HTMLElement;
  private canvasEngine: CanvasEngine;
  private colorTarget: 'stroke' | 'fill' = 'stroke';

  // Active popover state: 'color' | 'stroke' | null
  private openPopover: 'color' | 'stroke' | null = null;

  // Hover dwell timers (500ms dwell)
  private colorHoverTimer: number | null = null;
  private colorLeaveTimer: number | null = null;
  private strokeHoverTimer: number | null = null;
  private strokeLeaveTimer: number | null = null;

  private designerColors = [
    { value: '#0F172A', label: 'Ink Slate' },
    { value: '#FFFFFF', label: 'Pure White' },
    { value: '#4F46E5', label: 'Royal Indigo' },
    { value: '#38BDF8', label: 'Cyan Glow' },
    { value: '#10B981', label: 'Emerald Mint' },
    { value: '#F43F5E', label: 'Vibrant Rose' },
    { value: '#F59E0B', label: 'Warm Amber' },
    { value: '#A855F7', label: 'Electric Purple' },
    { value: '#EC4899', label: 'Hot Pink' },
    { value: '#64748B', label: 'Cool Grey' },
    { value: '#FEF08A', label: 'Pastel Yellow' },
    { value: 'transparent', label: 'Transparent / None' }
  ];

  constructor(container: HTMLElement, canvasEngine: CanvasEngine) {
    this.container = container;
    this.canvasEngine = canvasEngine;

    this.render();
    this.subscribe();
    this.setupGlobalDismiss();
  }

  private subscribe(): void {
    this.canvasEngine.onToolChange(() => this.render());
    this.canvasEngine.onEraserModeChange(() => this.render());
    this.canvasEngine.onStyleChange(() => this.updateValues());
    this.canvasEngine.onSelectionChange(() => this.render());
  }

  private getToolLabel(): string {
    if (this.canvasEngine.isEraserMode) {
      return 'Eraser';
    }
    const t = this.canvasEngine.activeTool;
    if (t === 'pen') {
      const b = this.canvasEngine.activeBrushType;
      return `${b.charAt(0).toUpperCase() + b.slice(1)} Brush`;
    }
    const labels: Record<string, string> = {
      select: 'Select & Move',
      rectangle: 'Rectangle',
      circle: 'Circle',
      triangle: 'Triangle',
      star: 'Star',
      diamond: 'Diamond',
      line: 'Line',
      arrow: 'Arrow',
      sticky_note: 'Sticky Note',
      text: 'Text Box',
      eraser: 'Eraser',
      marquee: 'Marquee Selection',
      circle_select: 'Circle Selection',
      lasso_select: 'Lasso Selection',
      eyedropper: 'Color Eyedropper',
      paint_bucket: 'Paint Bucket',
      lasso_brush: 'Lasso Brush',
      hand: 'Hand (Pan)',
      zoom: 'Zoom Tool',
      crop: 'Crop Tool'
    };
    return labels[t] || t;
  }

  public render(): void {
    const toolName = this.getToolLabel();
    const currentColor = this.colorTarget === 'stroke' ? this.canvasEngine.strokeColor : this.canvasEngine.fillColor;
    const strokeW = this.canvasEngine.strokeWidth;
    const opacityPct = Math.round(this.canvasEngine.elementOpacity * 100);
    const isEraseMode = this.canvasEngine.isEraserMode;

    const selectedIds = Array.from(this.canvasEngine.selectedElementIds);
    let selectedTextOrSticky = null;
    if (selectedIds.length === 1) {
      const el = this.canvasEngine.engine.speculativeElements.get(selectedIds[0]);
      if (el && (el.type === 'text' || el.type === 'sticky_note')) {
        selectedTextOrSticky = el;
      }
    }

    const strokeColor = this.canvasEngine.strokeColor;
    const fillColor = this.canvasEngine.fillColor;

    this.container.innerHTML = `
      <div class="studio-property-inner">
        <!-- Active Tool Indicator Pill -->
        <div class="prop-group tool-indicator-group">
          <span class="active-tool-pill ${isEraseMode ? 'eraser-mode-active' : ''}" id="prop-active-tool-pill">
            ${isEraseMode
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`
        : ''
      }
            <span>${toolName}</span>
          </span>
        </div>

        <div class="prop-divider"></div>

        <!-- 1. Popover Dropdown Button: [ 🎨 Color & Fill ▾ ] -->
        <div class="prop-popover-anchor" id="anchor-color-popover">
          <button 
            class="prop-popover-btn ${this.openPopover === 'color' ? 'active' : ''}" 
            id="btn-open-color-popover"
            title="Open Color & Fill Options (Click or hover 0.5s)"
            aria-haspopup="true"
            aria-expanded="${this.openPopover === 'color'}"
          >
            <div class="color-combo-preview" title="Outline: ${strokeColor}, Fill: ${fillColor}">
              <span class="color-dot stroke-dot" style="background-color: ${strokeColor};"></span>
              <span class="color-dot fill-dot ${fillColor === 'transparent' ? 'is-transparent' : ''}" style="background-color: ${fillColor === 'transparent' ? 'transparent' : fillColor};"></span>
            </div>
            <span class="prop-btn-label">Color & Fill</span>
            <span class="prop-chevron-arrow">▾</span>
          </button>

          <!-- Floating Popover Card for Color -->
          <div class="prop-popover-card ${this.openPopover === 'color' ? 'visible' : ''}" id="card-color-popover">
            <div class="popover-card-header">
              <span class="popover-title">Color & Opacity</span>
              <div class="color-target-toggle">
                <button class="color-target-btn ${this.colorTarget === 'stroke' ? 'active' : ''}" id="pop-target-stroke">Stroke</button>
                <button class="color-target-btn ${this.colorTarget === 'fill' ? 'active' : ''}" id="pop-target-fill">Fill</button>
              </div>
            </div>

            <!-- Custom Picker + Hex Field -->
            <div class="popover-color-inputs">
              <div class="color-picker-wrap" title="Custom color picker">
                <input 
                  type="color" 
                  id="pop-native-picker" 
                  class="native-color-input" 
                  value="${currentColor === 'transparent' ? '#ffffff' : currentColor.startsWith('#') && currentColor.length === 7 ? currentColor : '#4F46E5'}" 
                />
                <div class="color-preview-disc" style="background-color: ${currentColor};" id="pop-color-preview"></div>
              </div>
              <input 
                type="text" 
                id="pop-hex-input" 
                class="prop-hex-input" 
                value="${currentColor}" 
                title="Custom Hex Code"
                maxlength="7"
              />
              <button class="prop-swatch-none ${currentColor === 'transparent' ? 'active' : ''}" id="btn-color-transparent" title="Transparent Fill">
                None
              </button>
            </div>

            <!-- Swatches Grid -->
            <div class="popover-section-label">Designer Swatches</div>
            <div class="popover-swatches-grid">
              ${this.designerColors
        .map(
          (c) => `
                <button 
                  class="prop-color-swatch ${currentColor === c.value ? 'active' : ''} ${c.value === 'transparent' ? 'transparent-swatch' : ''}" 
                  data-color="${c.value}"
                  style="background-color: ${c.value === 'transparent' ? 'transparent' : c.value};"
                  title="${c.label}"
                ></button>
              `
        )
        .join('')}
            </div>

            <!-- Opacity Slider -->
            <div class="popover-opacity-row">
              <div class="opacity-label-wrap">
                <span class="popover-section-label">Opacity</span>
                <span class="prop-val-badge" id="pop-opacity-badge">${opacityPct}%</span>
              </div>
              <input 
                type="range" 
                id="pop-opacity-slider" 
                class="prop-slider" 
                min="0" 
                max="100" 
                value="${opacityPct}" 
                title="Layer/Element Opacity"
              />
            </div>
          </div>
        </div>

        <div class="prop-divider"></div>

        <!-- 2. Popover Dropdown Button: [ 📏 Stroke Size & Style ▾ ] -->
        <div class="prop-popover-anchor" id="anchor-stroke-popover">
          <button 
            class="prop-popover-btn ${this.openPopover === 'stroke' ? 'active' : ''}" 
            id="btn-open-stroke-popover"
            title="Open Stroke Width & Dash Styles (Click or hover 0.5s)"
            aria-haspopup="true"
            aria-expanded="${this.openPopover === 'stroke'}"
          >
            <div class="stroke-preview-line-wrap">
              <div class="stroke-preview-indicator" style="height: ${Math.min(10, Math.max(2, strokeW / 2))}px;"></div>
            </div>
            <span class="prop-btn-label">${strokeW}px · ${this.canvasEngine.activeDashStyle}</span>
            <span class="prop-chevron-arrow">▾</span>
          </button>

          <!-- Floating Popover Card for Stroke -->
          <div class="prop-popover-card stroke-card ${this.openPopover === 'stroke' ? 'visible' : ''}" id="card-stroke-popover">
            <div class="popover-card-header">
              <span class="popover-title">Stroke Width & Style</span>
              <span class="prop-val-badge" id="pop-stroke-badge">${strokeW}px</span>
            </div>

            <!-- Slider -->
            <div class="popover-slider-wrap">
              <input 
                type="range" 
                id="pop-stroke-slider" 
                class="prop-slider" 
                min="1" 
                max="80" 
                value="${strokeW}" 
                title="Adjust Stroke Width"
              />
            </div>

            <!-- Quick Presets -->
            <div class="popover-section-label">Presets</div>
            <div class="popover-preset-pills">
              ${[2, 4, 8, 16, 28]
        .map(
          (size) => `
                <button class="stroke-preset-btn ${strokeW === size ? 'active' : ''}" data-size="${size}">${size}px</button>
              `
        )
        .join('')}
            </div>

            <!-- Dash Style Pills -->
            <div class="popover-section-label" style="margin-top: 10px;">Line Dash Style</div>
            <div class="popover-dash-tabs">
              <button class="prop-tab-btn ${this.canvasEngine.activeDashStyle === 'solid' ? 'active' : ''}" data-dash="solid" title="Solid Continuous Line">
                <span>— Solid</span>
              </button>
              <button class="prop-tab-btn ${this.canvasEngine.activeDashStyle === 'dashed' ? 'active' : ''}" data-dash="dashed" title="Dashed Segment Line">
                <span>- - Dashed</span>
              </button>
              <button class="prop-tab-btn ${this.canvasEngine.activeDashStyle === 'dotted' ? 'active' : ''}" data-dash="dotted" title="Dotted Point Line">
                <span>··· Dotted</span>
              </button>
            </div>
          </div>
        </div>

        <div class="prop-divider"></div>

        <!-- 3. Selection Actions (Enlarged Targets) -->
        <div class="prop-group actions-group">
          ${selectedTextOrSticky
        ? `
            <button class="prop-btn prop-btn-action" id="prop-btn-edit-text" title="Edit Text Content (Enter)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              <span>Edit Text</span>
            </button>
          `
        : ''
      }
          <button class="prop-btn prop-btn-action" id="prop-btn-duplicate" title="Duplicate Selection (Ctrl+D)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>Duplicate</span>
          </button>
          <button class="prop-btn prop-btn-action text-destructive" id="prop-btn-delete" title="Delete Selection (Del)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
            <span>Delete</span>
          </button>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    // 1. Color Popover Toggle (Click & 500ms Hover)
    const colorBtn = this.container.querySelector('#btn-open-color-popover');
    const colorAnchor = this.container.querySelector('#anchor-color-popover');

    colorBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openPopover = this.openPopover === 'color' ? null : 'color';
      this.updatePopoverVisibility();
    });

    colorAnchor?.addEventListener('mouseenter', () => {
      if (this.colorLeaveTimer) {
        clearTimeout(this.colorLeaveTimer);
        this.colorLeaveTimer = null;
      }
      this.colorHoverTimer = window.setTimeout(() => {
        this.openPopover = 'color';
        this.updatePopoverVisibility();
      }, 500);
    });

    colorAnchor?.addEventListener('mouseleave', () => {
      if (this.colorHoverTimer) {
        clearTimeout(this.colorHoverTimer);
        this.colorHoverTimer = null;
      }
      this.colorLeaveTimer = window.setTimeout(() => {
        if (this.openPopover === 'color') {
          this.openPopover = null;
          this.updatePopoverVisibility();
        }
      }, 300);
    });

    // 2. Stroke Popover Toggle (Click & 500ms Hover)
    const strokeBtn = this.container.querySelector('#btn-open-stroke-popover');
    const strokeAnchor = this.container.querySelector('#anchor-stroke-popover');

    strokeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openPopover = this.openPopover === 'stroke' ? null : 'stroke';
      this.updatePopoverVisibility();
    });

    strokeAnchor?.addEventListener('mouseenter', () => {
      if (this.strokeLeaveTimer) {
        clearTimeout(this.strokeLeaveTimer);
        this.strokeLeaveTimer = null;
      }
      this.strokeHoverTimer = window.setTimeout(() => {
        this.openPopover = 'stroke';
        this.updatePopoverVisibility();
      }, 500);
    });

    strokeAnchor?.addEventListener('mouseleave', () => {
      if (this.strokeHoverTimer) {
        clearTimeout(this.strokeHoverTimer);
        this.strokeHoverTimer = null;
      }
      this.strokeLeaveTimer = window.setTimeout(() => {
        if (this.openPopover === 'stroke') {
          this.openPopover = null;
          this.updatePopoverVisibility();
        }
      }, 300);
    });

    // Prevent clicks inside popover cards from closing the popovers
    this.container.querySelector('#card-color-popover')?.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    this.container.querySelector('#card-stroke-popover')?.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Stroke vs Fill target switch
    this.container.querySelector('#pop-target-stroke')?.addEventListener('click', () => {
      this.colorTarget = 'stroke';
      this.render();
      this.openPopover = 'color';
      this.updatePopoverVisibility();
    });

    this.container.querySelector('#pop-target-fill')?.addEventListener('click', () => {
      this.colorTarget = 'fill';
      this.render();
      this.openPopover = 'color';
      this.updatePopoverVisibility();
    });

    // Native color input
    const nativePicker = this.container.querySelector('#pop-native-picker') as HTMLInputElement;
    nativePicker?.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      this.applyColor(val);
    });

    // Hex input
    const hexInput = this.container.querySelector('#pop-hex-input') as HTMLInputElement;
    hexInput?.addEventListener('change', (e) => {
      const val = (e.target as HTMLInputElement).value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        this.applyColor(val);
      }
    });

    // Transparent button
    this.container.querySelector('#btn-color-transparent')?.addEventListener('click', () => {
      this.applyColor('transparent');
    });

    // Color Swatches
    this.container.querySelectorAll('.popover-swatches-grid .prop-color-swatch').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const color = (e.currentTarget as HTMLElement).dataset.color;
        if (color) {
          this.applyColor(color);
        }
      });
    });

    // Opacity Slider
    const opacitySlider = this.container.querySelector('#pop-opacity-slider') as HTMLInputElement;
    opacitySlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
      this.canvasEngine.setElementOpacity(val);
      const badge = this.container.querySelector('#pop-opacity-badge');
      if (badge) badge.textContent = `${Math.round(val * 100)}%`;
    });

    // Stroke Slider
    const strokeSlider = this.container.querySelector('#pop-stroke-slider') as HTMLInputElement;
    strokeSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      this.canvasEngine.setStrokeWidth(val);
      const badge = this.container.querySelector('#pop-stroke-badge');
      if (badge) badge.textContent = `${val}px`;
      this.updateStrokeLabel();
    });

    // Stroke Preset Buttons
    this.container.querySelectorAll('.stroke-preset-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const size = parseInt((e.currentTarget as HTMLElement).dataset.size || '3', 10);
        this.canvasEngine.setStrokeWidth(size);
        this.container.querySelectorAll('.stroke-preset-btn').forEach((b) => {
          b.classList.toggle('active', b === e.currentTarget);
        });
        const slider = this.container.querySelector('#pop-stroke-slider') as HTMLInputElement;
        if (slider) slider.value = String(size);
        const badge = this.container.querySelector('#pop-stroke-badge');
        if (badge) badge.textContent = `${size}px`;
        this.updateStrokeLabel();
      });
    });

    // Dash Style Tabs
    this.container.querySelectorAll('.popover-dash-tabs .prop-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const dash = (e.currentTarget as HTMLElement).dataset.dash as DashStyle;
        if (dash) {
          this.canvasEngine.setDashStyle(dash);
          this.container.querySelectorAll('.popover-dash-tabs .prop-tab-btn').forEach((b) => {
            b.classList.toggle('active', b === e.currentTarget);
          });
          this.updateStrokeLabel();
        }
      });
    });

    // Edit text button
    this.container.querySelector('#prop-btn-edit-text')?.addEventListener('click', () => {
      const selectedIds = Array.from(this.canvasEngine.selectedElementIds);
      if (selectedIds.length === 1) {
        const el = this.canvasEngine.engine.speculativeElements.get(selectedIds[0]);
        if (el && (el.type === 'text' || el.type === 'sticky_note')) {
          TextEditModal.show(el, (newText) => {
            if (newText !== el.text) {
              this.canvasEngine.engine.submitMutation('UPDATE', el.id, { text: newText });
            }
          });
        }
      }
    });

    // Duplicate
    this.container.querySelector('#prop-btn-duplicate')?.addEventListener('click', () => {
      this.canvasEngine.duplicateSelected();
    });

    // Delete
    this.container.querySelector('#prop-btn-delete')?.addEventListener('click', () => {
      this.canvasEngine.deleteSelected();
    });
  }

  private applyColor(val: string): void {
    if (this.colorTarget === 'stroke') {
      this.canvasEngine.setStrokeColor(val);
    } else {
      this.canvasEngine.setFillColor(val);
    }
    this.updateColorPreviews(val);
  }

  private updateColorPreviews(val: string): void {
    const preview = this.container.querySelector('#pop-color-preview') as HTMLElement;
    if (preview) preview.style.backgroundColor = val;

    const hexInput = this.container.querySelector('#pop-hex-input') as HTMLInputElement;
    if (hexInput && val !== 'transparent') hexInput.value = val;

    const strokeDot = this.container.querySelector('.color-dot.stroke-dot') as HTMLElement;
    if (strokeDot && this.colorTarget === 'stroke') {
      strokeDot.style.backgroundColor = val;
    }
    const fillDot = this.container.querySelector('.color-dot.fill-dot') as HTMLElement;
    if (fillDot && this.colorTarget === 'fill') {
      fillDot.style.backgroundColor = val === 'transparent' ? 'transparent' : val;
      fillDot.classList.toggle('is-transparent', val === 'transparent');
    }

    this.container.querySelectorAll('.popover-swatches-grid .prop-color-swatch').forEach((s) => {
      s.classList.toggle('active', (s as HTMLElement).dataset.color === val);
    });
  }

  private updateStrokeLabel(): void {
    const label = this.container.querySelector('#btn-open-stroke-popover .prop-btn-label');
    if (label) {
      label.textContent = `${this.canvasEngine.strokeWidth}px · ${this.canvasEngine.activeDashStyle}`;
    }
    const preview = this.container.querySelector('.stroke-preview-indicator') as HTMLElement;
    if (preview) {
      preview.style.height = `${Math.min(10, Math.max(2, this.canvasEngine.strokeWidth / 2))}px`;
    }
  }

  private updatePopoverVisibility(): void {
    const colorBtn = this.container.querySelector('#btn-open-color-popover');
    const colorCard = this.container.querySelector('#card-color-popover');
    const strokeBtn = this.container.querySelector('#btn-open-stroke-popover');
    const strokeCard = this.container.querySelector('#card-stroke-popover');

    const isColor = this.openPopover === 'color';
    const isStroke = this.openPopover === 'stroke';

    colorBtn?.classList.toggle('active', isColor);
    colorBtn?.setAttribute('aria-expanded', String(isColor));
    colorCard?.classList.toggle('visible', isColor);

    strokeBtn?.classList.toggle('active', isStroke);
    strokeBtn?.setAttribute('aria-expanded', String(isStroke));
    strokeCard?.classList.toggle('visible', isStroke);
  }

  private setupGlobalDismiss(): void {
    window.addEventListener('click', (e) => {
      if (this.openPopover !== null) {
        const target = e.target as HTMLElement;
        if (!this.container.contains(target)) {
          this.openPopover = null;
          this.updatePopoverVisibility();
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.openPopover !== null) {
        this.openPopover = null;
        this.updatePopoverVisibility();
      }
    });
  }

  public updateValues(): void {
    const toolPill = this.container.querySelector('#prop-active-tool-pill span');
    if (toolPill) toolPill.textContent = this.getToolLabel();

    const currentColor = this.colorTarget === 'stroke' ? this.canvasEngine.strokeColor : this.canvasEngine.fillColor;
    this.updateColorPreviews(currentColor);
    this.updateStrokeLabel();
  }
}
