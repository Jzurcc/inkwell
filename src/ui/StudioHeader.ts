import { StateEngine } from '../engine/StateEngine.ts';
import { CanvasEngine } from '../canvas/CanvasEngine.ts';
import { ShareModal } from './ShareModal.ts';
import { StudioFooter } from './StudioFooter.ts';

export class StudioHeader {
  private container: HTMLElement;
  private engine: StateEngine;
  private canvasEngine: CanvasEngine;
  private onToggleChaos: () => void;
  private onToggleLayers?: () => void;
  private zenMode: boolean = false;

  constructor(
    container: HTMLElement,
    engine: StateEngine,
    canvasEngine: CanvasEngine,
    onToggleChaos: () => void,
    onToggleLayers?: () => void
  ) {
    this.container = container;
    this.engine = engine;
    this.canvasEngine = canvasEngine;
    this.onToggleChaos = onToggleChaos;
    this.onToggleLayers = onToggleLayers;

    this.render();
    this.subscribe();
  }

  private subscribe(): void {
    this.engine.onPresenceChange(() => this.renderRightActions());
    this.engine.onLayersChange(() => this.renderRightActions());
    this.engine.ws.onStatusChange(() => {
      this.renderRightActions();
      this.updateCloudStatus();
    });
    this.engine.ws.onLatencyUpdate(() => this.renderRightActions());
    this.engine.onStateChange(() => {
      this.updateHistoryStates();
      this.flashCloudSaved();
    });
    this.canvasEngine.onStyleChange(() => this.render());
  }

