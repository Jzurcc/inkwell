import { StateEngine } from '../engine/StateEngine.ts';
import { CanvasEngine } from '../canvas/CanvasEngine.ts';
import { ProtocolAction } from '../types.ts';

export class ChaosConsole {
  private container: HTMLElement;
  private engine: StateEngine;
  private canvasEngine: CanvasEngine;
  public isOpen: boolean = false;

  private filterDirection: 'ALL' | 'TX' | 'RX' = 'ALL';
  private updateTimer: number | null = null;

  constructor(container: HTMLElement, engine: StateEngine, canvasEngine: CanvasEngine) {
    this.container = container;
    this.engine = engine;
    this.canvasEngine = canvasEngine;

    this.render();
    this.subscribe();
    this.startMetricsTimer();
  }

  public toggle(): void {
    this.isOpen = !this.isOpen;
    this.container.classList.toggle('open', this.isOpen);
    this.render();
  }

  private startMetricsTimer(): void {
    this.updateTimer = setInterval(() => {
      if (this.isOpen) {
        this.updateDynamicMetrics();
      }
    }, 400) as unknown as number;
  }

  private subscribe(): void {
    this.engine.ws.onPacketLog(() => {
      if (this.isOpen) {
        this.renderPacketStream();
      }
    });

    this.engine.onConflict((evt) => {
      this.renderConflictNotification(evt);
    });
  }

