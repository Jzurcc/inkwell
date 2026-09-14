import {
  ProtocolAction,
  ProtocolActionType,
  ProtocolMessage
} from '../types.ts';

export interface PacketLogEntry {
  id: string;
  timestamp: number;
  direction: 'TX' | 'RX';
  action: ProtocolActionType;
  payloadSummary: string;
  raw: unknown;
  simulatedDelayMs?: number;
}

export interface NetworkSimulationConfig {
  latencyMs: number;
  jitterMs: number;
  dropRate: number; // 0.0 to 1.0
  offline: boolean;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private pendingPings = new Map<string, number>();

  public currentLatencyMs = 0;
  public packetsSent = 0;
  public packetsReceived = 0;
  public packetLogs: PacketLogEntry[] = [];
  public maxLogEntries = 200;

  public simulation: NetworkSimulationConfig = {
    latencyMs: 0,
    jitterMs: 0,
    dropRate: 0,
    offline: false
  };

  // Event Listeners
  private listeners: {
    message: Array<(msg: ProtocolMessage) => void>;
    statusChange: Array<(status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting') => void>;
    latencyUpdate: Array<(latencyMs: number) => void>;
    packetLog: Array<(entry: PacketLogEntry) => void>;
  } = {
    message: [],
    statusChange: [],
    latencyUpdate: [],
    packetLog: []
  };

  constructor(url?: string) {
    if (url) {
      this.url = url;
    } else if (typeof window !== 'undefined' && window.location) {
      const loc = window.location;
      const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      // If dev server on 5173, proxy or connect to port 4000
      const host = loc.port === '5173' ? `${loc.hostname}:4000` : loc.host;
      this.url = `${protocol}//${host}/ws`;
    } else {
      this.url = 'ws://localhost:4000/ws';
    }
  }

  public connect(): void {
    if (this.simulation.offline) {
      this.emitStatus('disconnected');
      return;
    }

    this.emitStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.emitStatus('connected');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleIncomingRaw(event.data);
      };

      this.ws.onclose = () => {
        this.cleanupHeartbeat();
        this.emitStatus('disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[WS] Socket error:', err);
      };
    } catch (err) {
      console.error('[WS] Connection failed:', err);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.cleanupHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.emitStatus('disconnected');
  }

  /**
   * Send a protocol message through network simulation pipeline
   */
  public send<T>(action: ProtocolActionType, payload: T): void {
    if (this.simulation.offline) {
      // Offline drop
      return;
    }

    // Packet drop simulation
    if (this.simulation.dropRate > 0 && Math.random() < this.simulation.dropRate) {
      this.recordLog('TX', action, payload, 0, true);
      return;
    }

    const delay = this.calculateSimulatedDelay();

    if (delay > 0) {
      this.recordLog('TX', action, payload, delay);
      setTimeout(() => {
        this.rawSend(action, payload);
      }, delay);
    } else {
      this.recordLog('TX', action, payload, 0);
      this.rawSend(action, payload);
    }
  }

  private rawSend<T>(action: ProtocolActionType, payload: T): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const msg: ProtocolMessage<T> = {
      action,
      payload,
      timestamp: Date.now()
    };