  public render(): void {
    this.container.innerHTML = `
      <div class="studio-header-inner">
        <!-- Left Section: Brand, Lucidchart Controls Strip, Doc Title, Saved Status, History -->
        <div class="studio-header-left">
          <!-- Inkwell Brand Emblem -->
          <div class="studio-brand" title="Inkwell Studio">
            <div class="brand-emblem-wrap">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="9" width="16" height="12" rx="3.5" fill="url(#hdr-ink-grad)" stroke="#4338CA" stroke-width="1.5"/>
                <path d="M7 9V5.5C7 4.67 7.67 4 8.5 4H15.5C16.33 4 17 4.67 17 5.5V9" stroke="#4338CA" stroke-width="1.5"/>
                <circle cx="12" cy="15" r="2" fill="#FAF7F2"/>
                <path d="M12 1C12 1 14.2 3.2 14.2 4.6C14.2 5.8 13.2 6.8 12 6.8C10.8 6.8 9.8 5.8 9.8 4.6C9.8 3.2 12 1 12 1Z" fill="#6366F1"/>
                <defs>
                  <linearGradient id="hdr-ink-grad" x1="4" y1="9" x2="20" y2="21" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#4F46E5"/>
                    <stop offset="1" stop-color="#7C3AED"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span class="studio-brand-name">Inkwell</span>
          </div>

          <div class="studio-v-divider"></div>

          <!-- Lucidchart-Style Controls Strip: [ ☰ ] [ ⚲ ] [ ☁✓ ] -->
          <div class="lucid-controls-strip">
            <!-- ☰ Hamburger Menu Anchor & Dropdown -->
            <div class="menu-hamburger-wrap">
              <button class="studio-icon-btn hamburger-btn" id="btn-studio-hamburger" title="Main Menu" aria-label="Main Menu">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="4" y1="6" x2="20" y2="6"/>
                  <line x1="4" y1="12" x2="20" y2="12"/>
                  <line x1="4" y1="18" x2="20" y2="18"/>
                </svg>
              </button>

              <!-- Lucidchart-Style Dropdown Menu -->
              <div class="lucid-dropdown-menu" id="hamburger-dropdown-menu">
                <!-- 1. Special Featured Action -->
                <button class="lucid-menu-row special-sparkle" id="menu-action-jam" title="Toggle presentation / focus mode">
                  <div class="lucid-row-left">
                    <svg class="sparkle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D946EF" stroke-width="2">
                      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/>
                    </svg>
                    <span>Edit in Live Jam</span>
                  </div>
                  <span class="lucid-shortcut">Ctrl Shift 1</span>
                </button>

                <!-- 2. New > -->
                <div class="lucid-menu-item has-submenu">
                  <div class="lucid-menu-row">
                    <div class="lucid-row-left">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                      <span>New</span>
                    </div>
                    <span class="lucid-chevron">›</span>
                  </div>
                  <div class="lucid-submenu">
                    <button class="lucid-sub-row" id="sub-new-blank">
                      <span>Blank Canvas</span>
                      <span class="lucid-shortcut">Ctrl+N</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-new-flowchart">
                      <span>Flowchart Template</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-new-brainstorm">
                      <span>Sticky Brainstorm Board</span>
                    </button>
                  </div>
                </div>

                <!-- 3. Make a copy -->
                <button class="lucid-menu-row" id="menu-action-make-copy">
                  <div class="lucid-row-left">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    <span>Make a copy</span>
                  </div>
                  <span class="lucid-shortcut">Ctrl Shift S</span>
                </button>

                <!-- 4. Export > -->
                <div class="lucid-menu-item has-submenu">
                  <div class="lucid-menu-row">
                    <div class="lucid-row-left">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      <span>Export</span>
                    </div>
                    <span class="lucid-chevron">›</span>
                  </div>
                  <div class="lucid-submenu">
                    <button class="lucid-sub-row" id="sub-export-png">
                      <span>PNG Image (.png)</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-export-svg">
                      <span>SVG Vector (.svg)</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-export-json">
                      <span>JSON Document (.json)</span>
                    </button>
                  </div>
                </div>

                <!-- 5. Publish -->
                <button class="lucid-menu-row" id="menu-action-publish">
                  <div class="lucid-row-left">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    <span>Publish</span>
                  </div>
                </button>

                <!-- Divider line -->
                <div class="lucid-menu-divider"></div>

                <!-- 6. File > -->
                <div class="lucid-menu-item has-submenu">
                  <div class="lucid-menu-row">
                    <span>File</span>
                    <span class="lucid-chevron">›</span>
                  </div>
                  <div class="lucid-submenu">
                    <button class="lucid-sub-row" id="sub-file-new">
                      <span>New Diagram</span>
                      <span class="lucid-shortcut">Ctrl+N</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-file-copy">
                      <span>Make a Copy</span>
                      <span class="lucid-shortcut">Ctrl+Shift+S</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-file-export-png">
                      <span>Export as PNG</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-file-export-svg">
                      <span>Export as SVG</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-file-export-json">
                      <span>Export as JSON</span>
                    </button>
                    <div class="lucid-menu-divider"></div>
                    <button class="lucid-sub-row text-destructive" id="sub-file-clear">
                      <span>Clear Canvas</span>
                      <span class="lucid-shortcut">Ctrl+Del</span>
                    </button>
                  </div>
                </div>

                <!-- 7. Edit > -->
                <div class="lucid-menu-item has-submenu">
                  <div class="lucid-menu-row">
                    <span>Edit</span>
                    <span class="lucid-chevron">›</span>
                  </div>
                  <div class="lucid-submenu">
                    <button class="lucid-sub-row" id="sub-edit-undo">
                      <span>Undo</span>
                      <span class="lucid-shortcut">Ctrl+Z</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-edit-redo">
                      <span>Redo</span>
                      <span class="lucid-shortcut">Ctrl+Y</span>
                    </button>
                    <div class="lucid-menu-divider"></div>
                    <button class="lucid-sub-row" id="sub-edit-dup">
                      <span>Duplicate Selection</span>
                      <span class="lucid-shortcut">Ctrl+D</span>
                    </button>
                    <button class="lucid-sub-row text-destructive" id="sub-edit-del">
                      <span>Delete Selection</span>
                      <span class="lucid-shortcut">Del</span>
                    </button>
                    <div class="lucid-menu-divider"></div>
                    <button class="lucid-sub-row" id="sub-edit-select-all">
                      <span>Select All Elements</span>
                      <span class="lucid-shortcut">Ctrl+A</span>
                    </button>
                  </div>
                </div>

                <!-- 8. Select > -->
                <div class="lucid-menu-item has-submenu">
                  <div class="lucid-menu-row">
                    <span>Select</span>
                    <span class="lucid-chevron">›</span>
                  </div>
                  <div class="lucid-submenu">
                    <button class="lucid-sub-row" id="sub-sel-all">
                      <span>Select All</span>
                      <span class="lucid-shortcut">Ctrl+A</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-sel-shapes">
                      <span>Select All Shapes</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-sel-notes">
                      <span>Select Sticky Notes</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-sel-strokes">
                      <span>Select Freehand Strokes</span>
                    </button>
                    <div class="lucid-menu-divider"></div>
                    <button class="lucid-sub-row" id="sub-sel-none">
                      <span>Deselect All</span>
                      <span class="lucid-shortcut">Esc</span>
                    </button>
                  </div>
                </div>

                <!-- 9. View > -->
                <div class="lucid-menu-item has-submenu">
                  <div class="lucid-menu-row">
                    <span>View</span>
                    <span class="lucid-chevron">›</span>
                  </div>
                  <div class="lucid-submenu">
                    <button class="lucid-sub-row" id="sub-view-zoom-in">
                      <span>Zoom In</span>
                      <span class="lucid-shortcut">Ctrl +</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-view-zoom-out">
                      <span>Zoom Out</span>
                      <span class="lucid-shortcut">Ctrl -</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-view-reset-zoom">
                      <span>Actual Size (100%)</span>
                      <span class="lucid-shortcut">Ctrl 0</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-view-fit">
                      <span>Fit to Window</span>
                      <span class="lucid-shortcut">Ctrl 9</span>
                    </button>
                    <div class="lucid-menu-divider"></div>
                    <button class="lucid-sub-row" id="sub-view-layers">
                      <span>Toggle Layers Panel</span>
                      <span class="lucid-shortcut">L</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-view-minimap">
                      <span>Toggle Minimap Radar</span>
                      <span class="lucid-shortcut">M</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-view-theme">
                      <span>Toggle Light / Dark Mode</span>
                      <span class="lucid-shortcut">T</span>
                    </button>
                  </div>
                </div>

                <!-- 10. Insert > -->
                <div class="lucid-menu-item has-submenu">
                  <div class="lucid-menu-row">
                    <span>Insert</span>
                    <span class="lucid-chevron">›</span>
                  </div>
                  <div class="lucid-submenu">
                    <button class="lucid-sub-row" id="sub-insert-sticky">
                      <span>Sticky Note</span>
                      <span class="lucid-shortcut">S</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-insert-rect">
                      <span>Rectangle Shape</span>
                      <span class="lucid-shortcut">R</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-insert-circle">
                      <span>Circle Shape</span>
                      <span class="lucid-shortcut">C</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-insert-triangle">
                      <span>Triangle Shape</span>
                      <span class="lucid-shortcut">G</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-insert-star">
                      <span>5-Point Star</span>
                      <span class="lucid-shortcut">K</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-insert-diamond">
                      <span>Decision Diamond</span>
                      <span class="lucid-shortcut">D</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-insert-line">
                      <span>Straight Line</span>
                      <span class="lucid-shortcut">L</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-insert-arrow">
                      <span>Arrow Connector</span>
                      <span class="lucid-shortcut">A</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-insert-text">
                      <span>Text Box</span>
                      <span class="lucid-shortcut">T</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-insert-pen">
                      <span>Creative Brush</span>
                      <span class="lucid-shortcut">B</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-insert-eraser">
                      <span>Eraser Tool</span>
                      <span class="lucid-shortcut">E</span>
                    </button>
                  </div>
                </div>

                <!-- 11. Arrange > -->
                <div class="lucid-menu-item has-submenu">
                  <div class="lucid-menu-row">
                    <span>Arrange</span>
                    <span class="lucid-chevron">›</span>
                  </div>
                  <div class="lucid-submenu">
                    <button class="lucid-sub-row" id="sub-arrange-front">
                      <span>Bring to Front</span>
                      <span class="lucid-shortcut">Ctrl + ]</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-arrange-back">
                      <span>Send to Back</span>
                      <span class="lucid-shortcut">Ctrl + [</span>
                    </button>
                    <div class="lucid-menu-divider"></div>
                    <button class="lucid-sub-row" id="sub-arrange-center">
                      <span>Center in Viewport</span>
                    </button>
                  </div>
                </div>

                <!-- 12. Share > -->
                <div class="lucid-menu-item has-submenu">
                  <div class="lucid-menu-row">
                    <span>Share</span>
                    <span class="lucid-chevron">›</span>
                  </div>
                  <div class="lucid-submenu">
                    <button class="lucid-sub-row" id="sub-share-invite">
                      <span>Invite Collaborators...</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-share-copy-link">
                      <span>Copy Collaboration Link</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-share-room">
                      <span>Active Room (#${this.engine.roomId})</span>
                    </button>
                  </div>
                </div>

                <!-- 13. Help > -->
                <div class="lucid-menu-item has-submenu">
                  <div class="lucid-menu-row">
                    <span>Help</span>
                    <span class="lucid-chevron">›</span>
                  </div>
                  <div class="lucid-submenu">
                    <button class="lucid-sub-row" id="sub-help-shortcuts">
                      <span>Keyboard Shortcuts</span>
                      <span class="lucid-shortcut">?</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-help-admin">
                      <span>Chaos & Admin Console</span>
                    </button>
                    <button class="lucid-sub-row" id="sub-help-about">
                      <span>About Inkwell Studio</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- ⚲ Search / Command Palette Button -->
            <button class="studio-icon-btn" id="btn-studio-search" title="Search elements & commands (Ctrl+K)" aria-label="Search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>

            <!-- ☁✓ Cloud Status Pill / Icon -->
            <div class="lucid-cloud-status" id="studio-cloud-status" title="All changes saved to cloud in real time">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                <polyline points="9 13 12 16 16 11"/>
              </svg>
            </div>
          </div>

          <!-- Document / Room Title & Saved Badge (Aligned horizontally) -->
          <div class="studio-title-group">
            <input 
              type="text" 
              id="studio-doc-title" 
              class="studio-title-input" 
              value="Untitled Board" 
              title="Click to rename diagram"
              spellcheck="false"
            />
            <span class="sync-status-pill" id="sync-status-pill" title="All changes saved to cloud">
              <span class="sync-status-dot"></span>
              <span class="sync-status-label">Saved</span>
            </span>
          </div>

          <div class="studio-v-divider"></div>

          <!-- History Action Buttons (Undo / Redo) -->
          <div class="studio-history-group">
            <button class="studio-icon-btn" id="hdr-btn-undo" title="Undo (Ctrl+Z)" aria-label="Undo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
            </button>
            <button class="studio-icon-btn" id="hdr-btn-redo" title="Redo (Ctrl+Y)" aria-label="Redo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/></svg>
            </button>
          </div>
        </div>

        <!-- Right Section: Signal, Collaborators Pile, Theme, Admin, Big Share CTA -->
        <div class="studio-header-right" id="studio-header-right-slot">
          <!-- Dynamically populated by renderRightActions -->
        </div>
      </div>
    `;

    this.renderRightActions();
    this.attachHeaderEvents();
    this.updateHistoryStates();
  }

