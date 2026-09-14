import { StateEngine } from '../engine/StateEngine.ts';
import { CanvasEngine } from '../canvas/CanvasEngine.ts';

export class LayerPanel {
  private container: HTMLElement;
  private engine: StateEngine;
  private canvasEngine: CanvasEngine;
  private isVisible: boolean = false;

  constructor(container: HTMLElement, engine: StateEngine, canvasEngine: CanvasEngine) {
    this.container = container;
    this.engine = engine;
    this.canvasEngine = canvasEngine;

    this.render();
    this.subscribe();
  }

  private subscribe(): void {
    this.engine.onLayersChange(() => this.render());
    this.engine.onStateChange(() => this.render());
    this.canvasEngine.onToolChange(() => this.updateSelectionInfo());
  }

  public onVisibilityChange?: (isOpen: boolean) => void;

  public toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.classList.toggle('open', this.isVisible);
    this.render();
    this.onVisibilityChange?.(this.isVisible);
  }

  public open(): void {
    this.isVisible = true;
    this.container.classList.add('open');
    this.render();
    this.onVisibilityChange?.(true);
  }

  public close(): void {
    this.isVisible = false;
    this.container.classList.remove('open');
    this.onVisibilityChange?.(false);
  }

  public isOpen(): boolean {
    return this.isVisible;
  }

  public render(): void {
    if (!this.isVisible) {
      this.container.innerHTML = '';
      return;
    }

    const sortedLayers = this.engine.getSortedLayers().reverse(); // Show top layer at the top
    const activeLayerId = this.engine.activeLayerId;
    const selectedCount = this.canvasEngine.selectedElementIds.size;

    // Count elements per layer
    const countMap = new Map<string, number>();
    for (const el of this.engine.speculativeElements.values()) {
      const lid = el.layerId || 'layer-1';
      countMap.set(lid, (countMap.get(lid) || 0) + 1);
    }

    this.container.innerHTML = `
      <div class="layer-panel-inner">
        <div class="layer-panel-header">
          <div class="layer-header-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
            <span>Layers</span>
            <span class="layer-count-badge">${this.engine.layers.size}</span>
          </div>

          <div class="layer-header-actions">
            <button class="layer-btn-icon" id="btn-add-layer" title="Add New Layer (+)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="layer-btn-icon" id="btn-close-layers" title="Close Panel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Selected Element Migration Dock -->
        ${
          selectedCount > 0
            ? `
          <div class="layer-selection-dock">
            <span class="layer-sel-label">${selectedCount} selected:</span>
            <select id="layer-move-select" class="layer-select-dropdown" title="Move selected elements to layer">
              <option value="" disabled selected>Move to layer...</option>
              ${this.engine.getSortedLayers().map((l) => `<option value="${l.id}">${l.name}</option>`).join('')}
            </select>
          </div>
        `
            : ''
        }

        <!-- Layers Stack List -->
        <div class="layers-list">
          ${sortedLayers
            .map((layer) => {
              const isActive = layer.id === activeLayerId;
              const count = countMap.get(layer.id) || 0;
              const opacityPct = Math.round(layer.opacity * 100);

              return `
                <div class="layer-item ${isActive ? 'active' : ''} ${!layer.visible ? 'hidden-layer' : ''}" data-layer-id="${layer.id}">
                  <div class="layer-item-main">
                    <!-- Layer Selection & Name -->
                    <div class="layer-name-group" title="Click to set active drawing layer">
                      <span class="layer-active-indicator" title="${isActive ? 'Active drawing layer' : 'Click to activate'}"></span>
                      <input 
                        type="text" 
                        class="layer-name-input" 
                        value="${layer.name}" 
                        data-layer-id="${layer.id}"
                        title="Click to rename layer"
                      />
                      <span class="layer-item-count">${count} items</span>
                    </div>

                    <!-- Quick Control Toggles -->
                    <div class="layer-toggles">
                      <!-- Visibility (Eye) -->
                      <button class="layer-icon-toggle ${!layer.visible ? 'muted' : ''}" data-action="visibility" data-layer-id="${layer.id}" title="${layer.visible ? 'Hide layer' : 'Show layer'}">
                        ${
                          layer.visible
                            ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
                            : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m2 2 20 20"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/></svg>`
                        }
                      </button>

                      <!-- Lock -->
                      <button class="layer-icon-toggle ${layer.locked ? 'locked' : 'muted'}" data-action="lock" data-layer-id="${layer.id}" title="${layer.locked ? 'Unlock layer' : 'Lock layer'}">
                        ${
                          layer.locked
                            ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
                            : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`
                        }
                      </button>

                      <!-- Reorder Up -->
                      <button class="layer-icon-toggle" data-action="up" data-layer-id="${layer.id}" title="Move Up in Stack">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                      </button>

                      <!-- Reorder Down -->
                      <button class="layer-icon-toggle" data-action="down" data-layer-id="${layer.id}" title="Move Down in Stack">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>

                      <!-- Delete -->
                      <button class="layer-icon-toggle delete-btn" data-action="delete" data-layer-id="${layer.id}" title="Delete Layer">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>

                  <!-- Layer Opacity Slider Strip -->
                  <div class="layer-opacity-strip">
                    <span class="opacity-label">Opacity: ${opacityPct}%</span>
                    <input 
                      type="range" 
                      class="layer-opacity-slider" 
                      min="0" 
                      max="100" 
                      value="${opacityPct}" 
                      data-layer-id="${layer.id}"
                      title="Adjust layer opacity"
                    />
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    // Add layer
    this.container.querySelector('#btn-add-layer')?.addEventListener('click', () => {
      this.engine.createLayer();
    });

    // Close panel
    this.container.querySelector('#btn-close-layers')?.addEventListener('click', () => {
      this.close();
    });

    // Move selected elements
    const moveSelect = this.container.querySelector('#layer-move-select') as HTMLSelectElement;
    moveSelect?.addEventListener('change', () => {
      const targetLayerId = moveSelect.value;
      if (targetLayerId) {
        for (const id of this.canvasEngine.selectedElementIds) {
          this.engine.submitMutation('UPDATE', id, { layerId: targetLayerId });
        }
        this.canvasEngine.requestRender();
        this.render();
      }
    });

    // Layer row click (Set active layer)
    this.container.querySelectorAll('.layer-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.layer-toggles') || target.tagName === 'INPUT') return;
        const layerId = (item as HTMLElement).dataset.layerId;
        if (layerId) {
          this.engine.setActiveLayer(layerId);
        }
      });
    });

    // Layer name rename
    this.container.querySelectorAll('.layer-name-input').forEach((input) => {
      input.addEventListener('change', (e) => {
        const val = (e.target as HTMLInputElement).value;
        const layerId = (e.target as HTMLInputElement).dataset.layerId;
        if (layerId && val.trim()) {
          this.engine.renameLayer(layerId, val.trim());
        }
      });
    });

    // Layer actions (visibility, lock, up, down, delete)
    this.container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (btn as HTMLElement).dataset.action;
        const layerId = (btn as HTMLElement).dataset.layerId;
        if (!layerId) return;

        if (action === 'visibility') {
          this.engine.toggleLayerVisibility(layerId);
        } else if (action === 'lock') {
          this.engine.toggleLayerLock(layerId);
        } else if (action === 'up') {
          this.engine.moveLayerUp(layerId);
        } else if (action === 'down') {
          this.engine.moveLayerDown(layerId);
        } else if (action === 'delete') {
          if (confirm('Delete this layer? Any elements on it will be moved to the base layer.')) {
            this.engine.deleteLayer(layerId);
          }
        }
      });
    });

    // Layer opacity slider
    this.container.querySelectorAll('.layer-opacity-slider').forEach((slider) => {
      slider.addEventListener('input', (e) => {
        const val = Number((e.target as HTMLInputElement).value);
        const layerId = (e.target as HTMLInputElement).dataset.layerId;
        if (layerId) {
          this.engine.setLayerOpacity(layerId, val / 100);
        }
      });
    });
  }

  private updateSelectionInfo(): void {
    if (this.isVisible) {
      this.render();
    }
  }
}
