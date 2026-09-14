import { CanvasEngine } from '../canvas/CanvasEngine.ts';
import { BrushType, CanvasTool } from '../types.ts';

export interface ToolItem {
  id: string;
  label: string;
  shortcut: string;
  displayShortcut?: string;
  icon: string;
  isBrush?: boolean;
  brushType?: BrushType;
  toolType?: CanvasTool;
}

export interface ToolGroup {
  id: string;
  activeSubTool: string;
  items: ToolItem[];
}

export class ToolRail {
  private container: HTMLElement;
  private canvasEngine: CanvasEngine;

  // Active flyout group ID or null
  private openFlyoutId: string | null = null;
  private hoverTimer: number | null = null;
  private leaveTimer: number | null = null;

  // Icons registry
  private static readonly ICONS = {
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    trash: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
    select: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 7 18 3-7 7-3L3 3z"/></svg>`,
    hand: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
    zoom: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    marquee: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 3"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>`,
    circle_select: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 3"><circle cx="12" cy="12" r="9"/></svg>`,
    lasso_select: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 5 11 2-4 4-2L3 3z"/><path d="M12 18c3 2 7 1 8-1s0-4-3-5"/></svg>`,
    pen: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
    marker: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 2 8 8L10 22H2v-8L14 2z"/><path d="m10 6 8 8"/></svg>`,
    neon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    calligraphy: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 2-8.5 8.5L8 9.5 2 22l12.5-6-1-2.5L22 5z"/></svg>`,
    spray: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M8 4l2 3M16 4l-2 3"/><circle cx="12" cy="15" r="5"/><circle cx="10" cy="14" r="1" fill="currentColor"/><circle cx="14" cy="14" r="1" fill="currentColor"/></svg>`,
    eraser: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`,
    rectangle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>`,
    circle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>`,
    triangle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/></svg>`,
    star: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    diamond: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 12l10 10 10-10Z"/></svg>`,
    line: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="19" x2="19" y2="5"/></svg>`,
    arrow: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
    text: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>`,
    sticky_note: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/></svg>`,
    paint_bucket: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.6 2-4 .3 1.4 2 2.4 2 4Z"/></svg>`,
    lasso_brush: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15c2 4 8 5 12 3s4-6 1-8-8-2-10 1c-1.5 2.2-1 4 0 5Z"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`,
    eyedropper: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 7 7-6.5 6.5a2 2 0 0 1-1.4.6H8v-3.1a2 2 0 0 1 .6-1.4L12 2z"/><path d="m18 8 2 2"/><path d="M2 22s2-1 3-3"/></svg>`,
    crop: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>`,
    perspective_grid: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 6 18-3v18L3 18Z"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="4" x2="15" y2="20"/></svg>`
  };