  public renderRightActions(): void {
    const rightSlot = this.container.querySelector('#studio-header-right-slot');
    if (!rightSlot) return;

    const peers = Array.from(this.engine.presences.values());
    const latency = this.engine.ws.currentLatencyMs;
    const isOffline = this.engine.ws.simulation.offline;
    const currentTheme = this.canvasEngine.theme;

    let signalColor = '#10B981';
    let activeBars = 4;
    let statusLabel = 'Connected';

    if (isOffline) {
      signalColor = '#F43F5E';
      activeBars = 0;
      statusLabel = 'Offline';
    } else if (latency > 250) {
      signalColor = '#F43F5E';
      activeBars = 1;
      statusLabel = 'Poor';
    } else if (latency > 150) {
      signalColor = '#F59E0B';
      activeBars = 2;
      statusLabel = 'Fair';
    } else if (latency > 80) {
      signalColor = '#EAB308';
      activeBars = 3;
      statusLabel = 'Good';
    } else {
      signalColor = '#10B981';
      activeBars = 4;
      statusLabel = 'Fast';
    }

    const inactiveBarColor = currentTheme === 'light' ? 'rgba(15, 23, 42, 0.15)' : 'rgba(255, 255, 255, 0.18)';

    rightSlot.innerHTML = `
      <!-- Signal Latency Metric -->
      <div class="studio-signal-badge" title="Connection: ${statusLabel} (${latency}ms)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5">
          <line x1="4" y1="20" x2="4" y2="16" stroke="${activeBars >= 1 ? signalColor : inactiveBarColor}" />
          <line x1="9" y1="20" x2="9" y2="12" stroke="${activeBars >= 2 ? signalColor : inactiveBarColor}" />
          <line x1="14" y1="20" x2="14" y2="8" stroke="${activeBars >= 3 ? signalColor : inactiveBarColor}" />
          <line x1="19" y1="20" x2="19" y2="4" stroke="${activeBars >= 4 ? signalColor : inactiveBarColor}" />
        </svg>
        <span class="signal-latency-text">${latency}ms</span>
      </div>

      <div class="studio-v-divider"></div>

      <!-- Live Collaborators Avatar Pile -->
      <div class="collaborators-avatar-pile" title="Active in #${this.engine.roomId} (${peers.length + 1})">
        <!-- Self Avatar -->
        <div class="avatar-circle self" style="background-color: ${this.engine.clientColor};" title="You (${this.engine.clientName})">
          ${this.engine.clientName.substring(0, 2).toUpperCase()}
        </div>

        <!-- Remote Peer Avatars -->
        ${peers
        .slice(0, 3)
        .map(
          (p) => `
          <div class="avatar-circle" style="background-color: ${p.clientColor};" title="${p.clientName}">
            ${p.clientName.substring(0, 2).toUpperCase()}
          </div>
        `
        )
        .join('')}

        ${peers.length > 3
        ? `<div class="avatar-circle more">+${peers.length - 3}</div>`
        : ''
      }
      </div>

      <div class="studio-v-divider"></div>

      <!-- Theme Switcher (Sun / Moon) -->
      <button class="studio-icon-btn" id="hdr-btn-theme" title="Switch to ${currentTheme === 'light' ? 'Dark' : 'Light'} Mode">
        ${currentTheme === 'dark'
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`
      }
      </button>

