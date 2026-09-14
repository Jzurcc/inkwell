import { StateEngine } from '../engine/StateEngine.ts';

export class CloudStatusModal {
  private static instance: CloudStatusModal | null = null;
  private overlay: HTMLElement | null = null;
  private engine: StateEngine;

  constructor(engine: StateEngine) {
    this.engine = engine;
  }

  public static show(engine: StateEngine): void {
    if (!CloudStatusModal.instance) {
      CloudStatusModal.instance = new CloudStatusModal(engine);
    }
    CloudStatusModal.instance.open();
  }

  public open(): void {
    this.close();

    const isOffline = this.engine.ws.simulation.offline;
    const latency = this.engine.ws.currentLatencyMs;
    const roomId = this.engine.roomId;
    const version = this.engine.roomVersion;
    const lamportClock = this.engine.lamportClock;
    const totalElements = this.engine.speculativeElements.size;
    const totalLayers = this.engine.layers.size;
    const peers = Array.from(this.engine.presences.values()).filter(
      (p) => p.clientId !== this.engine.clientId
    );

    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop visible';
    overlay.innerHTML = `
      <div class="modal-dialog cloud-status-dialog" role="dialog" aria-modal="true" aria-labelledby="cloud-status-title">
        <!-- Header -->
        <div class="modal-header">
          <div class="modal-title-group">
            <div class="cloud-status-icon ${isOffline ? 'offline' : 'online'}">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                ${isOffline ? '<line x1="12" y1="11" x2="12" y2="15"/><line x1="12" y1="17" x2="12.01" y2="17"/>' : '<polyline points="9 13 12 16 16 11"/>'}
              </svg>
            </div>
            <div>
              <h3 id="cloud-status-title">Cloud State & Real-Time Sync</h3>
              <p class="share-subtitle">CRDT collaborative engine health for room #${roomId}</p>
            </div>
          </div>
          <button class="modal-close-btn" id="btn-cloud-modal-close" aria-label="Close dialog">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Body -->
        <div class="modal-body cloud-modal-body">
          <!-- Live Status Banner -->
          <div class="cloud-banner ${isOffline ? 'banner-offline' : 'banner-online'}">
            <div class="cloud-banner-indicator">
              <strong>${isOffline ? 'Simulated Offline Mode' : 'Connected & Fully Synchronized'}</strong>
            </div>
            <p class="cloud-banner-desc">
              ${isOffline
        ? 'Mutations are queued locally in speculative state. Reconnection will replay changes.'
        : 'All drawing strokes, layer updates, and mutations are speculatively rendered instantly and verified via monotonic clocks.'}
            </p>
          </div>

          <!-- 4-Stat Metric Grid -->
          <div class="cloud-metrics-grid">
            <!-- Metric 1: Latency -->
            <div class="cloud-metric-card">
              <div class="metric-card-label">Roundtrip Latency</div>
              <div class="metric-card-value-row">
                <span class="metric-card-val">${latency}</span>
                <span class="metric-card-unit">ms</span>
              </div>
              <div class="metric-card-badge ${latency <= 15 ? 'badge-ultra' : 'badge-normal'}">
                ${latency <= 15 ? 'Ultra-Low' : 'Real-Time'}
              </div>
            </div>

            <!-- Metric 2: Room ID -->
            <div class="cloud-metric-card">
              <div class="metric-card-label">Active Workspace</div>
              <div class="metric-card-value-row">
                <span class="metric-card-val room-name">#${roomId}</span>
              </div>
              <div class="metric-card-badge badge-room">
                Collaborative Room
              </div>
            </div>

            <!-- Metric 3: Monotonic Clock -->
            <div class="cloud-metric-card">
              <div class="metric-card-label">CRDT Clock Version</div>
              <div class="metric-card-value-row">
                <span class="metric-card-val">v${version}</span>
                <span class="metric-card-unit">L${lamportClock}</span>
              </div>
              <div class="metric-card-badge badge-crdt">
                Lamport Monotonic
              </div>
            </div>

            <!-- Metric 4: Canvas State -->
            <div class="cloud-metric-card">
              <div class="metric-card-label">Live Elements</div>
              <div class="metric-card-value-row">
                <span class="metric-card-val">${totalElements}</span>
                <span class="metric-card-unit">objs</span>
              </div>
              <div class="metric-card-badge badge-layers">
                ${totalLayers} Canvas Layer${totalLayers === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          <!-- Active Collaborators -->
          <div class="cloud-collaborators-section">
            <div class="cloud-section-header">
              <span>Active in Room (${peers.length + 1})</span>
              <span class="cloud-ping-badge">${latency}ms ping</span>
            </div>
            <div class="cloud-peers-list">
              <div class="cloud-peer-pill">
                <span class="peer-color-dot" style="background-color: ${this.engine.clientColor};"></span>
                <span class="peer-name">${this.engine.clientName} (You)</span>
              </div>
              ${peers
        .map(
          (p) => `
                <div class="cloud-peer-pill">
                  <span class="peer-color-dot" style="background-color: ${p.clientColor};"></span>
                  <span class="peer-name">${p.clientName}</span>
                </div>
              `
        )
        .join('')}
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="modal-footer cloud-modal-footer">
          <button class="btn btn-secondary" id="btn-copy-diagnostics">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
            <span id="btn-copy-diagnostics-text">Copy Diagnostic Data</span>
          </button>
          <button class="btn btn-primary-cta" id="btn-cloud-done">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlay = overlay;

    // Attach Events
    const closeBtn = overlay.querySelector('#btn-cloud-modal-close');
    const doneBtn = overlay.querySelector('#btn-cloud-done');
    const copyDiagBtn = overlay.querySelector('#btn-copy-diagnostics');
    const copyText = overlay.querySelector('#btn-copy-diagnostics-text');

    closeBtn?.addEventListener('click', () => this.close());
    doneBtn?.addEventListener('click', () => this.close());

    copyDiagBtn?.addEventListener('click', () => {
      const diagData = {
        app: 'Inkwell',
        room: roomId,
        clientId: this.engine.clientId,
        clientName: this.engine.clientName,
        latencyMs: latency,
        monotonicVersion: version,
        lamportClock: lamportClock,
        elementCount: totalElements,
        layerCount: totalLayers,
        peersCount: peers.length,
        timestamp: new Date().toISOString()
      };
      navigator.clipboard.writeText(JSON.stringify(diagData, null, 2));
      if (copyText) {
        copyText.textContent = 'Copied to Clipboard!';
        setTimeout(() => {
          if (copyText) copyText.textContent = 'Copy Diagnostic Data';
        }, 2000);
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.close();
      }
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  public close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}