  private render(): void {
    if (!this.isOpen) {
      this.container.innerHTML = '';
      return;
    }

    const sim = this.engine.ws.simulation;
    const latency = this.engine.ws.currentLatencyMs;
    const pendingCount = this.engine.pendingMutations.length;
    const conflictsCount = this.engine.conflictsResolvedCount;
    const roomVersion = this.engine.roomVersion;
    const lamportClock = this.engine.lamportClock;
    const fps = this.canvasEngine.metrics.fps;
    const frameTime = this.canvasEngine.metrics.frameTimeMs;

    this.container.innerHTML = `
      <div class="chaos-drawer double-bezel" role="region" aria-label="Distributed Systems Console">
        <div class="chaos-header">
          <div class="chaos-title-group">
            <h3>Admin Console</h3>
          </div>
          <button id="btn-close-chaos" class="icon-close-btn" aria-label="Close Console">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="chaos-body">
          <!-- Real-Time Telemetry Grid -->
          <div class="metrics-grid">
            <div class="metric-card">
              <span class="metric-label">FPS & Render Time</span>
              <span class="metric-value green" id="metric-fps">${fps} FPS <small class="text-muted">(${frameTime}ms)</small></span>
            </div>

            <div class="metric-card">
              <span class="metric-label">WebSocket RTT</span>
              <span class="metric-value blue" id="metric-rtt">${latency} ms</span>
            </div>

            <div class="metric-card">
              <span class="metric-label">Monotonic Version Clock</span>
              <span class="metric-value purple" id="metric-clock">v${roomVersion} <small class="text-muted">(L:${lamportClock})</small></span>
            </div>

            <div class="metric-card">
              <span class="metric-label">Optimistic In-Flight Queue</span>
              <span class="metric-value ${pendingCount > 0 ? 'amber' : 'green'}" id="metric-queue">${pendingCount} un-ACKed</span>
            </div>

            <div class="metric-card">
              <span class="metric-label">Conflicts Reconciled</span>
              <span class="metric-value ${conflictsCount > 0 ? 'rose' : 'green'}" id="metric-conflicts">${conflictsCount}</span>
            </div>
          </div>

          <!-- Network Chaos Controls -->
          <div class="chaos-section">
            <h4 class="section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="M2 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="M12 22v-4"/><path d="m19.07 19.07-2.83-2.83"/><path d="M22 12h-4"/><path d="m19.07 4.93-2.83 2.83"/></svg>
              Network Simulation & Fault Injection
            </h4>

            <div class="control-row">
              <div class="control-label">
                <span>Artificial Latency:</span>
                <span class="val-badge" id="val-latency">${sim.latencyMs} ms</span>
              </div>
              <input type="range" id="slider-latency" min="0" max="2000" step="50" value="${sim.latencyMs}">
            </div>

            <div class="control-row">
              <div class="control-label">
                <span>Jitter Variance:</span>
                <span class="val-badge" id="val-jitter">±${sim.jitterMs} ms</span>
              </div>
              <input type="range" id="slider-jitter" min="0" max="300" step="10" value="${sim.jitterMs}">
            </div>

            <div class="control-row">
              <div class="control-label">
                <span>Packet Loss:</span>
                <span class="val-badge" id="val-loss">${Math.round(sim.dropRate * 100)}%</span>
              </div>
              <input type="range" id="slider-loss" min="0" max="0.25" step="0.05" value="${sim.dropRate}">
            </div>

            <div class="chaos-actions-grid">
              <button id="btn-simulate-race" class="chaos-action-btn" title="Fire conflicting out-of-order mutations to test Lamport clock reconciliation">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 2-2 7h5l-6 13 2-9h-5l6-11z"/></svg>
                <span>Simulate Race</span>
              </button>

              <button id="btn-toggle-connection" class="chaos-action-btn ${sim.offline ? 'offline' : 'online'}" title="${sim.offline ? 'Reconnect to WebSocket server' : 'Simulate offline network disconnection'}">
                <span class="chaos-status-dot"></span>
                <span>${sim.offline ? 'Reconnect' : 'Drop Link'}</span>
              </button>
            </div>

            <button id="btn-clear-canvas" class="chaos-clear-btn" title="Clear all canvas elements in this room">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              <span>Clear Canvas Room</span>
            </button>
          </div>

          <!-- Real-Time Full-Duplex Packet Stream -->
          <div class="chaos-section packet-stream-section">
            <div class="packet-stream-header">
              <h4 class="section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                Full-Duplex Packet Stream
              </h4>
              <div class="stream-filters">
                <button class="filter-pill ${this.filterDirection === 'ALL' ? 'active' : ''}" data-filter="ALL">All</button>
                <button class="filter-pill ${this.filterDirection === 'TX' ? 'active' : ''}" data-filter="TX">TX (Out)</button>
                <button class="filter-pill ${this.filterDirection === 'RX' ? 'active' : ''}" data-filter="RX">RX (In)</button>
              </div>
            </div>

            <div class="packet-stream-logs" id="packet-logs-container">
              <!-- Logs dynamically filled -->
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
    this.renderPacketStream();
  }

  private attachEvents(): void {
    this.container.querySelector('#btn-close-chaos')?.addEventListener('click', () => this.toggle());

    // Latency Slider
    const latSlider = this.container.querySelector('#slider-latency') as HTMLInputElement;
    latSlider?.addEventListener('input', (e) => {
      const val = Number((e.target as HTMLInputElement).value);
      this.engine.ws.simulation.latencyMs = val;
      const badge = this.container.querySelector('#val-latency');
      if (badge) badge.textContent = `${val} ms`;
    });

    // Jitter Slider
    const jitterSlider = this.container.querySelector('#slider-jitter') as HTMLInputElement;
    jitterSlider?.addEventListener('input', (e) => {
      const val = Number((e.target as HTMLInputElement).value);
      this.engine.ws.simulation.jitterMs = val;
      const badge = this.container.querySelector('#val-jitter');
      if (badge) badge.textContent = `±${val} ms`;
    });

    // Packet Loss Slider
    const lossSlider = this.container.querySelector('#slider-loss') as HTMLInputElement;
    lossSlider?.addEventListener('input', (e) => {
      const val = Number((e.target as HTMLInputElement).value);
      this.engine.ws.simulation.dropRate = val;
      const badge = this.container.querySelector('#val-loss');
      if (badge) badge.textContent = `${Math.round(val * 100)}%`;
    });

    // Trigger Race Condition Button
    this.container.querySelector('#btn-simulate-race')?.addEventListener('click', () => {
      this.triggerSimulatedRace();
    });

    // Offline / Online toggle
    this.container.querySelector('#btn-toggle-connection')?.addEventListener('click', () => {
      this.engine.ws.simulation.offline = !this.engine.ws.simulation.offline;
      if (this.engine.ws.simulation.offline) {
        this.engine.ws.disconnect();
      } else {
        this.engine.ws.connect();
      }
      this.render();
    });

    // Clear Canvas
    this.container.querySelector('#btn-clear-canvas')?.addEventListener('click', () => {
      if (confirm('Clear all canvas elements in this room?')) {
        this.engine.clearRoom();
      }
    });

    // Packet filters
    this.container.querySelectorAll('.filter-pill').forEach((pill) => {
      pill.addEventListener('click', (e) => {
        const filter = (e.currentTarget as HTMLElement).dataset.filter as 'ALL' | 'TX' | 'RX';
        if (filter) {
          this.filterDirection = filter;
          this.container.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
          (e.currentTarget as HTMLElement).classList.add('active');
          this.renderPacketStream();
        }
      });
    });
  }

  private updateDynamicMetrics(): void {
    const fps = this.container.querySelector('#metric-fps');
    if (fps) {
      fps.innerHTML = `${this.canvasEngine.metrics.fps} FPS <small class="text-muted">(${this.canvasEngine.metrics.frameTimeMs}ms)</small>`;
    }

    const rtt = this.container.querySelector('#metric-rtt');
    if (rtt) {
      rtt.textContent = `${this.engine.ws.currentLatencyMs} ms`;
    }

    const clock = this.container.querySelector('#metric-clock');
    if (clock) {
      clock.innerHTML = `v${this.engine.roomVersion} <small class="text-muted">(L:${this.engine.lamportClock})</small>`;
    }

    const queue = this.container.querySelector('#metric-queue');
    if (queue) {
      const count = this.engine.pendingMutations.length;
      queue.className = `metric-value ${count > 0 ? 'amber' : 'green'}`;
      queue.textContent = `${count} un-ACKed`;
    }

    const conflicts = this.container.querySelector('#metric-conflicts');
    if (conflicts) {
      const count = this.engine.conflictsResolvedCount;
      conflicts.className = `metric-value ${count > 0 ? 'rose' : 'green'}`;
      conflicts.textContent = String(count);
    }
  }

  private renderPacketStream(): void {
    const logBox = this.container.querySelector('#packet-logs-container');
    if (!logBox) return;

    let logs = this.engine.ws.packetLogs;
    if (this.filterDirection !== 'ALL') {
      logs = logs.filter((l) => l.direction === this.filterDirection);
    }

    if (logs.length === 0) {
      logBox.innerHTML = `<div class="empty-stream">Awaiting WebSocket traffic...</div>`;
      return;
    }

    logBox.innerHTML = logs
      .slice(0, 50)
      .map((entry) => {
        const time = new Date(entry.timestamp).toISOString().substring(14, 23);
        const isTx = entry.direction === 'TX';
        const delayBadge = entry.simulatedDelayMs && entry.simulatedDelayMs > 0
          ? `<span class="delay-chip">+${entry.simulatedDelayMs}ms</span>`
          : '';

        return `
          <div class="packet-log-row ${isTx ? 'tx' : 'rx'}">
            <span class="log-time">${time}</span>
            <span class="direction-badge ${isTx ? 'dir-tx' : 'dir-rx'}">${entry.direction}</span>
            <span class="log-action">${entry.action}</span>
            ${delayBadge}
            <span class="log-summary" title="${escapeHtml(JSON.stringify(entry.raw, null, 2))}">${escapeHtml(entry.payloadSummary)}</span>
          </div>
        `;
      })
      .join('');
  }

  private triggerSimulatedRace(): void {
    // Pick an existing element or create one if none exist
    let targetEl = Array.from(this.engine.speculativeElements.values())[0];
    if (!targetEl) {
      const id = `rect_${Date.now()}`;
      this.engine.submitMutation('CREATE', id, {
        type: 'rectangle',
        x: 200,
        y: 200,
        width: 160,
        height: 120,
        stroke: '#818CF8'
      });
      targetEl = this.engine.speculativeElements.get(id)!;
    }

    // 1. Submit local optimistic update (e.g. move right by 100px)
    this.engine.submitMutation('UPDATE', targetEl.id, {
      x: targetEl.x + 80,
      fill: '#22C55E'
    });

    // 2. Transmit SIMULATE_RACE command to server to send concurrent conflicting update from a phantom peer
    this.engine.ws.send(ProtocolAction.SIMULATE_RACE, {
      elementId: targetEl.id
    });
  }

  private renderConflictNotification(evt: { elementId: string; reason: string; winner: string }): void {
    const banner = document.createElement('div');
    banner.className = 'conflict-toast double-bezel';
    banner.innerHTML = `
      <div class="toast-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div class="toast-content">
        <strong>Conflict Reconciled!</strong>
        <p>${escapeHtml(evt.reason)}</p>
      </div>
    `;

    document.body.appendChild(banner);
    setTimeout(() => {
      banner.classList.add('toast-fade-out');
      setTimeout(() => banner.remove(), 400);
    }, 3500);
  }

  public destroy(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