    try {
      this.ws.send(JSON.stringify(msg));
      this.packetsSent++;
    } catch (err) {
      console.error('[WS] Send failed:', err);
    }
  }

  /**
   * Handle incoming raw message with simulation delay
   */
  private handleIncomingRaw(rawData: string): void {
    if (this.simulation.offline) return;

    if (this.simulation.dropRate > 0 && Math.random() < this.simulation.dropRate) {
      return;
    }

    try {
      const msg = JSON.parse(rawData) as ProtocolMessage;
      const delay = this.calculateSimulatedDelay();

      if (delay > 0) {
        this.recordLog('RX', msg.action, msg.payload, delay);
        setTimeout(() => {
          this.processMessage(msg);
        }, delay);
      } else {
        this.recordLog('RX', msg.action, msg.payload, 0);
        this.processMessage(msg);
      }
    } catch (err) {
      console.error('[WS] Parse incoming error:', err);
    }
  }

  private processMessage(msg: ProtocolMessage): void {
    this.packetsReceived++;

    // Heartbeat PONG calculation
    if (msg.action === ProtocolAction.HEARTBEAT_PONG) {
      const payload = msg.payload as { pingId: string; clientTimestamp: number; serverTimestamp: number };
      const startTime = this.pendingPings.get(payload.pingId);
      if (startTime) {
        this.currentLatencyMs = Date.now() - startTime;
        this.pendingPings.delete(payload.pingId);
        this.listeners.latencyUpdate.forEach((fn) => fn(this.currentLatencyMs));
      }
      return;
    }

    // Forward to app listeners
    this.listeners.message.forEach((fn) => fn(msg));
  }

  private calculateSimulatedDelay(): number {
    if (this.simulation.latencyMs <= 0 && this.simulation.jitterMs <= 0) {
      return 0;
    }
    const base = this.simulation.latencyMs;
    const jitter = (Math.random() * 2 - 1) * this.simulation.jitterMs;
    return Math.max(0, Math.round(base + jitter));
  }

  private startHeartbeat(): void {
    this.cleanupHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingId = `ping_${Math.random().toString(36).substring(2, 7)}`;
        const now = Date.now();
        this.pendingPings.set(pingId, now);

        // Keep pending pings bounded
        if (this.pendingPings.size > 20) {
          const oldestKey = this.pendingPings.keys().next().value;
          if (oldestKey) this.pendingPings.delete(oldestKey);
        }

        this.rawSend(ProtocolAction.HEARTBEAT_PING, {
          pingId,
          clientTimestamp: now
        });
      }
    }, 4000) as unknown as number;
  }

  private cleanupHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.pendingPings.clear();
  }

  private scheduleReconnect(): void {
    if (this.simulation.offline || this.reconnectTimer) return;

    this.reconnectAttempts++;
    const delay = Math.min(10000, 500 * Math.pow(1.6, this.reconnectAttempts));
    console.log(`[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private recordLog(
    direction: 'TX' | 'RX',
    action: ProtocolActionType,
    payload: unknown,
    delayMs = 0,
    dropped = false
  ): void {
    const summary = dropped
      ? `[DROPPED] ${action}`
      : typeof payload === 'object' && payload !== null
      ? Object.keys(payload).slice(0, 3).join(', ')
      : String(payload);

    const entry: PacketLogEntry = {
      id: `pkt_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      timestamp: Date.now(),
      direction,
      action,
      payloadSummary: summary,
      raw: payload,
      simulatedDelayMs: delayMs
    };

    this.packetLogs.unshift(entry);
    if (this.packetLogs.length > this.maxLogEntries) {
      this.packetLogs.pop();
    }

    this.listeners.packetLog.forEach((fn) => fn(entry));
  }

  // Listener subscriptions
  public onMessage(callback: (msg: ProtocolMessage) => void): () => void {
    this.listeners.message.push(callback);
    return () => {
      this.listeners.message = this.listeners.message.filter((fn) => fn !== callback);
    };
  }

  public onStatusChange(callback: (status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting') => void): () => void {
    this.listeners.statusChange.push(callback);
    return () => {
      this.listeners.statusChange = this.listeners.statusChange.filter((fn) => fn !== callback);
    };
  }

  public onLatencyUpdate(callback: (latencyMs: number) => void): () => void {
    this.listeners.latencyUpdate.push(callback);
    return () => {
      this.listeners.latencyUpdate = this.listeners.latencyUpdate.filter((fn) => fn !== callback);
    };
  }

  public onPacketLog(callback: (entry: PacketLogEntry) => void): () => void {
    this.listeners.packetLog.push(callback);
    return () => {
      this.listeners.packetLog = this.listeners.packetLog.filter((fn) => fn !== callback);
    };
  }

  private emitStatus(status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting'): void {
    this.listeners.statusChange.forEach((fn) => fn(status));
  }
}
