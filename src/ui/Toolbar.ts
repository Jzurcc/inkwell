import { CanvasEngine } from '../canvas/CanvasEngine.ts';
import { ElementType } from '../types.ts';

export class Toolbar {
  private container: HTMLElement;
  private engine: CanvasEngine;

  private tools: Array<{ id: ElementType | 'select'; label: string; shortcut: string; icon: string }> = [
    {
      id: 'select',
      label: 'Select & Move',
      shortcut: 'V',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 7 18 3-7 7-3L3 3z"/></svg>`
    },
    {
      id: 'pen',
      label: 'Freehand Brush',
      shortcut: 'B',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`
    },
    {
      id: 'rectangle',
      label: 'Rectangle',
      shortcut: 'R',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="3"/></svg>`
    },
    {
      id: 'circle',
      label: 'Ellipse',
      shortcut: 'C',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>`
    },
    {
      id: 'arrow',
      label: 'Arrow Connector',
      shortcut: 'A',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`
    },
    {
      id: 'sticky_note',
      label: 'Sticky Note',
      shortcut: 'S',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/></svg>`
    },
    {
      id: 'text',
      label: 'Text Label',
      shortcut: 'T',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>`
    }
  ];

  private colors = [
    { value: '#0F172A', label: 'Ink Charcoal' },
    { value: '#4F46E5', label: 'Royal Indigo' },
    { value: '#10B981', label: 'Fresh Mint' },
    { value: '#F43F5E', label: 'Coral Rose' },
    { value: '#F59E0B', label: 'Warm Amber' },
    { value: '#0284C7', label: 'Sky Blue' }
  ];

  constructor(container: HTMLElement, engine: CanvasEngine) {
    this.container = container;
    this.engine = engine;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="toolbar-island double-bezel" role="toolbar" aria-label="Canvas Tools">
        <div class="tool-group">
          ${this.tools
            .map(
              (t) => `
            <button 
              class="tool-btn ${this.engine.activeTool === t.id ? 'active' : ''}" 
              data-tool="${t.id}"
              title="${t.label} (${t.shortcut})"
              aria-label="${t.label}"
            >
              ${t.icon}
              <span class="key-hint">${t.shortcut}</span>
            </button>
          `
            )
            .join('')}
        </div>

        <div class="toolbar-divider"></div>

        <!-- Color Swatches -->
        <div class="tool-group colors-group">
          ${this.colors
            .map(
              (c) => `
            <button 
              class="color-swatch ${this.engine.strokeColor === c.value ? 'active' : ''}" 
              data-color="${c.value}"
              style="background-color: ${c.value};"
              title="${c.label}"
              aria-label="Color ${c.label}"
            ></button>
          `
            )
            .join('')}
        </div>

        <div class="toolbar-divider"></div>

        <!-- Stroke Width -->
        <div class="tool-group stroke-group">
          <button class="stroke-btn ${this.engine.strokeWidth === 2 ? 'active' : ''}" data-stroke="2" title="Thin (2px)">
            <span class="stroke-line" style="height: 2px;"></span>
          </button>
          <button class="stroke-btn ${this.engine.strokeWidth === 4 ? 'active' : ''}" data-stroke="4" title="Medium (4px)">
            <span class="stroke-line" style="height: 4px;"></span>
          </button>
          <button class="stroke-btn ${this.engine.strokeWidth === 8 ? 'active' : ''}" data-stroke="8" title="Thick (8px)">
            <span class="stroke-line" style="height: 8px;"></span>
          </button>
        </div>

        <div class="toolbar-divider"></div>

        <!-- Zoom & Actions -->
        <div class="tool-group actions-group">
          <button class="action-btn" id="btn-undo" title="Undo (Ctrl+Z)" aria-label="Undo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
          </button>
          <button class="action-btn" id="btn-redo" title="Redo (Ctrl+Y)" aria-label="Redo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/></svg>
          </button>
          <div class="toolbar-subdivider"></div>
          <button class="action-btn" id="btn-zoom-out" title="Zoom Out" aria-label="Zoom Out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
          </button>
          <button class="action-btn" id="btn-reset-view" title="Reset View (100%)" aria-label="Reset View">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
          <button class="action-btn" id="btn-zoom-in" title="Zoom In" aria-label="Zoom In">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
          </button>
          <button class="action-btn text-destructive" id="btn-delete-selected" title="Delete Selected (Del)" aria-label="Delete Selected">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `;

    this.attachEvents();
    this.engine.onToolChange(() => this.updateActiveStates());
    this.engine.onStyleChange(() => this.updateActiveStates());
    this.engine.engine.onStateChange(() => this.updateUndoRedoStates());
  }

  private attachEvents(): void {
    // Tool buttons
    this.container.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = (e.currentTarget as HTMLElement).dataset.tool as ElementType | 'select';
        if (target) {
          this.engine.setTool(target);
        }
      });
    });

    // Color buttons
    this.container.querySelectorAll('.color-swatch').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const color = (e.currentTarget as HTMLElement).dataset.color;
        if (color) {
          this.engine.setStrokeColor(color);
        }
      });
    });

    // Stroke width buttons
    this.container.querySelectorAll('.stroke-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const stroke = Number((e.currentTarget as HTMLElement).dataset.stroke);
        if (stroke) {
          this.engine.setStrokeWidth(stroke);
        }
      });
    });

    // Undo & Redo buttons
    this.container.querySelector('#btn-undo')?.addEventListener('click', () => {
      this.engine.engine.undo();
      this.updateUndoRedoStates();
    });

    this.container.querySelector('#btn-redo')?.addEventListener('click', () => {
      this.engine.engine.redo();
      this.updateUndoRedoStates();
    });

    // Zoom buttons
    this.container.querySelector('#btn-zoom-in')?.addEventListener('click', () => this.engine.zoomIn());
    this.container.querySelector('#btn-zoom-out')?.addEventListener('click', () => this.engine.zoomOut());
    this.container.querySelector('#btn-reset-view')?.addEventListener('click', () => this.engine.resetView());
    this.container.querySelector('#btn-delete-selected')?.addEventListener('click', () => this.engine.deleteSelected());
  }

  public updateUndoRedoStates(): void {
    const undoBtn = this.container.querySelector('#btn-undo') as HTMLButtonElement;
    const redoBtn = this.container.querySelector('#btn-redo') as HTMLButtonElement;
    if (undoBtn) {
      const canUndo = this.engine.engine.canUndo();
      undoBtn.style.opacity = canUndo ? '1' : '0.4';
      undoBtn.style.cursor = canUndo ? 'pointer' : 'default';
    }
    if (redoBtn) {
      const canRedo = this.engine.engine.canRedo();
      redoBtn.style.opacity = canRedo ? '1' : '0.4';
      redoBtn.style.cursor = canRedo ? 'pointer' : 'default';
    }
  }

  public updateActiveStates(): void {
    this.container.querySelectorAll('.tool-btn').forEach((btn) => {
      const tool = (btn as HTMLElement).dataset.tool;
      btn.classList.toggle('active', tool === this.engine.activeTool);
    });

    this.container.querySelectorAll('.color-swatch').forEach((btn) => {
      const color = (btn as HTMLElement).dataset.color;
      btn.classList.toggle('active', color === this.engine.strokeColor);
    });

    this.container.querySelectorAll('.stroke-btn').forEach((btn) => {
      const stroke = Number((btn as HTMLElement).dataset.stroke);
      btn.classList.toggle('active', stroke === this.engine.strokeWidth);
    });
  }
}