  // Group definitions corresponding to standard creative software suite
  private groups: Record<string, ToolGroup> = {
    selection_group: {
      id: 'selection_group',
      activeSubTool: 'marquee',
      items: [
        {
          id: 'marquee',
          label: 'Selection',
          shortcut: 'M',
          displayShortcut: 'M',
          icon: ToolRail.ICONS.marquee,
          toolType: 'marquee'
        },
        {
          id: 'circle_select',
          label: 'Circle Selection',
          shortcut: 'Shift+M',
          displayShortcut: 'M',
          icon: ToolRail.ICONS.circle_select,
          toolType: 'circle_select'
        },
        {
          id: 'lasso_select',
          label: 'Lasso Selection',
          shortcut: 'L',
          displayShortcut: 'L',
          icon: ToolRail.ICONS.lasso_select,
          toolType: 'lasso_select'
        }
      ]
    },
    brush_group: {
      id: 'brush_group',
      activeSubTool: 'pen',
      items: [
        {
          id: 'pen',
          label: 'Pen',
          shortcut: 'B',
          displayShortcut: 'B',
          icon: ToolRail.ICONS.pen,
          isBrush: true,
          brushType: 'pen'
        },
        {
          id: 'marker',
          label: 'Marker',
          shortcut: 'Shift+B',
          displayShortcut: 'B',
          icon: ToolRail.ICONS.marker,
          isBrush: true,
          brushType: 'marker'
        },
        {
          id: 'neon',
          label: 'Neon',
          shortcut: 'N',
          displayShortcut: 'N',
          icon: ToolRail.ICONS.neon,
          isBrush: true,
          brushType: 'neon'
        },
        {
          id: 'calligraphy',
          label: 'Calligraphy',
          shortcut: 'K',
          displayShortcut: 'K',
          icon: ToolRail.ICONS.calligraphy,
          isBrush: true,
          brushType: 'calligraphy'
        },
        {
          id: 'spray',
          label: 'Spray',
          shortcut: 'S',
          displayShortcut: 'S',
          icon: ToolRail.ICONS.spray,
          isBrush: true,
          brushType: 'spray'
        }
      ]
    },
    shape_group: {
      id: 'shape_group',
      activeSubTool: 'rectangle',
      items: [
        {
          id: 'rectangle',
          label: 'Rectangle',
          shortcut: 'R',
          displayShortcut: 'R',
          icon: ToolRail.ICONS.rectangle,
          toolType: 'rectangle'
        },
        {
          id: 'circle',
          label: 'Circle',
          shortcut: 'C',
          displayShortcut: 'C',
          icon: ToolRail.ICONS.circle,
          toolType: 'circle'
        },
        {
          id: 'triangle',
          label: 'Triangle',
          shortcut: 'Shift+T',
          displayShortcut: 'T',
          icon: ToolRail.ICONS.triangle,
          toolType: 'triangle'
        },
        {
          id: 'star',
          label: '5-Point Star',
          shortcut: 'Shift+S',
          displayShortcut: 'S',
          icon: ToolRail.ICONS.star,
          toolType: 'star'
        },
        {
          id: 'diamond',
          label: 'Decision Diamond',
          shortcut: 'J',
          displayShortcut: 'J',
          icon: ToolRail.ICONS.diamond,
          toolType: 'diamond'
        },
        {
          id: 'line',
          label: 'Straight Line',
          shortcut: 'Shift+R',
          displayShortcut: 'R',
          icon: ToolRail.ICONS.line,
          toolType: 'line'
        },
        {
          id: 'arrow',
          label: 'Arrow Line',
          shortcut: 'A',
          displayShortcut: 'A',
          icon: ToolRail.ICONS.arrow,
          toolType: 'arrow'
        }
      ]
    },
    text_group: {
      id: 'text_group',
      activeSubTool: 'text',
      items: [
        {
          id: 'text',
          label: 'Text Tool',
          shortcut: 'T',
          displayShortcut: 'T',
          icon: ToolRail.ICONS.text,
          toolType: 'text'
        },
        {
          id: 'sticky_note',
          label: 'Sticky Note',
          shortcut: 'Shift+S',
          displayShortcut: 'S',
          icon: ToolRail.ICONS.sticky_note,
          toolType: 'sticky_note'
        }
      ]
    },
    fill_group: {
      id: 'fill_group',
      activeSubTool: 'paint_bucket',
      items: [
        {
          id: 'paint_bucket',
          label: 'Paint Bucket',
          shortcut: 'G',
          displayShortcut: 'G',
          icon: ToolRail.ICONS.paint_bucket,
          toolType: 'paint_bucket'
        },
        {
          id: 'lasso_brush',
          label: 'Lasso Brush',
          shortcut: 'Shift+L',
          displayShortcut: 'L',
          icon: ToolRail.ICONS.lasso_brush,
          toolType: 'lasso_brush'
        }
      ]
    },
    crop_group: {
      id: 'crop_group',
      activeSubTool: 'crop',
      items: [
        {
          id: 'crop',
          label: 'Crop Tool',
          shortcut: 'C',
          displayShortcut: 'C',
          icon: ToolRail.ICONS.crop,
          toolType: 'crop'
        },
        {
          id: 'perspective_grid',
          label: 'Perspective Grid',
          shortcut: "Ctrl+'",
          displayShortcut: 'C',
          icon: ToolRail.ICONS.perspective_grid,
          toolType: 'crop'
        }
      ]
    }
  };

