import type { WebSocket } from 'ws';
import {
  CanvasElement,
  Mutation,
  MutationAck,
  MutationBroadcast,
  Presence,
  ProtocolAction,
  SyncStatePayload
} from '../src/types.ts';
import { createMessage } from './protocol.ts';

export interface RoomClient {
  ws: WebSocket;
  presence: Presence;
}

export interface MutationResult {
  ack: MutationAck;
  broadcast?: MutationBroadcast;
}

export class Room {
  public readonly id: string;
  public roomVersion: number = 0;
  public lamportClock: number = 0;
  public elements: Map<string, CanvasElement> = new Map();
  public clients: Map<string, RoomClient> = new Map();
  public mutationLog: Array<{
    mutationId: string;
    elementId: string;
    serverVersion: number;
    roomVersion: number;
    authorId: string;
    timestamp: number;
  }> = [];

  public password?: string;

  constructor(id: string, password?: string) {
    this.id = id;
    this.password = password;
  }

  public verifyPassword(candidate?: string): boolean {
    if (!this.password) return true;
    return this.password === candidate;
  }

  public toSerializable(): {
    id: string;
    roomVersion: number;
    lamportClock: number;
    password?: string;
    elements: Record<string, CanvasElement>;
  } {
    const elementsObj: Record<string, CanvasElement> = {};
    for (const [id, el] of this.elements.entries()) {
      elementsObj[id] = el;
    }
    return {
      id: this.id,
      roomVersion: this.roomVersion,
      lamportClock: this.lamportClock,
      password: this.password,
      elements: elementsObj
    };
  }

  public loadSerialized(data: {
    roomVersion?: number;
    lamportClock?: number;
    password?: string;
    elements?: Record<string, CanvasElement>;
  }): void {
    if (typeof data.roomVersion === 'number') this.roomVersion = data.roomVersion;
    if (typeof data.lamportClock === 'number') this.lamportClock = data.lamportClock;
    if (data.password) this.password = data.password;
    if (data.elements) {
      for (const [id, el] of Object.entries(data.elements)) {
        this.elements.set(id, el);
      }
    }
  }

  /**
   * Register a new client connection in the room
   */
  public addClient(clientId: string, ws: WebSocket, name: string, color: string): Presence {
    const presence: Presence = {
      clientId,
      clientName: name,
      clientColor: color,
      cursor: null,
      selectedIds: [],
      activeTool: 'select',
      lastPing: Date.now(),
      latencyMs: 0
    };

    this.clients.set(clientId, { ws, presence });

    // Notify other peers in room about new client
    this.broadcast(
      createMessage(ProtocolAction.CLIENT_JOINED, presence),
      clientId
    );

    return presence;
  }

  /**
   * Remove a client from room
   */
  public removeClient(clientId: string): void {
    if (this.clients.has(clientId)) {
      this.clients.delete(clientId);
      this.broadcast(
        createMessage(ProtocolAction.CLIENT_LEFT, { clientId })
      );
    }
  }

  /**
   * Create full state snapshot payload for initial sync or reconnection
   */
  public getSnapshot(clientId: string): SyncStatePayload {
    const elementsObj: Record<string, CanvasElement> = {};
    for (const [id, el] of this.elements.entries()) {
      elementsObj[id] = el;
    }

    const presencesObj: Record<string, Presence> = {};
    for (const [cId, client] of this.clients.entries()) {
      presencesObj[cId] = client.presence;
    }

    return {
      roomId: this.id,
      roomVersion: this.roomVersion,
      lamportClock: this.lamportClock,
      elements: elementsObj,
      presences: presencesObj,
      clientId,
      serverTimestamp: Date.now()
    };
  }

