import { StateEngine } from '../engine/StateEngine.ts';
import { CanvasEngine } from '../canvas/CanvasEngine.ts';

export class PresenceBar {
  private container: HTMLElement;
  private engine: StateEngine;
  private onToggleChaos: () => void;
  private canvasEngine?: CanvasEngine;

  constructor(
    container: HTMLElement,
    engine: StateEngine,
    onToggleChaos: () => void,
    canvasEngine?: CanvasEngine
  ) {
    this.container = container;
    this.engine = engine;
    this.onToggleChaos = onToggleChaos;
    this.canvasEngine = canvasEngine;

    this.render();
    this.subscribe();
  }

  private subscribe(): void {
    this.engine.onPresenceChange(() => this.render());
    this.engine.ws.onStatusChange(() => this.render());
    this.engine.ws.onLatencyUpdate(() => this.render());
    if (this.canvasEngine) {
      this.canvasEngine.onStyleChange(() => this.render());
    }
  }

  private render(): void {
    const peers = Array.from(this.engine.presences.values()).filter(
      (p) => p.clientId !== this.engine.clientId
    );
    const latency = this.engine.ws.currentLatencyMs;
    const isOffline = this.engine.ws.simulation.offline;
    const currentTheme = this.canvasEngine?.theme || 'light';

    let signalColor = '#10B981'; // Fresh Green
    let activeBars = 4;
    let statusLabel = 'Connected';
    let statusDesc = 'Lightning fast';

    if (isOffline) {
      signalColor = '#F43F5E'; // Red
      activeBars = 0;
      statusLabel = 'Offline';
      statusDesc = 'Simulation paused';
    } else if (latency > 250) {
      signalColor = '#F43F5E'; // Red
      activeBars = 1;
      statusLabel = 'Poor';
      statusDesc = 'High latency';
    } else if (latency > 150) {
      signalColor = '#F59E0B'; // Amber
      activeBars = 2;
      statusLabel = 'Fair';
      statusDesc = 'Moderate delay';
    } else if (latency > 80) {
      signalColor = '#EAB308'; // Yellow
      activeBars = 3;
      statusLabel = 'Good';
      statusDesc = 'Stable connection';
    } else {
      signalColor = '#10B981'; // Emerald
      activeBars = 4;
      statusLabel = 'Connected';
      statusDesc = 'All systems synced';
    }

    const inactiveBarColor = currentTheme === 'light' ? 'rgba(15, 23, 42, 0.15)' : 'rgba(255, 255, 255, 0.18)';

    this.container.innerHTML = `
      <div class="presence-bar-island double-bezel">
        <!-- Inkwell Brand Emblem & Name -->
        <div class="brand-group" title="Inkwell — Creative Real-Time Canvas">
          <div class="brand-emblem">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="9" width="16" height="12" rx="3.5" fill="url(#ink-grad)" stroke="#4338CA" stroke-width="1.5"/>
              <path d="M7 9V5.5C7 4.67 7.67 4 8.5 4H15.5C16.33 4 17 4.67 17 5.5V9" stroke="#4338CA" stroke-width="1.5"/>
              <circle cx="12" cy="15" r="2" fill="#FAF7F2"/>
              <path d="M12 1C12 1 14.2 3.2 14.2 4.6C14.2 5.8 13.2 6.8 12 6.8C10.8 6.8 9.8 5.8 9.8 4.6C9.8 3.2 12 1 12 1Z" fill="#6366F1"/>
              <defs>
                <linearGradient id="ink-grad" x1="4" y1="9" x2="20" y2="21" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#4F46E5"/>
                  <stop offset="1" stop-color="#7C3AED"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span class="brand-title">Inkwell</span>
          <span class="brand-pill">Live</span>
        </div>

        <div class="presence-divider"></div>

        <!-- Room Selector Pill -->
        <div class="room-selector">
          <span class="room-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </span>
          <select id="room-select" class="room-dropdown" title="Select Collaboration Room">
            <option value="room-alpha" ${this.engine.roomId === 'room-alpha' ? 'selected' : ''}>#room-alpha</option>
            <option value="room-collab" ${this.engine.roomId === 'room-collab' ? 'selected' : ''}>#room-collab</option>
            <option value="room-engineering" ${this.engine.roomId === 'room-engineering' ? 'selected' : ''}>#room-engineering</option>
          </select>
          <button id="btn-copy-link" class="icon-action-btn" title="Copy Invite Link" aria-label="Copy Invite Link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
        </div>

        <div class="presence-divider"></div>

        <!-- Lucide Signal Bar Icon & Ping Status -->
        <div class="connection-status" title="Connection: ${statusLabel} (${latency}ms) — ${statusDesc}">
          <span class="signal-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5">
              <line x1="4" y1="20" x2="4" y2="16" stroke="${activeBars >= 1 ? signalColor : inactiveBarColor}" />
              <line x1="9" y1="20" x2="9" y2="12" stroke="${activeBars >= 2 ? signalColor : inactiveBarColor}" />
              <line x1="14" y1="20" x2="14" y2="8" stroke="${activeBars >= 3 ? signalColor : inactiveBarColor}" />
              <line x1="19" y1="20" x2="19" y2="4" stroke="${activeBars >= 4 ? signalColor : inactiveBarColor}" />
            </svg>
          </span>
          <span class="status-text" style="color: ${signalColor};">${statusLabel}</span>
          <span class="ping-badge">${latency}ms</span>
        </div>

        <div class="presence-divider"></div>

        <!-- Participants Avatars -->
        <div class="participants-list" title="Active Room Participants (${peers.length + 1})">
          <!-- Self Avatar -->
          <div class="avatar-pill self" style="--client-color: ${this.engine.clientColor};" title="You (${this.engine.clientName})">
            <span class="avatar-circle">${this.engine.clientName.substring(0, 2).toUpperCase()}</span>
            <span class="avatar-label">You</span>
          </div>

          <!-- Peer Avatars -->
          ${peers
            .slice(0, 4)
            .map(
              (p) => `
            <div class="avatar-pill" style="--client-color: ${p.clientColor};" title="${p.clientName} (${p.clientId})">
              <span class="avatar-circle">${p.clientName.substring(0, 2).toUpperCase()}</span>
              <span class="avatar-label">${p.clientName}</span>
            </div>
          `
            )
            .join('')}

          ${
            peers.length > 4
              ? `<div class="avatar-more">+${peers.length - 4}</div>`
              : ''
          }
        </div>

        <div class="presence-divider"></div>

        <!-- Light / Dark Mode Toggle Button -->
        <button id="btn-theme-toggle" class="icon-action-btn theme-toggle-btn" title="Switch to ${currentTheme === 'light' ? 'Dark' : 'Light'} Mode" aria-label="Toggle Theme">
          ${
            currentTheme === 'dark'
              ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`
              : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`
          }
        </button>

        <div class="presence-divider"></div>

        <!-- Admin Console Toggle Button -->
        <button id="btn-toggle-chaos" class="chaos-toggle-btn" title="Open Admin Console">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="M2 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="M12 22v-4"/><path d="m19.07 19.07-2.83-2.83"/><path d="M22 12h-4"/><path d="m19.07 4.93-2.83 2.83"/></svg>
          <span class="chaos-btn-text">Admin Console</span>
          ${
            this.engine.conflictsResolvedCount > 0
              ? `<span class="chaos-badge">${this.engine.conflictsResolvedCount}</span>`
              : ''
          }
        </button>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    const roomSelect = this.container.querySelector('#room-select') as HTMLSelectElement;
    roomSelect?.addEventListener('change', (e) => {
      const target = (e.target as HTMLSelectElement).value;
      if (target) {
        window.location.hash = target;
        this.engine.setRoom(target);
      }
    });

    const copyBtn = this.container.querySelector('#btn-copy-link');
    copyBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const original = copyBtn.innerHTML;
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          copyBtn.innerHTML = original;
        }, 1500);
      } catch (err) {
        console.warn('Clipboard copy failed:', err);
      }
    });

    const themeToggleBtn = this.container.querySelector('#btn-theme-toggle');
    themeToggleBtn?.addEventListener('click', () => {
      if (this.canvasEngine) {
        this.canvasEngine.toggleTheme();
      }
    });

    this.container.querySelector('#btn-toggle-chaos')?.addEventListener('click', () => {
      this.onToggleChaos();
    });
  }
}