  public getDisplayShortcut(item: ToolItem): string {
    if (item.displayShortcut) return item.displayShortcut;
    return item.shortcut.replace(/^(Shift|Ctrl|Alt)\+/, '');
  }

  public cycleGroup(groupId: string): void {
    const group = this.groups[groupId];
    if (!group || group.items.length <= 1) return;
    const currentIndex = group.items.findIndex((i) => i.id === group.activeSubTool);
    const nextIndex = (currentIndex + 1) % group.items.length;
    this.activateSubTool(groupId, group.items[nextIndex].id);
  }

  constructor(container: HTMLElement, canvasEngine: CanvasEngine) {
    this.container = container;
    this.canvasEngine = canvasEngine;

    this.render();
    this.subscribe();
    this.setupGlobalClickOutside();
  }

  private subscribe(): void {
    const syncGroupUI = () => {
      const tool = this.canvasEngine.activeTool;
      for (const group of Object.values(this.groups)) {
        const matchingItem = group.items.find((item) => {
          if (item.isBrush) {
            return tool === 'pen' && item.brushType === this.canvasEngine.activeBrushType;
          }
          return item.toolType === tool || item.id === tool;
        });
        if (matchingItem) {
          group.activeSubTool = matchingItem.id;
          const hint = this.container.querySelector(`#hint-${group.id}`);
          if (hint) hint.textContent = this.getDisplayShortcut(matchingItem);
          const wrap = this.container.querySelector(`#icon-wrap-${group.id}`);
          if (wrap) wrap.innerHTML = matchingItem.icon;
          const btn = this.container.querySelector(`#rail-btn-${group.id}`);
          if (btn) btn.setAttribute('title', `${matchingItem.label} (${matchingItem.shortcut})`);

          const flyout = this.container.querySelector(`#flyout-${group.id}`);
          if (flyout) {
            flyout.querySelectorAll('.flyout-card-item').forEach((row) => {
              const rId = (row as HTMLElement).dataset.subtoolId;
              const isSelected = rId === matchingItem.id;
              row.classList.toggle('active', isSelected);
              const checkSlot = row.querySelector('.flyout-item-check');
              if (checkSlot) checkSlot.innerHTML = isSelected ? ToolRail.ICONS.check : '';
            });
          }
        }
      }
      this.updateActiveStates();
    };

    this.canvasEngine.onToolChange(() => syncGroupUI());
    this.canvasEngine.onEraserModeChange(() => this.updateActiveStates());
    this.canvasEngine.onStyleChange(() => syncGroupUI());
  }

  private getActiveItem(groupId: string): ToolItem {
    const group = this.groups[groupId];
    const found = group.items.find((i) => i.id === group.activeSubTool);
    return found || group.items[0];
  }

