import {
  CanvasElement,
  Layer,
  Mutation,
  MutationAck,
  MutationBroadcast,
  MutationType,
  Presence,
  ProtocolAction,
  SyncStatePayload
} from '../types.ts';
import { WebSocketClient } from './WebSocketClient.ts';

export interface ConflictEvent {
  elementId: string;
  reason: string;
  winner: string;
  timestamp: number;
}

export interface AuthErrorEvent {
  roomId: string;
  requiresPassword: boolean;
  error: string;
  message: string;
}

export interface HistoryEntry {
  type: MutationType;
  elementId: string;
  before: Partial<CanvasElement> | null;
  after: Partial<CanvasElement> | null;
}

export class StateEngine {
  public clientId: string = `client_${Math.random().toString(36).substring(2, 8)}`;
  public clientName: string = 'Explorer';
  public clientColor: string = '#38BDF8';
  public roomId: string = 'canvas-room-1';

  // Monotonic & Distributed Clocks
  public roomVersion: number = 0;
  public lamportClock: number = 0;

  // Dual State Stores
  public authoritativeElements: Map<string, CanvasElement> = new Map();
  public speculativeElements: Map<string, CanvasElement> = new Map();

  // Optimistic pending queue (mutations awaiting server ACK)
  public pendingMutations: Mutation[] = [];

  // Selective Local Undo/Redo History Stacks
  public undoStack: HistoryEntry[] = [];
  public redoStack: HistoryEntry[] = [];

  // Ephemeral Presence
  public presences: Map<string, Presence> = new Map();

  // Multi-Layer Management
  public layers: Map<string, Layer> = new Map([
    ['layer-1', { id: 'layer-1', name: 'Layer 1 (Base)', visible: true, locked: false, opacity: 1, order: 0 }],
    ['layer-2', { id: 'layer-2', name: 'Layer 2 (Artwork)', visible: true, locked: false, opacity: 1, order: 1 }],
    ['layer-3', { id: 'layer-3', name: 'Layer 3 (Overlays)', visible: true, locked: false, opacity: 1, order: 2 }]
  ]);
  public activeLayerId: string = 'layer-2';

  // Metrics
  public conflictsResolvedCount: number = 0;

  // Client link
  public ws: WebSocketClient;

  // Throttled presence update timer
  private presenceThrottleTimer: number | null = null;
  private pendingPresence: Partial<Presence> | null = null;

  // Listeners
  private stateChangeListeners: Array<() => void> = [];
  private presenceChangeListeners: Array<() => void> = [];
  private conflictListeners: Array<(evt: ConflictEvent) => void> = [];
  private layersChangeListeners: Array<() => void> = [];
  private authErrorListeners: Array<(evt: AuthErrorEvent) => void> = [];

  constructor(wsClient?: WebSocketClient) {
    this.ws = wsClient || new WebSocketClient();
    this.initNetworkHandlers();
  }

  private initNetworkHandlers(): void {
    this.ws.onStatusChange((status) => {
      if (status === 'connected') {
        this.joinCurrentRoom();
      }
    });

    this.ws.onMessage((msg) => {
      switch (msg.action) {
        case ProtocolAction.SYNC_STATE: {
          this.handleSyncState(msg.payload as SyncStatePayload);
          break;
        }
        case ProtocolAction.MUTATION_ACK: {
          this.handleAck(msg.payload as MutationAck);
          break;
        }
        case ProtocolAction.MUTATION_BROADCAST: {
          this.handleBroadcast(msg.payload as MutationBroadcast);
          break;
        }
        case ProtocolAction.PRESENCE_BROADCAST: {
          this.handlePresenceBroadcast(msg.payload as Presence);
          break;
        }
        case ProtocolAction.CLIENT_JOINED: {
          const p = msg.payload as Presence;
          // Don't add ourselves to the peer list — we render self separately
          if (p.clientId !== this.clientId) {
            this.presences.set(p.clientId, p);
            this.notifyPresenceChange();
          }
          break;
        }
        case ProtocolAction.CLIENT_LEFT: {
          const payload = msg.payload as { clientId: string };
          this.presences.delete(payload.clientId);
          this.notifyPresenceChange();
          break;
        }
        case ProtocolAction.ROOM_CLEAR: {
          this.handleRoomClear();
          break;
        }
        case ProtocolAction.ROOM_AUTH_ERROR: {
          const payload = msg.payload as AuthErrorEvent;
          this.notifyAuthError(payload);
          break;
        }
      }
    });
  }

