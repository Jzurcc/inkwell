import { StateEngine } from '../engine/StateEngine.ts';
import { CanvasEngine } from '../canvas/CanvasEngine.ts';

export class StudioFooter {
  private container: HTMLElement;
  private engine: StateEngine;
  private canvasEngine: CanvasEngine;
  private minimapVisible: boolean = true;

  constructor(
    container: HTMLElement,
    engine: StateEngine,
    canvasEngine: CanvasEngine
  ) {
    this.container = container;
    this.engine = engine;
    this.canvasEngine = canvasEngine;

    this.render();
    this.subscribe();
  }

  private subscribe(): void {
    this.engine.onStateChange(() => this.updateCounters());
    this.canvasEngine.onStyleChange(() => this.render());
  }

  public render(): void {
    const zoomPct = Math.round(this.canvasEngine.camera.zoom * 100);
    const elementCount = this.engine.speculativeElements.size;

    this.container.innerHTML = `
      <div class="studio-footer-inner">
        <!-- Left: Room Selector & Element Count -->
        <div class="studio-footer-left">
          <div class="room-selector-dock">
            <span class="room-hash-icon">#</span>
            <select id="footer-room-select" class="footer-room-select" title="Switch Room">
              <option value="room-alpha" ${this.engine.roomId === 'room-alpha' ? 'selected' : ''}>room-alpha</option>
              <option value="room-collab" ${this.engine.roomId === 'room-collab' ? 'selected' : ''}>room-collab</option>
              <option value="room-engineering" ${this.engine.roomId === 'room-engineering' ? 'selected' : ''}>room-engineering</option>
            </select>
          </div>

          <div class="footer-v-divider"></div>

          <div class="studio-counter-pill" id="footer-element-count">
            <span>${elementCount}</span> element${elementCount === 1 ? '' : 's'}
          </div>
        </div>

        <!-- Center: Keyboard Shortcuts Help Trigger -->
        <div class="studio-footer-center">
          <button class="footer-hint-btn" id="btn-show-shortcuts" title="View Keyboard Shortcuts">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Shortcuts</span>
          </button>
        </div>

        <!-- Right: Zoom Controls & Minimap Minimap Toggle -->
        <div class="studio-footer-right">
          <button class="footer-tool-btn" id="footer-btn-minimap" title="Toggle Minimap Minimap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
            <span>Minimap</span>
          </button>

          <div class="footer-v-divider"></div>

          <!-- Zoom Slider Controls (Lucidchart / Canva standard) -->
          <div class="footer-zoom-dock">
            <button class="zoom-btn" id="footer-zoom-out" title="Zoom Out (-)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>

            <input 
              type="range" 
              id="footer-zoom-slider" 
              class="footer-zoom-slider" 
              min="20" 
              max="300" 
              value="${zoomPct}" 
              title="Zoom Level" 
            />

            <button class="zoom-btn" id="footer-zoom-in" title="Zoom In (+)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>

            <button class="zoom-level-label" id="footer-zoom-reset" title="Reset to 100% (Ctrl+0)">
              ${zoomPct}%
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    // Room select
    const roomSelect = this.container.querySelector('#footer-room-select') as HTMLSelectElement;
    roomSelect?.addEventListener('change', (e) => {
      const target = (e.target as HTMLSelectElement).value;
      if (target) {
        window.location.hash = target;
        this.engine.setRoom(target);
      }
    });

    // Zoom buttons
    this.container.querySelector('#footer-zoom-in')?.addEventListener('click', () => {
      this.canvasEngine.zoomIn();
      this.updateZoomDisplay();
    });

    this.container.querySelector('#footer-zoom-out')?.addEventListener('click', () => {
      this.canvasEngine.zoomOut();
      this.updateZoomDisplay();
    });

    this.container.querySelector('#footer-zoom-reset')?.addEventListener('click', () => {
      this.canvasEngine.resetView();
      this.updateZoomDisplay();
    });

    // Zoom slider
    const slider = this.container.querySelector('#footer-zoom-slider') as HTMLInputElement;
    slider?.addEventListener('input', (e) => {
      const val = Number((e.target as HTMLInputElement).value);
      this.canvasEngine.camera.zoom = val / 100;
      (this.canvasEngine as any).requestRender();
      this.updateZoomDisplay();
    });

    // Minimap toggle
    const minimapBtn = this.container.querySelector('#footer-btn-minimap');
    const minimapContainer = document.getElementById('minimap-container');
    minimapBtn?.addEventListener('click', () => {
      this.minimapVisible = !this.minimapVisible;
      if (minimapContainer) {
        minimapContainer.style.display = this.minimapVisible ? 'block' : 'none';
      }
      minimapBtn.classList.toggle('active', this.minimapVisible);
    });

    // Minimap close button
    document.getElementById('btn-close-minimap')?.addEventListener('click', () => {
      this.minimapVisible = false;
      if (minimapContainer) minimapContainer.style.display = 'none';
      minimapBtn?.classList.remove('active');
    });

    // Shortcuts popover
    this.container.querySelector('#btn-show-shortcuts')?.addEventListener('click', () => {
      StudioFooter.showShortcutsModal();
    });
  }

  public updateZoomDisplay(): void {
    const zoomPct = Math.round(this.canvasEngine.camera.zoom * 100);
    const label = this.container.querySelector('#footer-zoom-reset');
    if (label) label.textContent = `${zoomPct}%`;

    const slider = this.container.querySelector('#footer-zoom-slider') as HTMLInputElement;
    if (slider) slider.value = String(zoomPct);
  }

  public updateCounters(): void {
    const count = this.engine.speculativeElements.size;
    const countEl = this.container.querySelector('#footer-element-count');
    if (countEl) {
      countEl.innerHTML = `<span>${count}</span> element${count === 1 ? '' : 's'}`;
    }
  }

  public static showShortcutsModal(): void {
    const existing = document.querySelector('.shortcuts-modal-backdrop');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop visible shortcuts-modal-backdrop';
    modal.innerHTML = `
      <div class="modal-dialog shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <div class="modal-header">
          <div class="modal-title-group">
            <span class="modal-icon icon-indigo">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M6 12h.01"/><path d="M10 12h.01"/><path d="M14 12h.01"/><path d="M18 12h.01"/><path d="M7 16h10"/></svg>
            </span>
            <div>
              <h3 id="shortcuts-title">Keyboard Shortcuts</h3>
              <p class="modal-subtitle">Quick reference to master your creative studio</p>
            </div>
          </div>
          <button class="modal-close-btn" id="btn-close-shortcuts" aria-label="Close dialog" title="Close (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="modal-body shortcuts-body">
          <div class="shortcuts-section">
            <h4 class="shortcuts-section-title">Tools & Brushes</h4>
            <div class="shortcuts-grid">
              <div class="shortcut-row"><span>Select / Move</span><kbd>V</kbd></div>
              <div class="shortcut-row"><span>Pen Brush</span><kbd>B</kbd></div>
              <div class="shortcut-row"><span>Spray Brush</span><kbd>S</kbd></div>
              <div class="shortcut-row"><span>Part Eraser Brush</span><kbd>E</kbd></div>
              <div class="shortcut-row"><span>Delete Art Element</span><kbd>D</kbd></div>
              <div class="shortcut-row"><span>Zoom Tool</span><kbd>O</kbd></div>
              <div class="shortcut-row"><span>Rectangle</span><kbd>R</kbd></div>
              <div class="shortcut-row"><span>Circle</span><kbd>C</kbd></div>
              <div class="shortcut-row"><span>Triangle</span><kbd>G</kbd></div>
              <div class="shortcut-row"><span>5-Point Star</span><kbd>K</kbd></div>
              <div class="shortcut-row"><span>Decision Diamond</span><kbd>J</kbd></div>
              <div class="shortcut-row"><span>Straight Line</span><kbd>L</kbd></div>
              <div class="shortcut-row"><span>Arrow Connector</span><kbd>A</kbd></div>
              <div class="shortcut-row"><span>Text Label</span><kbd>T</kbd></div>
            </div>
          </div>

          <div class="shortcuts-section">
            <h4 class="shortcuts-section-title">Studio & Canvas Actions</h4>
            <div class="shortcuts-grid">
              <div class="shortcut-row"><span>Undo Action</span><kbd>Ctrl + Z</kbd></div>
              <div class="shortcut-row"><span>Redo Action</span><kbd>Ctrl + Y</kbd></div>
              <div class="shortcut-row"><span>Duplicate</span><kbd>Ctrl + D</kbd></div>
              <div class="shortcut-row"><span>Delete Selected</span><kbd>Del</kbd></div>
              <div class="shortcut-row"><span>Toggle Layers Panel</span><kbd>L</kbd></div>
              <div class="shortcut-row"><span>Command Palette</span><kbd>Ctrl + K</kbd></div>
              <div class="shortcut-row"><span>Edit Text Label</span><kbd>Enter</kbd></div>
              <div class="shortcut-row"><span>Pan Canvas</span><kbd>Space + Drag</kbd></div>
              <div class="shortcut-row"><span>Zoom In / Out</span><kbd>Ctrl + / -</kbd></div>
              <div class="shortcut-row"><span>Zoom Canvas</span><kbd>Ctrl + Wheel</kbd></div>
              <div class="shortcut-row"><span>Reset Zoom (100%)</span><kbd>Ctrl + 0</kbd></div>
              <div class="shortcut-row"><span>Fit to Window</span><kbd>Ctrl + 9</kbd></div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <span class="modal-hints"><span>Press <kbd>?</kbd> anytime to open</span></span>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="btn-close-shortcuts-footer">Close</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {
      window.removeEventListener('keydown', handleKeyDown);
      modal.classList.remove('visible');
      setTimeout(() => modal.remove(), 180);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    modal.querySelector('#btn-close-shortcuts')?.addEventListener('click', closeModal);
    modal.querySelector('#btn-close-shortcuts-footer')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
}