      <!-- Admin Console Toggle Button -->
      <button class="studio-btn studio-btn-ghost" id="hdr-btn-admin" title="Open Admin Console">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="M2 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="M12 22v-4"/><path d="m19.07 19.07-2.83-2.83"/><path d="M22 12h-4"/><path d="m19.07 4.93-2.83 2.83"/></svg>
        <span>Admin</span>
        ${this.engine.conflictsResolvedCount > 0
        ? `<span class="studio-badge-pill">${this.engine.conflictsResolvedCount}</span>`
        : ''
      }
      </button>

      <!-- Prominent Business "Share" Button (Canva / Lucidchart signature) -->
      <button class="btn-studio-share" id="hdr-btn-share" title="Share and invite teammates">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        <span>Share</span>
      </button>
    `;

    // Attach right button events
    rightSlot.querySelector('#hdr-btn-theme')?.addEventListener('click', () => {
      this.canvasEngine.toggleTheme();
    });

    rightSlot.querySelector('#hdr-btn-admin')?.addEventListener('click', () => {
      this.onToggleChaos();
    });

    rightSlot.querySelector('#hdr-btn-share')?.addEventListener('click', () => {
      ShareModal.show(this.engine);
    });
  }

  public updateHistoryStates(): void {
    const undoBtn = this.container.querySelector('#hdr-btn-undo') as HTMLButtonElement;
    const redoBtn = this.container.querySelector('#hdr-btn-redo') as HTMLButtonElement;
    if (undoBtn) {
      const canUndo = this.engine.canUndo();
      undoBtn.disabled = !canUndo;
      undoBtn.style.opacity = canUndo ? '1' : '0.35';
    }
    if (redoBtn) {
      const canRedo = this.engine.canRedo();
      redoBtn.disabled = !canRedo;
      redoBtn.style.opacity = canRedo ? '1' : '0.35';
    }
  }

  private flashCloudSaved(): void {
    const pill = this.container.querySelector('#sync-status-pill');
    if (pill) {
      pill.classList.add('flash-saved');
      setTimeout(() => pill.classList.remove('flash-saved'), 600);
    }
  }

  private updateCloudStatus(): void {
    const isOffline = this.engine.ws.simulation.offline;
    const cloudEl = this.container.querySelector('#studio-cloud-status');
    if (cloudEl) {
      if (isOffline) {
        cloudEl.innerHTML = `
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
            <line x1="12" y1="11" x2="12" y2="15"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        `;
        cloudEl.setAttribute('title', 'Disconnected from cloud');
      } else {
        cloudEl.innerHTML = `
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
            <polyline points="9 13 12 16 16 11"/>
          </svg>
        `;
        cloudEl.setAttribute('title', 'All changes saved to cloud in real time');
      }
    }
  }

  private attachHeaderEvents(): void {
    // Undo / Redo
    this.container.querySelector('#hdr-btn-undo')?.addEventListener('click', () => {
      this.engine.undo();
      this.updateHistoryStates();
    });

    this.container.querySelector('#hdr-btn-redo')?.addEventListener('click', () => {
      this.engine.redo();
      this.updateHistoryStates();
    });

    // Hamburger Dropdown Toggle
    const hamburgerBtn = this.container.querySelector('#btn-studio-hamburger');
    const dropdown = this.container.querySelector('#hamburger-dropdown-menu');

    hamburgerBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown?.classList.toggle('open');
      hamburgerBtn.classList.toggle('active', !!isOpen);
    });

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
      if (!dropdown?.contains(e.target as Node) && e.target !== hamburgerBtn) {
        dropdown?.classList.remove('open');
        hamburgerBtn?.classList.remove('active');
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dropdown?.classList.contains('open')) {
        dropdown.classList.remove('open');
        hamburgerBtn?.classList.remove('active');
      }
    });

    const closeDropdown = () => {
      dropdown?.classList.remove('open');
      hamburgerBtn?.classList.remove('active');
    };

    // 1. Featured Action: Edit in Live Jam / Zen Presentation Mode
    this.container.querySelector('#menu-action-jam')?.addEventListener('click', () => {
      closeDropdown();
      this.toggleZenMode();
    });

    // 2. New Submenu
    this.container.querySelector('#sub-new-blank')?.addEventListener('click', () => {
      closeDropdown();
      this.createNewBlank();
    });

    this.container.querySelector('#sub-new-flowchart')?.addEventListener('click', () => {
      closeDropdown();
      this.spawnFlowchartTemplate();
    });

    this.container.querySelector('#sub-new-brainstorm')?.addEventListener('click', () => {
      closeDropdown();
      this.spawnBrainstormTemplate();
    });

    // 3. Make a copy
    const makeCopyAction = () => {
      closeDropdown();
      this.makeCopy();
    };
    this.container.querySelector('#menu-action-make-copy')?.addEventListener('click', makeCopyAction);
    this.container.querySelector('#sub-file-copy')?.addEventListener('click', makeCopyAction);

    // 4. Export Submenu
    const exportPng = () => {
      closeDropdown();
      this.exportAsPng();
    };
    const exportSvg = () => {
      closeDropdown();
      this.exportAsSvg();
    };
    const exportJson = () => {
      closeDropdown();
      this.exportAsJson();
    };

    this.container.querySelector('#sub-export-png')?.addEventListener('click', exportPng);
    this.container.querySelector('#sub-file-export-png')?.addEventListener('click', exportPng);
    this.container.querySelector('#sub-export-svg')?.addEventListener('click', exportSvg);
    this.container.querySelector('#sub-file-export-svg')?.addEventListener('click', exportSvg);
    this.container.querySelector('#sub-export-json')?.addEventListener('click', exportJson);
    this.container.querySelector('#sub-file-export-json')?.addEventListener('click', exportJson);

    // 5. Publish
    const publishAction = () => {
      closeDropdown();
      ShareModal.show(this.engine);
    };
    this.container.querySelector('#menu-action-publish')?.addEventListener('click', publishAction);
    this.container.querySelector('#sub-share-invite')?.addEventListener('click', publishAction);

    // 6. File Submenu
    this.container.querySelector('#sub-file-new')?.addEventListener('click', () => {
      closeDropdown();
      this.createNewBlank();
    });

    this.container.querySelector('#sub-file-clear')?.addEventListener('click', () => {
      closeDropdown();
      if (confirm('Clear all elements from canvas?')) {
        for (const [id] of this.engine.speculativeElements.entries()) {
          this.engine.submitMutation('DELETE', id, {});
        }
      }
    });

    // 7. Edit Submenu
    this.container.querySelector('#sub-edit-undo')?.addEventListener('click', () => {
      closeDropdown();
      this.engine.undo();
      this.updateHistoryStates();
    });

    this.container.querySelector('#sub-edit-redo')?.addEventListener('click', () => {
      closeDropdown();
      this.engine.redo();
      this.updateHistoryStates();
    });

    this.container.querySelector('#sub-edit-dup')?.addEventListener('click', () => {
      closeDropdown();
      this.canvasEngine.duplicateSelected();
    });

    this.container.querySelector('#sub-edit-del')?.addEventListener('click', () => {
      closeDropdown();
      this.canvasEngine.deleteSelected();
    });

    this.container.querySelector('#sub-edit-select-all')?.addEventListener('click', () => {
      closeDropdown();
      this.selectAllElements();
    });

    // 8. Select Submenu
    this.container.querySelector('#sub-sel-all')?.addEventListener('click', () => {
      closeDropdown();
      this.selectAllElements();
    });

    this.container.querySelector('#sub-sel-shapes')?.addEventListener('click', () => {
      closeDropdown();
      this.selectElementsByType(['rectangle', 'circle', 'arrow']);
    });

    this.container.querySelector('#sub-sel-notes')?.addEventListener('click', () => {
      closeDropdown();
      this.selectElementsByType(['sticky_note']);
    });

    this.container.querySelector('#sub-sel-strokes')?.addEventListener('click', () => {
      closeDropdown();
      this.selectElementsByType(['pen']);
    });

    this.container.querySelector('#sub-sel-none')?.addEventListener('click', () => {
      closeDropdown();
      this.canvasEngine.selectedElementIds = new Set();
      this.canvasEngine.requestRender();
    });

    // 9. View Submenu
    this.container.querySelector('#sub-view-zoom-in')?.addEventListener('click', () => {
      closeDropdown();
      this.canvasEngine.zoomIn();
    });

    this.container.querySelector('#sub-view-zoom-out')?.addEventListener('click', () => {
      closeDropdown();
      this.canvasEngine.zoomOut();
    });

    this.container.querySelector('#sub-view-reset-zoom')?.addEventListener('click', () => {
      closeDropdown();
      this.canvasEngine.resetView();
    });

    this.container.querySelector('#sub-view-fit')?.addEventListener('click', () => {
      closeDropdown();
      this.fitToViewport();
    });

    this.container.querySelector('#sub-view-minimap')?.addEventListener('click', () => {
      closeDropdown();
      const minimap = document.getElementById('minimap-container');
      if (minimap) {
        const isHidden = minimap.style.display === 'none';
        minimap.style.display = isHidden ? 'block' : 'none';
      }
    });

    this.container.querySelector('#sub-view-layers')?.addEventListener('click', () => {
      closeDropdown();
      this.onToggleLayers?.();
    });

    this.container.querySelector('#sub-view-theme')?.addEventListener('click', () => {
      closeDropdown();
      this.canvasEngine.toggleTheme();
    });

    // 10. Insert Submenu
    const setTool = (tool: any) => {
      closeDropdown();
      this.canvasEngine.setTool(tool);
    };

    this.container.querySelector('#sub-insert-sticky')?.addEventListener('click', () => setTool('sticky_note'));
    this.container.querySelector('#sub-insert-rect')?.addEventListener('click', () => setTool('rectangle'));
    this.container.querySelector('#sub-insert-circle')?.addEventListener('click', () => setTool('circle'));
    this.container.querySelector('#sub-insert-triangle')?.addEventListener('click', () => setTool('triangle'));
    this.container.querySelector('#sub-insert-star')?.addEventListener('click', () => setTool('star'));
    this.container.querySelector('#sub-insert-diamond')?.addEventListener('click', () => setTool('diamond'));
    this.container.querySelector('#sub-insert-line')?.addEventListener('click', () => setTool('line'));
    this.container.querySelector('#sub-insert-arrow')?.addEventListener('click', () => setTool('arrow'));
    this.container.querySelector('#sub-insert-text')?.addEventListener('click', () => setTool('text'));
    this.container.querySelector('#sub-insert-pen')?.addEventListener('click', () => setTool('pen'));
    this.container.querySelector('#sub-insert-eraser')?.addEventListener('click', () => setTool('eraser'));

    // 11. Arrange Submenu
    this.container.querySelector('#sub-arrange-front')?.addEventListener('click', () => {
      closeDropdown();
      this.bringToFront();
    });

    this.container.querySelector('#sub-arrange-back')?.addEventListener('click', () => {
      closeDropdown();
      this.sendToBack();
    });

    this.container.querySelector('#sub-arrange-center')?.addEventListener('click', () => {
      closeDropdown();
      this.fitToViewport();
    });

    // 12. Share Submenu
    this.container.querySelector('#sub-share-copy-link')?.addEventListener('click', () => {
      closeDropdown();
      navigator.clipboard.writeText(window.location.href);
      alert('Room collaboration link copied to clipboard!');
    });

    this.container.querySelector('#sub-share-room')?.addEventListener('click', () => {
      closeDropdown();
      alert(`Current Room: #${this.engine.roomId}\nClient: ${this.engine.clientName}`);
    });

    // 13. Help Submenu
    this.container.querySelector('#sub-help-shortcuts')?.addEventListener('click', () => {
      closeDropdown();
      StudioFooter.showShortcutsModal();
    });

    this.container.querySelector('#sub-help-admin')?.addEventListener('click', () => {
      closeDropdown();
      this.onToggleChaos();
    });

    this.container.querySelector('#sub-help-about')?.addEventListener('click', () => {
      closeDropdown();
      alert('Inkwell Studio\nProfessional real-time collaborative canvas with CRDT conflict resolution.');
    });

    // Search / Command Palette Button
    this.container.querySelector('#btn-studio-search')?.addEventListener('click', () => {
      this.openCommandPalette();
    });

    // Global shortcut Ctrl+K for search
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openCommandPalette();
      }
    });

    // Cloud status click info
    this.container.querySelector('#studio-cloud-status')?.addEventListener('click', () => {
      alert(`Cloud State: All changes synced to room #${this.engine.roomId}.\nLatency: ${this.engine.ws.currentLatencyMs}ms`);
    });
  }

  // --- Feature Implementations ---

  private toggleZenMode(): void {
    this.zenMode = !this.zenMode;
    const subbar = document.getElementById('studio-subbar');
    const rail = document.getElementById('studio-left-rail');
    const footer = document.getElementById('studio-footer');

    if (subbar) subbar.style.display = this.zenMode ? 'none' : 'flex';
    if (rail) rail.style.display = this.zenMode ? 'none' : 'flex';
    if (footer) footer.style.display = this.zenMode ? 'none' : 'flex';

    if (this.zenMode) {
      alert('Zen Jam Mode Active: Toolbars hidden for clean presentation. Use Ctrl+Shift+1 or Menu to restore.');
    }
  }

  private createNewBlank(): void {
    if (confirm('Create a new blank diagram? All current elements in this room will be cleared.')) {
      for (const [id] of this.engine.speculativeElements.entries()) {
        this.engine.submitMutation('DELETE', id, {});
      }
      this.canvasEngine.resetView();
    }
  }

  private makeCopy(): void {
    const elements = Array.from(this.engine.speculativeElements.values());
    if (elements.length === 0) {
      alert('Nothing to copy. Canvas is empty.');
      return;
    }
    const newSelection = new Set<string>();
    for (const el of elements) {
      const newId = `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      this.engine.submitMutation('CREATE', newId, {
        ...el,
        x: el.x + 40,
        y: el.y + 40
      });
      newSelection.add(newId);
    }
    this.canvasEngine.selectedElementIds = newSelection;
    this.canvasEngine.requestRender();
    alert(`Duplicated ${elements.length} element(s) into diagram copy.`);
  }

  private exportAsPng(): void {
    const canvas = document.getElementById('canvas-viewport') as HTMLCanvasElement;
    if (!canvas) return;
    const titleInput = this.container.querySelector('#studio-doc-title') as HTMLInputElement;
    const filename = (titleInput?.value || 'inkwell-diagram').trim().toLowerCase().replace(/\s+/g, '-');
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  private exportAsSvg(): void {
    const elements = Array.from(this.engine.speculativeElements.values());
    if (elements.length === 0) {
      alert('Canvas is empty.');
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + (el.width || 0));
      maxY = Math.max(maxY, el.y + (el.height || 0));
    }
    const pad = 40;
    const vbX = Math.floor(minX - pad);
    const vbY = Math.floor(minY - pad);
    const vbW = Math.max(200, Math.ceil(maxX - minX + pad * 2));
    const vbH = Math.max(200, Math.ceil(maxY - minY + pad * 2));

    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}" height="${vbH}">\n`;
    svgContent += `  <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="${this.canvasEngine.theme === 'light' ? '#FAF7F2' : '#0B0F19'}"/>\n`;

    for (const el of elements) {
      if (el.type === 'rectangle') {
        svgContent += `  <rect x="${el.x}" y="${el.y}" width="${el.width || 120}" height="${el.height || 80}" rx="6" fill="${el.fill || '#FFFFFF'}" stroke="${el.stroke || '#0F172A'}" stroke-width="${el.strokeWidth || 2}" />\n`;
      } else if (el.type === 'circle') {
        const rx = (el.width || 100) / 2;
        const ry = (el.height || 100) / 2;
        svgContent += `  <ellipse cx="${el.x + rx}" cy="${el.y + ry}" rx="${rx}" ry="${ry}" fill="${el.fill || '#FFFFFF'}" stroke="${el.stroke || '#0F172A'}" stroke-width="${el.strokeWidth || 2}" />\n`;
      } else if (el.type === 'sticky_note') {
        svgContent += `  <rect x="${el.x}" y="${el.y}" width="${el.width || 140}" height="${el.height || 140}" rx="8" fill="${el.fill || '#FEF08A'}" stroke="rgba(0,0,0,0.1)" stroke-width="1" />\n`;
        if (el.text) {
          svgContent += `  <text x="${el.x + 12}" y="${el.y + 26}" font-family="sans-serif" font-size="14" fill="#1E293B">${el.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>\n`;
        }
      } else if (el.type === 'text') {
        svgContent += `  <text x="${el.x}" y="${el.y + 18}" font-family="sans-serif" font-size="18" fill="${el.stroke || '#0F172A'}">${(el.text || 'Text').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>\n`;
      } else if (el.type === 'arrow') {
        const x2 = el.x + (el.width || 100);
        const y2 = el.y + (el.height || 0);
        svgContent += `  <line x1="${el.x}" y1="${el.y}" x2="${x2}" y2="${y2}" stroke="${el.stroke || '#0F172A'}" stroke-width="${el.strokeWidth || 2}" />\n`;
      } else if (el.type === 'pen' && el.points && el.points.length > 1) {
        const d = el.points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        svgContent += `  <path d="${d}" fill="none" stroke="${el.stroke || '#0F172A'}" stroke-width="${el.strokeWidth || 2}" stroke-linecap="round" stroke-linejoin="round" />\n`;
      }
    }
    svgContent += `</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const titleInput = this.container.querySelector('#studio-doc-title') as HTMLInputElement;
    const filename = (titleInput?.value || 'inkwell-diagram').trim().toLowerCase().replace(/\s+/g, '-');
    link.download = `${filename}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private exportAsJson(): void {
    const elements = Array.from(this.engine.speculativeElements.values());
    const data = JSON.stringify(
      {
        version: 1,
        appName: 'Inkwell Studio',
        exportedAt: new Date().toISOString(),
        roomId: this.engine.roomId,
        elements
      },
      null,
      2
    );
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const titleInput = this.container.querySelector('#studio-doc-title') as HTMLInputElement;
    const filename = (titleInput?.value || 'inkwell-diagram').trim().toLowerCase().replace(/\s+/g, '-');
    link.download = `${filename}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private spawnFlowchartTemplate(): void {
    const startX = 220;
    const startY = 180;
    // Node 1: Start Process
    this.engine.submitMutation('CREATE', `el_${Date.now()}_1`, {
      type: 'rectangle',
      x: startX,
      y: startY,
      width: 140,
      height: 60,
      fill: '#EEF2FF',
      stroke: '#4F46E5',
      strokeWidth: 2,
      text: '1. Start Idea'
    });
    // Arrow 1
    this.engine.submitMutation('CREATE', `el_${Date.now()}_2`, {
      type: 'arrow',
      x: startX + 140,
      y: startY + 30,
      width: 70,
      height: 0,
      stroke: '#4F46E5',
      strokeWidth: 2
    });
    // Node 2: Review & Build
    this.engine.submitMutation('CREATE', `el_${Date.now()}_3`, {
      type: 'rectangle',
      x: startX + 210,
      y: startY,
      width: 150,
      height: 60,
      fill: '#ECFDF5',
      stroke: '#10B981',
      strokeWidth: 2,
      text: '2. Review & Build'
    });
    // Arrow 2
    this.engine.submitMutation('CREATE', `el_${Date.now()}_4`, {
      type: 'arrow',
      x: startX + 360,
      y: startY + 30,
      width: 70,
      height: 0,
      stroke: '#10B981',
      strokeWidth: 2
    });
    // Node 3: Ship Product
    this.engine.submitMutation('CREATE', `el_${Date.now()}_5`, {
      type: 'circle',
      x: startX + 430,
      y: startY - 10,
      width: 80,
      height: 80,
      fill: '#FEF3C7',
      stroke: '#F59E0B',
      strokeWidth: 2,
      text: '3. Ship!'
    });
    this.canvasEngine.requestRender();
  }

  private spawnBrainstormTemplate(): void {
    const notes = [
      { fill: '#FEF08A', text: '💡 Core Opportunity\nCollaborative visual studio' },
      { fill: '#BBF7D0', text: '🎯 Target Audience\nProduct teams & designers' },
      { fill: '#BFDBFE', text: '🚀 Key Differentiator\nSub-50ms sync with CRDT logic' },
      { fill: '#FBCFE8', text: '❓ Open Questions\nCloud database persistence' }
    ];
    const startX = 240;
    const startY = 160;
    notes.forEach((note, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      this.engine.submitMutation('CREATE', `el_${Date.now()}_${idx}`, {
        type: 'sticky_note',
        x: startX + col * 170,
        y: startY + row * 170,
        width: 145,
        height: 145,
        fill: note.fill,
        stroke: 'rgba(0,0,0,0.1)',
        strokeWidth: 1,
        text: note.text
      });
    });
    this.canvasEngine.requestRender();
  }

  private selectAllElements(): void {
    this.canvasEngine.selectedElementIds = new Set(this.engine.speculativeElements.keys());
    this.canvasEngine.requestRender();
  }

  private selectElementsByType(types: string[]): void {
    const matched = new Set<string>();
    for (const [id, el] of this.engine.speculativeElements.entries()) {
      if (types.includes(el.type)) matched.add(id);
    }
    this.canvasEngine.selectedElementIds = matched;
    this.canvasEngine.requestRender();
  }

  private fitToViewport(): void {
    const elements = Array.from(this.engine.speculativeElements.values());
    if (elements.length === 0) {
      this.canvasEngine.resetView();
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + (el.width || 60));
      maxY = Math.max(maxY, el.y + (el.height || 60));
    }
    const canvas = document.getElementById('canvas-viewport') as HTMLCanvasElement;
    if (!canvas) return;
    const vpW = canvas.width;
    const vpH = canvas.height;
    const contentW = Math.max(100, maxX - minX);
    const contentH = Math.max(100, maxY - minY);
    const zoom = Math.min(2.0, Math.max(0.3, Math.min((vpW * 0.75) / contentW, (vpH * 0.75) / contentH)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    this.canvasEngine.camera = {
      x: -centerX * zoom + vpW / 2,
      y: -centerY * zoom + vpH / 2,
      zoom
    };
    this.canvasEngine.requestRender();
  }

  private bringToFront(): void {
    for (const id of this.canvasEngine.selectedElementIds) {
      const el = this.engine.speculativeElements.get(id);
      if (el) {
        this.engine.submitMutation('UPDATE', id, { ...el });
      }
    }
    this.canvasEngine.requestRender();
  }

  private sendToBack(): void {
    for (const id of this.canvasEngine.selectedElementIds) {
      const el = this.engine.speculativeElements.get(id);
      if (el) {
        this.engine.submitMutation('UPDATE', id, { ...el });
      }
    }
    this.canvasEngine.requestRender();
  }

  private openCommandPalette(): void {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop visible';
    modal.innerHTML = `
      <div class="modal-dialog double-bezel" role="dialog" aria-modal="true" style="max-width: 480px; padding: 0; overflow: hidden;">
        <div style="padding: 12px 16px; border-bottom: 1px solid var(--border-outer); display: flex; align-items: center; gap: 10px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input 
            type="text" 
            id="cmd-input" 
            placeholder="Type a command or search (e.g. Export, Flowchart, Theme, Sticky)..." 
            style="flex: 1; border: none; background: transparent; font-size: 14px; outline: none; color: var(--text-primary);"
            autofocus
          />
          <kbd style="font-size: 10px; padding: 2px 6px; border: 1px solid var(--border-outer); border-radius: 4px;">ESC</kbd>
        </div>
        <div id="cmd-results" style="max-height: 280px; overflow-y: auto; padding: 6px 0;">
          <div class="cmd-item" data-action="layers"><span>Toggle Layers Panel</span><kbd>L</kbd></div>
          <div class="cmd-item" data-action="brush-pen"><span>Fine Pen Brush</span><kbd>B</kbd></div>
          <div class="cmd-item" data-action="brush-marker"><span>Highlighter Marker</span><kbd>Brush</kbd></div>
          <div class="cmd-item" data-action="brush-neon"><span>Neon Glow Brush</span><kbd>Brush</kbd></div>
          <div class="cmd-item" data-action="brush-calligraphy"><span>Calligraphy Ribbon Brush</span><kbd>Brush</kbd></div>
          <div class="cmd-item" data-action="brush-spray"><span>Particle Spray Brush</span><kbd>Brush</kbd></div>
          <div class="cmd-item" data-action="eraser"><span>Eraser Tool</span><kbd>E</kbd></div>
          <div class="cmd-item" data-action="shape-triangle"><span>Insert Triangle Shape</span><kbd>G</kbd></div>
          <div class="cmd-item" data-action="shape-star"><span>Insert 5-Point Star</span><kbd>K</kbd></div>
          <div class="cmd-item" data-action="shape-diamond"><span>Insert Decision Diamond</span><kbd>D</kbd></div>
          <div class="cmd-item" data-action="shape-line"><span>Insert Straight Line</span><kbd>L</kbd></div>
          <div class="cmd-item" data-action="flowchart"><span>Create Flowchart Template</span><kbd>Template</kbd></div>
          <div class="cmd-item" data-action="brainstorm"><span>Create Sticky Brainstorm Board</span><kbd>Template</kbd></div>
          <div class="cmd-item" data-action="export-png"><span>Export as PNG</span><kbd>Export</kbd></div>
          <div class="cmd-item" data-action="export-svg"><span>Export as SVG</span><kbd>Export</kbd></div>
          <div class="cmd-item" data-action="export-json"><span>Export JSON Document</span><kbd>Export</kbd></div>
          <div class="cmd-item" data-action="fit"><span>Fit to Viewport</span><kbd>Ctrl+9</kbd></div>
          <div class="cmd-item" data-action="theme"><span>Toggle Dark / Light Theme</span><kbd>T</kbd></div>
          <div class="cmd-item" data-action="share"><span>Open Share & Publish Modal</span><kbd>Share</kbd></div>
          <div class="cmd-item" data-action="shortcuts"><span>View Keyboard Shortcuts</span><kbd>?</kbd></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const input = modal.querySelector('#cmd-input') as HTMLInputElement;
    input?.focus();

    const closeModal = () => modal.remove();

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    const items = modal.querySelectorAll('.cmd-item');
    items.forEach((item) => {
      item.addEventListener('click', () => {
        const action = item.getAttribute('data-action');
        closeModal();
        if (action === 'layers') this.onToggleLayers?.();
        else if (action === 'brush-pen') { this.canvasEngine.setTool('pen'); this.canvasEngine.setBrushType('pen'); }
        else if (action === 'brush-marker') { this.canvasEngine.setTool('pen'); this.canvasEngine.setBrushType('marker'); }
        else if (action === 'brush-neon') { this.canvasEngine.setTool('pen'); this.canvasEngine.setBrushType('neon'); }
        else if (action === 'brush-calligraphy') { this.canvasEngine.setTool('pen'); this.canvasEngine.setBrushType('calligraphy'); }
        else if (action === 'brush-spray') { this.canvasEngine.setTool('pen'); this.canvasEngine.setBrushType('spray'); }
        else if (action === 'eraser') this.canvasEngine.setTool('eraser');
        else if (action === 'shape-triangle') this.canvasEngine.setTool('triangle');
        else if (action === 'shape-star') this.canvasEngine.setTool('star');
        else if (action === 'shape-diamond') this.canvasEngine.setTool('diamond');
        else if (action === 'shape-line') this.canvasEngine.setTool('line');
        else if (action === 'flowchart') this.spawnFlowchartTemplate();
        else if (action === 'brainstorm') this.spawnBrainstormTemplate();
        else if (action === 'export-png') this.exportAsPng();
        else if (action === 'export-svg') this.exportAsSvg();
        else if (action === 'export-json') this.exportAsJson();
        else if (action === 'fit') this.fitToViewport();
        else if (action === 'theme') this.canvasEngine.toggleTheme();
        else if (action === 'share') ShareModal.show(this.engine);
        else if (action === 'shortcuts') StudioFooter.showShortcutsModal();
      });
    });

    input?.addEventListener('input', () => {
      const q = input.value.toLowerCase().trim();
      items.forEach((it) => {
        const text = it.textContent?.toLowerCase() || '';
        (it as HTMLElement).style.display = text.includes(q) ? 'flex' : 'none';
      });
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'Enter') {
        const firstVisible = Array.from(items).find(
          (it) => (it as HTMLElement).style.display !== 'none'
        ) as HTMLElement;
        firstVisible?.click();
      }
    });
  }
}