  public roomPassword?: string;

  public setRoom(newRoomId: string, password?: string): void {
    this.roomPassword = password;
    if (this.roomId === newRoomId) {
      this.joinCurrentRoom();
      return;
    }
    this.roomId = newRoomId;
    this.authoritativeElements.clear();
    this.speculativeElements.clear();
    this.pendingMutations = [];
    this.presences.clear();
    this.joinCurrentRoom();
  }

  public joinCurrentRoom(): void {
    this.ws?.send(ProtocolAction.JOIN_ROOM, {
      roomId: this.roomId,
      clientName: this.clientName,
      clientColor: this.clientColor,
      password: this.roomPassword
    });
  }

  /**
   * Submit an optimistic local mutation
   * Renders instantly to speculativeState with zero perceived latency!
   */
  public submitMutation(
    type: MutationType,
    elementId?: string,
    data: Partial<CanvasElement> = {},
    isUndoRedo: boolean = false
  ): Mutation {
    const id = elementId || `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.lamportClock++;

    const existingSpeculative = this.speculativeElements.get(id);
    const baseVersion = existingSpeculative ? existingSpeculative.version : 0;

    // Capture before/after for Undo/Redo tracking
    if (!isUndoRedo) {
      let before: Partial<CanvasElement> | null = null;
      let after: Partial<CanvasElement> | null = null;

      if (type === 'CREATE') {
        before = null;
        after = { ...data };
      } else if (type === 'UPDATE') {
        if (existingSpeculative) {
          before = {};
          for (const key of Object.keys(data) as Array<keyof CanvasElement>) {
            (before as any)[key] = existingSpeculative[key];
          }
          after = { ...data };
        }
      } else if (type === 'DELETE') {
        before = existingSpeculative ? { ...existingSpeculative } : null;
        after = null;
      }

      this.undoStack.push({ type, elementId: id, before, after });
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = []; // Reset redo stack on new action
    }

    const mutation: Mutation = {
      mutationId: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      elementId: id,
      type,
      baseVersion,
      data,
      authorId: this.clientId,
      clientTimestamp: Date.now(),
      lamportClock: this.lamportClock
    };

    // Apply immediately to local speculative state
    this.applyLocalOptimistic(mutation);

    // Add to pending unacknowledged queue
    this.pendingMutations.push(mutation);

    // Transmit over WebSocket pipeline
    this.ws?.send(ProtocolAction.MUTATION_SUBMIT, mutation);

    // Notify canvas renderer to draw frame immediately
    this.notifyStateChange();

    return mutation;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Undo the last local action
   */
  public undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;

    this.redoStack.push(entry);

    if (entry.type === 'CREATE') {
      // Inverse of CREATE is DELETE
      this.submitMutation('DELETE', entry.elementId, {}, true);
    } else if (entry.type === 'DELETE' && entry.before) {
      // Inverse of DELETE is CREATE with previous state
      this.submitMutation('CREATE', entry.elementId, entry.before, true);
    } else if (entry.type === 'UPDATE' && entry.before) {
      // Inverse of UPDATE is restoring prior properties
      this.submitMutation('UPDATE', entry.elementId, entry.before, true);
    }
  }

  /**
   * Redo the last undone action
   */
  public redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;

    this.undoStack.push(entry);

    if (entry.type === 'CREATE' && entry.after) {
      this.submitMutation('CREATE', entry.elementId, entry.after, true);
    } else if (entry.type === 'DELETE') {
      this.submitMutation('DELETE', entry.elementId, {}, true);
    } else if (entry.type === 'UPDATE' && entry.after) {
      this.submitMutation('UPDATE', entry.elementId, entry.after, true);
    }
  }

  private applyLocalOptimistic(mutation: Mutation): void {
    const elId = mutation.elementId;

    if (mutation.type === 'CREATE') {
      const newEl: CanvasElement = {
        id: elId,
        type: mutation.data.type || 'rectangle',
        x: mutation.data.x ?? 0,
        y: mutation.data.y ?? 0,
        width: mutation.data.width ?? 100,
        height: mutation.data.height ?? 100,
        stroke: mutation.data.stroke ?? '#38BDF8',
        strokeWidth: mutation.data.strokeWidth ?? 2,
        fill: mutation.data.fill ?? 'transparent',
        opacity: mutation.data.opacity ?? 1,
        points: mutation.data.points ?? [],
        text: mutation.data.text ?? '',
        layerId: mutation.data.layerId || this.activeLayerId,
        brushType: mutation.data.brushType,
        dash: mutation.data.dash || 'solid',
        ...mutation.data,
        authorId: this.clientId,
        version: 1, // optimistic version
        lamportClock: this.lamportClock,
        updatedAt: Date.now()
      };
      this.speculativeElements.set(elId, newEl);
      return;
    }

    if (mutation.type === 'UPDATE') {
      const existing = this.speculativeElements.get(elId);
      if (existing) {
        this.speculativeElements.set(elId, {
          ...existing,
          ...mutation.data,
          id: elId,
          version: existing.version + 1,
          updatedAt: Date.now()
        });
      }
      return;
    }

    if (mutation.type === 'DELETE') {
      this.speculativeElements.delete(elId);
    }
  }

  /**
   * Handle server ACK for our optimistic mutation
   */
  public handleAck(ack: MutationAck): void {
    const idx = this.pendingMutations.findIndex((m) => m.mutationId === ack.mutationId);
    if (idx !== -1) {
      this.pendingMutations.splice(idx, 1);
    }

    this.roomVersion = Math.max(this.roomVersion, ack.roomVersion);

    if (ack.success && ack.resolvedElement) {
      // Commit authoritative state
      this.authoritativeElements.set(ack.elementId, ack.resolvedElement);
      // Re-reconcile speculative state with remaining pending mutations
      this.recomputeSpeculativeState(ack.elementId);
    } else if (!ack.success) {
      // Optimistic mutation was rejected / superseded by server conflict resolution
      this.conflictsResolvedCount++;
      if (ack.resolvedElement) {
        this.authoritativeElements.set(ack.elementId, ack.resolvedElement);
      } else {
        this.authoritativeElements.delete(ack.elementId);
      }

      // Roll back speculative state to authoritative
      this.recomputeSpeculativeState(ack.elementId);

      this.notifyConflict({
        elementId: ack.elementId,
        reason: ack.reason || 'Mutation superseded by concurrent edit',
        winner: 'server',
        timestamp: Date.now()
      });
    }

    this.notifyStateChange();
  }

  /**
   * Handle incoming broadcast mutation from a remote peer
   */
  public handleBroadcast(broadcast: MutationBroadcast): void {
    this.roomVersion = Math.max(this.roomVersion, broadcast.roomVersion);
    this.lamportClock = Math.max(this.lamportClock, broadcast.lamportClock) + 1;

    const elId = broadcast.elementId;

    // Check if we have unacknowledged pending mutations on this element
    const hasLocalPending = this.pendingMutations.some((m) => m.elementId === elId);

    if (broadcast.type === 'CREATE') {
      const el = broadcast.data as CanvasElement;
      this.authoritativeElements.set(elId, el);
      if (!hasLocalPending) {
        this.speculativeElements.set(elId, { ...el });
      } else {
        this.recomputeSpeculativeState(elId);
      }
    } else if (broadcast.type === 'UPDATE') {
      const existingAuth = this.authoritativeElements.get(elId);
      if (existingAuth) {
        const updatedAuth: CanvasElement = {
          ...existingAuth,
          ...broadcast.data,
          version: broadcast.serverVersion,
          lamportClock: broadcast.lamportClock,
          updatedAt: broadcast.timestamp
        };
        this.authoritativeElements.set(elId, updatedAuth);
      }

      if (hasLocalPending) {
        // CONFLICT RECONCILIATION:
        // Peer modified an element that we also have pending mutations on!
        this.conflictsResolvedCount++;
        this.recomputeSpeculativeState(elId);

        this.notifyConflict({
          elementId: elId,
          reason: `Reconciled peer ${broadcast.authorId} edit with pending local queue`,
          winner: broadcast.authorId,
          timestamp: Date.now()
        });
      } else {
        // No local pending mutations: update speculative directly
        const existingSpec = this.speculativeElements.get(elId);
        if (existingSpec) {
          this.speculativeElements.set(elId, {
            ...existingSpec,
            ...broadcast.data,
            version: broadcast.serverVersion,
            lamportClock: broadcast.lamportClock,
            updatedAt: broadcast.timestamp
          });
        }
      }
    } else if (broadcast.type === 'DELETE') {
      this.authoritativeElements.delete(elId);
      this.speculativeElements.delete(elId);
    }

    this.notifyStateChange();
  }

  /**
   * Replay remaining unacknowledged local mutations on top of authoritative element state
   */
  private recomputeSpeculativeState(elementId: string): void {
    const auth = this.authoritativeElements.get(elementId);
    if (!auth) {
      this.speculativeElements.delete(elementId);
      return;
    }

    // Start with pristine authoritative state
    let spec: CanvasElement = { ...auth };

    // Replay pending mutations targeting this element
    for (const pending of this.pendingMutations) {
      if (pending.elementId === elementId) {
        if (pending.type === 'UPDATE') {
          spec = {
            ...spec,
            ...pending.data,
            version: spec.version + 1
          };
        } else if (pending.type === 'DELETE') {
          this.speculativeElements.delete(elementId);
          return;
        }
      }
    }

    this.speculativeElements.set(elementId, spec);
  }

  /**
   * Handle full sync snapshot from server (initial join or reconnection)
   */
  public handleSyncState(sync: SyncStatePayload): void {
    if (sync.clientId) {
      this.clientId = sync.clientId;
    }

    this.authoritativeElements.clear();
    this.speculativeElements.clear();

    for (const [id, el] of Object.entries(sync.elements)) {
      this.authoritativeElements.set(id, el);
      this.speculativeElements.set(id, { ...el });
    }

    this.presences.clear();
    for (const [id, pres] of Object.entries(sync.presences)) {
      if (id !== this.clientId) {
        this.presences.set(id, pres);
      }
    }

    this.roomVersion = sync.roomVersion;
    this.lamportClock = Math.max(this.lamportClock, sync.lamportClock);

    // Replay all pending unacknowledged mutations on top of new snapshot
    for (const pending of this.pendingMutations) {
      this.applyLocalOptimistic(pending);
    }

    this.notifyStateChange();
    this.notifyPresenceChange();
  }

  private handlePresenceBroadcast(presence: Presence): void {
    if (presence.clientId === this.clientId) return;
    this.presences.set(presence.clientId, presence);
    this.notifyPresenceChange();
  }

  private handleRoomClear(): void {
    this.authoritativeElements.clear();
    this.speculativeElements.clear();
    this.pendingMutations = [];
    this.notifyStateChange();
  }

  public clearRoom(): void {
    this.handleRoomClear();
    this.ws?.send(ProtocolAction.ROOM_CLEAR, {});
  }

  /**
   * Send throttled presence update to avoid WebSocket spam (30Hz max)
   */
  public updateLocalPresence(update: Partial<Presence>): void {
    this.pendingPresence = {
      ...(this.pendingPresence || {}),
      ...update,
      clientId: this.clientId,
      clientName: this.clientName,
      clientColor: this.clientColor
    };

    if (this.presenceThrottleTimer === null) {
      this.presenceThrottleTimer = setTimeout(() => {
        if (this.pendingPresence) {
          this.ws?.send(ProtocolAction.PRESENCE_UPDATE, this.pendingPresence);
          this.pendingPresence = null;
        }
        this.presenceThrottleTimer = null;
      }, 33) as unknown as number; // ~30 updates per second
    }
  }

  // Subscriptions
  public onStateChange(callback: () => void): () => void {
    this.stateChangeListeners.push(callback);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter((fn) => fn !== callback);
    };
  }

  public onPresenceChange(callback: () => void): () => void {
    this.presenceChangeListeners.push(callback);
    return () => {
      this.presenceChangeListeners = this.presenceChangeListeners.filter((fn) => fn !== callback);
    };
  }

  public onConflict(callback: (evt: ConflictEvent) => void): () => void {
    this.conflictListeners.push(callback);
    return () => {
      this.conflictListeners = this.conflictListeners.filter((fn) => fn !== callback);
    };
  }

  private notifyStateChange(): void {
    this.stateChangeListeners.forEach((fn) => fn());
  }

  private notifyPresenceChange(): void {
    this.presenceChangeListeners.forEach((fn) => fn());
  }

  public onLayersChange(callback: () => void): () => void {
    this.layersChangeListeners.push(callback);
    return () => {
      this.layersChangeListeners = this.layersChangeListeners.filter((fn) => fn !== callback);
    };
  }

  public notifyLayersChange(): void {
    this.layersChangeListeners.forEach((fn) => {
      try { fn(); } catch (e) { console.error('Error in layer change listener', e); }
    });
  }

  public onAuthError(callback: (evt: AuthErrorEvent) => void): () => void {
    this.authErrorListeners.push(callback);
    return () => {
      this.authErrorListeners = this.authErrorListeners.filter((fn) => fn !== callback);
    };
  }

  private notifyAuthError(evt: AuthErrorEvent): void {
    this.authErrorListeners.forEach((fn) => {
      try { fn(evt); } catch (e) { console.error('Error in auth error listener', e); }
    });
  }

  public getSortedLayers(): Layer[] {
    return Array.from(this.layers.values()).sort((a, b) => a.order - b.order);
  }

  public createLayer(name?: string): Layer {
    const id = `layer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const order = this.layers.size;
    const newLayer: Layer = {
      id,
      name: name || `Layer ${this.layers.size + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      order
    };
    this.layers.set(id, newLayer);
    this.activeLayerId = id;
    this.notifyLayersChange();
    return newLayer;
  }

  public deleteLayer(layerId: string): boolean {
    if (this.layers.size <= 1) {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert('Cannot delete the only remaining layer.');
      }
      return false;
    }
    const layerToDelete = this.layers.get(layerId);
    if (!layerToDelete) return false;

    this.layers.delete(layerId);

    // Reassign elements from deleted layer to first available layer
    const remaining = this.getSortedLayers();
    const fallbackId = remaining[0].id;
    for (const [elId, el] of this.speculativeElements.entries()) {
      if (el.layerId === layerId) {
        this.submitMutation('UPDATE', elId, { layerId: fallbackId });
      }
    }

    if (this.activeLayerId === layerId) {
      this.activeLayerId = fallbackId;
    }

    this.notifyLayersChange();
    this.notifyStateChange();
    return true;
  }

  public toggleLayerVisibility(layerId: string): void {
    const l = this.layers.get(layerId);
    if (l) {
      l.visible = !l.visible;
      this.notifyLayersChange();
      this.notifyStateChange();
    }
  }

  public toggleLayerLock(layerId: string): void {
    const l = this.layers.get(layerId);
    if (l) {
      l.locked = !l.locked;
      this.notifyLayersChange();
      this.notifyStateChange();
    }
  }

  public setLayerOpacity(layerId: string, opacity: number): void {
    const l = this.layers.get(layerId);
    if (l) {
      l.opacity = Math.max(0, Math.min(1, opacity));
      this.notifyLayersChange();
      this.notifyStateChange();
    }
  }

  public renameLayer(layerId: string, name: string): void {
    const l = this.layers.get(layerId);
    if (l && name.trim()) {
      l.name = name.trim();
      this.notifyLayersChange();
    }
  }

  public moveLayerUp(layerId: string): void {
    const sorted = this.getSortedLayers();
    const index = sorted.findIndex((l) => l.id === layerId);
    if (index < sorted.length - 1) {
      const current = sorted[index];
      const above = sorted[index + 1];
      const tmpOrder = current.order;
      current.order = above.order;
      above.order = tmpOrder;
      this.notifyLayersChange();
      this.notifyStateChange();
    }
  }

  public moveLayerDown(layerId: string): void {
    const sorted = this.getSortedLayers();
    const index = sorted.findIndex((l) => l.id === layerId);
    if (index > 0) {
      const current = sorted[index];
      const below = sorted[index - 1];
      const tmpOrder = current.order;
      current.order = below.order;
      below.order = tmpOrder;
      this.notifyLayersChange();
      this.notifyStateChange();
    }
  }

  public setActiveLayer(layerId: string): void {
    if (this.layers.has(layerId)) {
      this.activeLayerId = layerId;
      this.notifyLayersChange();
    }
  }

  private notifyConflict(evt: ConflictEvent): void {
    this.conflictListeners.forEach((fn) => fn(evt));
  }
}