  /**
   * Process a client-submitted mutation with monotonic clocks & deterministic conflict resolution
   */
  public applyMutation(mutation: Mutation): MutationResult {
    // Increment server logical clock
    this.lamportClock = Math.max(this.lamportClock, mutation.lamportClock || 0) + 1;
    const now = Date.now();

    if (mutation.type === 'CREATE') {
      const elId = mutation.elementId;
      const initialVersion = 1;
      this.roomVersion += 1;

      const newElement: CanvasElement = {
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
        layerId: mutation.data.layerId || 'layer-1',
        brushType: mutation.data.brushType,
        dash: mutation.data.dash || 'solid',
        ...mutation.data,
        authorId: mutation.authorId,
        version: initialVersion,
        lamportClock: this.lamportClock,
        updatedAt: now
      };

      this.elements.set(elId, newElement);
      this.recordLog(mutation.mutationId, elId, initialVersion, mutation.authorId);

      const ack: MutationAck = {
        mutationId: mutation.mutationId,
        elementId: elId,
        serverVersion: initialVersion,
        roomVersion: this.roomVersion,
        success: true,
        resolvedElement: newElement
      };

      const broadcast: MutationBroadcast = {
        mutationId: mutation.mutationId,
        elementId: elId,
        type: 'CREATE',
        serverVersion: initialVersion,
        roomVersion: this.roomVersion,
        data: newElement,
        authorId: mutation.authorId,
        timestamp: now,
        lamportClock: this.lamportClock
      };

      return { ack, broadcast };
    }

    if (mutation.type === 'UPDATE') {
      const elId = mutation.elementId;
      const existing = this.elements.get(elId);

      if (!existing) {
        return {
          ack: {
            mutationId: mutation.mutationId,
            elementId: elId,
            serverVersion: 0,
            roomVersion: this.roomVersion,
            success: false,
            reason: `Element ${elId} does not exist.`
          }
        };
      }

      // Check for version conflict
      const isClean = mutation.baseVersion === existing.version;
      let shouldApply = isClean;

      if (!isClean) {
        // CONFLICT RESOLUTION:
        // When concurrent mutations happen (baseVersion < existing.version),
        // we use deterministic Lamport Clock with Client ID tie-breaker:
        const incomingClock = mutation.lamportClock;
        const currentClock = existing.lamportClock;

        if (incomingClock > currentClock) {
          shouldApply = true;
        } else if (incomingClock === currentClock) {
          if (mutation.clientTimestamp > existing.updatedAt) {
            shouldApply = true;
          } else if (mutation.clientTimestamp === existing.updatedAt) {
            // Deterministic lexical tie-breaker
            shouldApply = mutation.authorId > existing.authorId;
          } else {
            shouldApply = false;
          }
        } else {
          shouldApply = false;
        }
      }

      if (shouldApply) {
        this.roomVersion += 1;
        const nextVersion = existing.version + 1;

        // Apply incoming fields
        const updatedElement: CanvasElement = {
          ...existing,
          ...mutation.data,
          id: elId, // protect immutable ID
          version: nextVersion,
          lamportClock: this.lamportClock,
          updatedAt: now
        };

        this.elements.set(elId, updatedElement);
        this.recordLog(mutation.mutationId, elId, nextVersion, mutation.authorId);

        const ack: MutationAck = {
          mutationId: mutation.mutationId,
          elementId: elId,
          serverVersion: nextVersion,
          roomVersion: this.roomVersion,
          success: true,
          resolvedElement: updatedElement
        };

        const broadcast: MutationBroadcast = {
          mutationId: mutation.mutationId,
          elementId: elId,
          type: 'UPDATE',
          serverVersion: nextVersion,
          roomVersion: this.roomVersion,
          data: mutation.data,
          authorId: mutation.authorId,
          timestamp: now,
          lamportClock: this.lamportClock
        };

        return { ack, broadcast };
      } else {
        // Mutation rejected/superseded due to conflict
        return {
          ack: {
            mutationId: mutation.mutationId,
            elementId: elId,
            serverVersion: existing.version,
            roomVersion: this.roomVersion,
            success: false,
            resolvedElement: existing,
            reason: `Conflict: superseded by concurrent update (v${existing.version})`
          }
        };
      }
    }

    if (mutation.type === 'DELETE') {
      const elId = mutation.elementId;
      if (this.elements.has(elId)) {
        this.elements.delete(elId);
        this.roomVersion += 1;

        const ack: MutationAck = {
          mutationId: mutation.mutationId,
          elementId: elId,
          serverVersion: 0,
          roomVersion: this.roomVersion,
          success: true
        };

        const broadcast: MutationBroadcast = {
          mutationId: mutation.mutationId,
          elementId: elId,
          type: 'DELETE',
          serverVersion: 0,
          roomVersion: this.roomVersion,
          data: {},
          authorId: mutation.authorId,
          timestamp: now,
          lamportClock: this.lamportClock
        };

        return { ack, broadcast };
      } else {
        return {
          ack: {
            mutationId: mutation.mutationId,
            elementId: elId,
            serverVersion: 0,
            roomVersion: this.roomVersion,
            success: false,
            reason: 'Element not found to delete.'
          }
        };
      }
    }

    return {
      ack: {
        mutationId: mutation.mutationId,
        elementId: mutation.elementId,
        serverVersion: 0,
        roomVersion: this.roomVersion,
        success: false,
        reason: `Unsupported mutation type: ${mutation.type}`
      }
    };
  }

  /**
   * Update ephemeral client presence (cursor, selection, tool)
   */
  public updatePresence(clientId: string, update: Partial<Presence>): Presence | null {
    const client = this.clients.get(clientId);
    if (!client) return null;

    client.presence = {
      ...client.presence,
      ...update,
      clientId // immutable
    };

    return client.presence;
  }

  /**
   * Clear all canvas elements in room
   */
  public clear(authorId: string): void {
    this.elements.clear();
    this.roomVersion += 1;
    this.lamportClock += 1;

    this.broadcast(
      createMessage(ProtocolAction.ROOM_CLEAR, {
        authorId,
        roomVersion: this.roomVersion,
        timestamp: Date.now()
      })
    );
  }

  /**
   * Broadcast a message to all connected clients in the room, optionally excluding sender
   */
  public broadcast(messageStr: string, excludeClientId?: string): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (excludeClientId && clientId === excludeClientId) {
        continue;
      }
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(messageStr);
      }
    }
  }

  private recordLog(
    mutationId: string,
    elementId: string,
    serverVersion: number,
    authorId: string
  ): void {
    this.mutationLog.push({
      mutationId,
      elementId,
      serverVersion,
      roomVersion: this.roomVersion,
      authorId,
      timestamp: Date.now()
    });

    // Keep log bounded
    if (this.mutationLog.length > 500) {
      this.mutationLog.shift();
    }
  }
}