  public render(): void {
    const selItem = this.getActiveItem('selection_group');
    const brushItem = this.getActiveItem('brush_group');
    const shapeItem = this.getActiveItem('shape_group');
    const textItem = this.getActiveItem('text_group');
    const fillItem = this.getActiveItem('fill_group');
    const cropItem = this.getActiveItem('crop_group');

    this.container.innerHTML = `
      <div class="studio-rail-inner" role="toolbar" aria-label="Tools" aria-orientation="vertical">
        <div class="rail-tools-group">
          <!-- Section 1: Navigation & Main Creation -->
          <!-- 1. Select & Move (V) -->
          <button 
            class="rail-tool-btn" 
            id="rail-btn-select"
            data-tool="select"
            title="Select & Move (V)"
            aria-label="Select & Move"
          >
            <div class="tool-icon-wrap">${ToolRail.ICONS.select}</div>
            <span class="rail-shortcut-hint">V</span>
          </button>

          <!-- 2. Paintbrush (B) with Sub-Brushes -->
          <div class="rail-flyout-anchor" id="anchor-brush_group">
            <button 
              class="rail-tool-btn has-corner-flyout" 
              id="rail-btn-brush_group"
              title="${brushItem.label} (${brushItem.shortcut}) — Click again or right-click to open brush menu"
              aria-label="${brushItem.label}"
            >
              <div class="tool-icon-wrap" id="icon-wrap-brush_group">${brushItem.icon}</div>
              <span class="rail-shortcut-hint" id="hint-brush_group">${this.getDisplayShortcut(brushItem)}</span>
              <span class="rail-corner-triangle"></span>
            </button>
            ${this.renderFlyoutHtml('brush_group')}
          </div>

          <!-- 3. Part Eraser Brush (E) -->
          <button 
            class="rail-tool-btn" 
            id="rail-btn-eraser"
            data-tool="eraser"
            title="Part Eraser Brush (E) — Erases parts of drawings"
            aria-label="Part Eraser"
          >
            <div class="tool-icon-wrap">${ToolRail.ICONS.eraser}</div>
            <span class="rail-shortcut-hint">E</span>
          </button>

          <!-- 4. Delete Element Tool (D) -->
          <button 
            class="rail-tool-btn" 
            id="rail-btn-delete-tool"
            data-tool="delete"
            title="Delete Element Tool (D) — Click or drag to delete art elements/shapes"
            aria-label="Delete Art Element"
          >
            <div class="tool-icon-wrap">${ToolRail.ICONS.trash}</div>
            <span class="rail-shortcut-hint">D</span>
          </button>
        </div>

        <div class="rail-divider"></div>

        <div class="rail-tools-group">
          <!-- Section 2: Area Selection Suite (M) -->
          <!-- 4. Selection Suite -->
          <div class="rail-flyout-anchor" id="anchor-selection_group">
            <button 
              class="rail-tool-btn has-corner-flyout" 
              id="rail-btn-selection_group"
              title="${selItem.label} (${selItem.shortcut}) — Right click for more selection tools"
              aria-label="${selItem.label}"
            >
              <div class="tool-icon-wrap" id="icon-wrap-selection_group">${selItem.icon}</div>
              <span class="rail-shortcut-hint" id="hint-selection_group">${this.getDisplayShortcut(selItem)}</span>
              <span class="rail-corner-triangle"></span>
            </button>
            ${this.renderFlyoutHtml('selection_group')}
          </div>

          <!-- 5. Shapes Suite (R) -->
          <div class="rail-flyout-anchor" id="anchor-shape_group">
            <button 
              class="rail-tool-btn has-corner-flyout" 
              id="rail-btn-shape_group"
              title="${shapeItem.label} (${shapeItem.shortcut}) — Right click for more shapes"
              aria-label="${shapeItem.label}"
            >
              <div class="tool-icon-wrap" id="icon-wrap-shape_group">${shapeItem.icon}</div>
              <span class="rail-shortcut-hint" id="hint-shape_group">${this.getDisplayShortcut(shapeItem)}</span>
              <span class="rail-corner-triangle"></span>
            </button>
            ${this.renderFlyoutHtml('shape_group')}
          </div>

          <!-- 6. Text & Sticky Notes (T) -->
          <div class="rail-flyout-anchor" id="anchor-text_group">
            <button 
              class="rail-tool-btn has-corner-flyout" 
              id="rail-btn-text_group"
              title="${textItem.label} (${textItem.shortcut})"
              aria-label="${textItem.label}"
            >
              <div class="tool-icon-wrap" id="icon-wrap-text_group">${textItem.icon}</div>
              <span class="rail-shortcut-hint" id="hint-text_group">${this.getDisplayShortcut(textItem)}</span>
              <span class="rail-corner-triangle"></span>
            </button>
            ${this.renderFlyoutHtml('text_group')}
          </div>
        </div>

        <div class="rail-divider"></div>

        <div class="rail-tools-group">
          <!-- Section 3: Fill, Lasso Brush, Eyedropper -->
          <!-- 7. Paint Bucket & Lasso Brush (G) -->
          <div class="rail-flyout-anchor" id="anchor-fill_group">
            <button 
              class="rail-tool-btn has-corner-flyout" 
              id="rail-btn-fill_group"
              title="${fillItem.label} (${fillItem.shortcut}) — Paint Bucket & Lasso Brush"
              aria-label="${fillItem.label}"
            >
              <div class="tool-icon-wrap" id="icon-wrap-fill_group">${fillItem.icon}</div>
              <span class="rail-shortcut-hint" id="hint-fill_group">${this.getDisplayShortcut(fillItem)}</span>
              <span class="rail-corner-triangle"></span>
            </button>
            ${this.renderFlyoutHtml('fill_group')}
          </div>

          <!-- 8. Eyedropper Tool (I) -->
          <button 
            class="rail-tool-btn" 
            id="rail-btn-eyedropper"
            data-tool="eyedropper"
            title="Eyedropper Color Picker (I)"
            aria-label="Eyedropper"
          >
            <div class="tool-icon-wrap">${ToolRail.ICONS.eyedropper}</div>
            <span class="rail-shortcut-hint">I</span>
          </button>

          <!-- 9. Crop & Perspective (C) -->
          <div class="rail-flyout-anchor" id="anchor-crop_group">
            <button 
              class="rail-tool-btn has-corner-flyout" 
              id="rail-btn-crop_group"
              title="${cropItem.label} (${cropItem.shortcut})"
              aria-label="${cropItem.label}"
            >
              <div class="tool-icon-wrap" id="icon-wrap-crop_group">${cropItem.icon}</div>
              <span class="rail-shortcut-hint" id="hint-crop_group">${this.getDisplayShortcut(cropItem)}</span>
              <span class="rail-corner-triangle"></span>
            </button>
            ${this.renderFlyoutHtml('crop_group')}
          </div>
        </div>

        <div class="rail-divider"></div>

        <div class="rail-tools-group">
          <!-- Section 4: Viewport Navigation -->
          <!-- 10. Hand Tool (H) -->
          <button 
            class="rail-tool-btn" 
            id="rail-btn-hand"
            data-tool="hand"
            title="Hand Tool / Pan (H or Space+Drag)"
            aria-label="Hand Tool"
          >
            <div class="tool-icon-wrap">${ToolRail.ICONS.hand}</div>
            <span class="rail-shortcut-hint">H</span>
          </button>

          <!-- 11. Zoom Tool (O) -->
          <button 
            class="rail-tool-btn" 
            id="rail-btn-zoom"
            data-tool="zoom"
            title="Zoom Tool (O) — Click to zoom in, Alt+Click to zoom out"
            aria-label="Zoom Tool"
          >
            <div class="tool-icon-wrap">${ToolRail.ICONS.zoom}</div>
            <span class="rail-shortcut-hint">O</span>
          </button>
        </div>

        <div class="rail-divider"></div>

        <!-- Quick Sticky Note Presets -->
        <div class="rail-sticky-presets" title="Quick Sticky Note Presets">
          <button class="sticky-preset-btn yellow" data-note-fill="#FEF08A" data-note-stroke="#EAB308" title="Yellow Note"></button>
          <button class="sticky-preset-btn green" data-note-fill="#BBF7D0" data-note-stroke="#16A34A" title="Mint Note"></button>
          <button class="sticky-preset-btn purple" data-note-fill="#E9D5FF" data-note-stroke="#9333EA" title="Lavender Note"></button>
          <button class="sticky-preset-btn blue" data-note-fill="#BAE6FD" data-note-stroke="#0284C7" title="Sky Note"></button>
        </div>

        <div class="rail-spacer"></div>

        <!-- Bottom Actions -->
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
    this.updateActiveStates();
  }

  private renderFlyoutHtml(groupId: string): string {
    const group = this.groups[groupId];
    if (!group) return '';

    return `
      <div class="rail-flyout-card ${this.openFlyoutId === groupId ? 'visible' : ''}" id="flyout-${groupId}">
        <div class="flyout-card-list">
          ${group.items
            .map((item) => {
              const isActive = group.activeSubTool === item.id;
              return `
              <div 
                class="flyout-card-item ${isActive ? 'active' : ''}" 
                data-group-id="${groupId}" 
                data-subtool-id="${item.id}"
                title="${item.label} (${item.shortcut})"
              >
                <div class="flyout-item-icon">${item.icon}</div>
                <span class="flyout-item-label">${item.label}</span>
                <span class="flyout-item-kbd">${item.shortcut}</span>
                <span class="flyout-item-check">${isActive ? ToolRail.ICONS.check : ''}</span>
              </div>
            `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  private setFlyout(groupId: string | null): void {
    this.openFlyoutId = groupId;
    this.container.querySelectorAll('.rail-flyout-card').forEach((card) => {
      const id = card.id.replace('flyout-', '');
      card.classList.toggle('visible', id === groupId);
    });
  }

  private activateSubTool(groupId: string, subToolId: string): void {
    const group = this.groups[groupId];
    if (!group) return;

    const item = group.items.find((i) => i.id === subToolId);
    if (!item) return;

    group.activeSubTool = subToolId;
    this.setFlyout(null);

    // Update button icon on rail
    const wrap = this.container.querySelector(`#icon-wrap-${groupId}`);
    if (wrap) wrap.innerHTML = item.icon;

    // Update shortcut hint on rail button
    const hint = this.container.querySelector(`#hint-${groupId}`);
    if (hint) hint.textContent = this.getDisplayShortcut(item);

    const btn = this.container.querySelector(`#rail-btn-${groupId}`);
    if (btn) btn.setAttribute('title', `${item.label} (${item.shortcut})`);

    // Activate tool in engine
    if (item.isBrush && item.brushType) {
      this.canvasEngine.setEraserMode(false);
      this.canvasEngine.setBrushType(item.brushType);
    } else if (item.toolType) {
      this.canvasEngine.setEraserMode(false);
      this.canvasEngine.setTool(item.toolType);
    }

    // Refresh checkmarks inside flyout
    const flyout = this.container.querySelector(`#flyout-${groupId}`);
    if (flyout) {
      flyout.querySelectorAll('.flyout-card-item').forEach((row) => {
        const rId = (row as HTMLElement).dataset.subtoolId;
        const isSelected = rId === subToolId;
        row.classList.toggle('active', isSelected);
        const checkSlot = row.querySelector('.flyout-item-check');
        if (checkSlot) checkSlot.innerHTML = isSelected ? ToolRail.ICONS.check : '';
      });
    }

    this.updateActiveStates();
  }

  private attachEvents(): void {
    // 1. Direct tool buttons
    const directTools = ['select', 'eraser', 'delete-tool', 'eyedropper', 'hand', 'zoom'];
    directTools.forEach((tool) => {
      this.container.querySelector(`#rail-btn-${tool}`)?.addEventListener('click', () => {
        this.setFlyout(null);
        if (tool === 'eraser') {
          this.canvasEngine.toggleEraserMode();
        } else if (tool === 'delete-tool') {
          this.canvasEngine.setEraserMode(false);
          this.canvasEngine.setTool('delete');
        } else {
          this.canvasEngine.setEraserMode(false);
          this.canvasEngine.setTool(tool as CanvasTool);
        }
        this.updateActiveStates();
      });
    });

    // 2. Flyout Group Buttons
    Object.keys(this.groups).forEach((groupId) => {
      const btn = this.container.querySelector(`#rail-btn-${groupId}`);
      const anchor = this.container.querySelector(`#anchor-${groupId}`);
      const group = this.groups[groupId];

      // Left click: if already active in this group, toggle flyout; otherwise activate current sub-tool
      btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isGroupActive = this.isGroupActive(groupId);
        if (isGroupActive) {
          // Toggle flyout
          this.setFlyout(this.openFlyoutId === groupId ? null : groupId);
        } else {
          this.activateSubTool(groupId, group.activeSubTool);
        }
      });

      // Tap on corner indicator opens flyout directly (ideal for mobile touch)
      const triangle = anchor?.querySelector('.rail-corner-triangle');
      triangle?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setFlyout(this.openFlyoutId === groupId ? null : groupId);
      });

      // Right click: open flyout immediately
      btn?.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setFlyout(groupId);
      });

      // Hover dwell 450ms opens flyout, mouseleave closes
      anchor?.addEventListener('mouseenter', () => {
        if (this.leaveTimer) {
          clearTimeout(this.leaveTimer);
          this.leaveTimer = null;
        }
        this.hoverTimer = window.setTimeout(() => {
          this.setFlyout(groupId);
        }, 450);
      });

      anchor?.addEventListener('mouseleave', () => {
        if (this.hoverTimer) {
          clearTimeout(this.hoverTimer);
          this.hoverTimer = null;
        }
        this.leaveTimer = window.setTimeout(() => {
          if (this.openFlyoutId === groupId) {
            this.setFlyout(null);
          }
        }, 300);
      });
    });

    // 3. Flyout card item clicks
    this.container.querySelectorAll('.flyout-card-item').forEach((row) => {
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupId = (e.currentTarget as HTMLElement).dataset.groupId;
        const subToolId = (e.currentTarget as HTMLElement).dataset.subtoolId;
        if (groupId && subToolId) {
          this.activateSubTool(groupId, subToolId);
        }
      });
    });

    // 4. Sticky note color swatches
    this.container.querySelectorAll('.sticky-preset-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.setFlyout(null);
        const fill = (e.currentTarget as HTMLElement).dataset.noteFill;
        const stroke = (e.currentTarget as HTMLElement).dataset.noteStroke;
        this.canvasEngine.setEraserMode(false);
        this.canvasEngine.setTool('sticky_note');
        if (fill) this.canvasEngine.fillColor = fill;
        if (stroke) this.canvasEngine.setStrokeColor(stroke);
        this.updateActiveStates();
      });
    });

    // 5. Delete button
    this.container.querySelector('#rail-btn-delete')?.addEventListener('click', () => {
      this.setFlyout(null);
      this.canvasEngine.deleteSelected();
    });
  }

  private isGroupActive(groupId: string): boolean {
    const t = this.canvasEngine.activeTool;
    const isErase = this.canvasEngine.isEraserMode;
    if (isErase) return false;

    if (groupId === 'brush_group') {
      return t === 'pen';
    }
    if (groupId === 'selection_group') {
      return t === 'marquee' || t === 'circle_select' || t === 'lasso_select';
    }
    if (groupId === 'shape_group') {
      return ['rectangle', 'circle', 'triangle', 'star', 'diamond', 'line', 'arrow'].includes(t);
    }
    if (groupId === 'text_group') {
      return t === 'text' || t === 'sticky_note';
    }
    if (groupId === 'fill_group') {
      return t === 'paint_bucket' || t === 'lasso_brush';
    }
    if (groupId === 'crop_group') {
      return t === 'crop';
    }
    return false;
  }

  private setupGlobalClickOutside(): void {
    window.addEventListener('click', (e) => {
      if (this.openFlyoutId !== null) {
        const target = e.target as HTMLElement;
        if (!this.container.contains(target)) {
          this.setFlyout(null);
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.openFlyoutId !== null) {
        this.setFlyout(null);
      }
    });
  }

  public updateActiveStates(): void {
    const activeTool = this.canvasEngine.activeTool;
    const isErase = this.canvasEngine.isEraserMode;

    // Direct buttons
    const selectBtn = this.container.querySelector('#rail-btn-select');
    selectBtn?.classList.toggle('active', activeTool === 'select' && !isErase);

    const eraserBtn = this.container.querySelector('#rail-btn-eraser');
    eraserBtn?.classList.toggle('active', isErase);

    const eyedropperBtn = this.container.querySelector('#rail-btn-eyedropper');
    eyedropperBtn?.classList.toggle('active', activeTool === 'eyedropper' && !isErase);

    const handBtn = this.container.querySelector('#rail-btn-hand');
    handBtn?.classList.toggle('active', activeTool === 'hand' && !isErase);

    const zoomBtn = this.container.querySelector('#rail-btn-zoom');
    zoomBtn?.classList.toggle('active', activeTool === 'zoom' && !isErase);

    const deleteToolBtn = this.container.querySelector('#rail-btn-delete-tool');
    deleteToolBtn?.classList.toggle('active', activeTool === 'delete' && !isErase);

    // Flyout Group Buttons — all use standard active state
    Object.keys(this.groups).forEach((groupId) => {
      const btn = this.container.querySelector(`#rail-btn-${groupId}`);
      const isGroupActive = this.isGroupActive(groupId);
      btn?.classList.toggle('active', isGroupActive);
    });
  }
}
