/**
 * Core Types & Protocols for Collaborative Canvas State Engine
 */

export type ElementType =
  | 'rectangle'
  | 'circle'
  | 'pen'
  | 'arrow'
  | 'sticky_note'
  | 'text'
  | 'triangle'
  | 'star'
  | 'diamond'
  | 'line'
  | 'lasso_brush';

export type CanvasTool =
  | ElementType
  | 'select'
  | 'eraser'
  | 'delete'
  | 'marquee'
  | 'circle_select'
  | 'lasso_select'
  | 'eyedropper'
  | 'paint_bucket'
  | 'lasso_brush'
  | 'hand'
  | 'zoom'
  | 'crop';

export type BrushType = 'pen' | 'marker' | 'calligraphy' | 'neon' | 'spray' | 'eraser';
export type DashStyle = 'solid' | 'dashed' | 'dotted';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0 to 1
  order: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CanvasElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  opacity: number;
  layerId?: string;      // ID of layer this element belongs to
  brushType?: BrushType; // Specific artistic brush style
  dash?: DashStyle;      // Solid, dashed, or dotted
  points?: Point[];      // For freehand pen
  text?: string;         // For sticky notes & text labels
  authorId: string;
  version: number;       // Per-element monotonic version clock
  lamportClock: number;  // Distributed Lamport timestamp
  updatedAt: number;     // Server millisecond epoch
}

export type MutationType = 'CREATE' | 'UPDATE' | 'DELETE';

export interface Mutation {
  mutationId: string;
  elementId: string;
  type: MutationType;
  baseVersion: number;       // Version the client expected before mutation
  data: Partial<CanvasElement>;
  authorId: string;
  clientTimestamp: number;
  lamportClock: number;
}

export interface MutationAck {
  mutationId: string;
  elementId: string;
  serverVersion: number;
  roomVersion: number;
  success: boolean;
  resolvedElement?: CanvasElement;
  reason?: string;
}

export interface MutationBroadcast {
  mutationId: string;
  elementId: string;
  type: MutationType;
  serverVersion: number;
  roomVersion: number;
  data: Partial<CanvasElement>;
  authorId: string;
  timestamp: number;
  lamportClock: number;
}

export interface Presence {
  clientId: string;
  clientName: string;
  clientColor: string;
  cursor: Point | null;
  selectedIds: string[];
  activeTool: string;
  lastPing: number;
  latencyMs: number;
}

export const ProtocolAction = {
  JOIN_ROOM: 'JOIN_ROOM',
  SYNC_STATE: 'SYNC_STATE',
  CLIENT_JOINED: 'CLIENT_JOINED',
  CLIENT_LEFT: 'CLIENT_LEFT',
  MUTATION_SUBMIT: 'MUTATION_SUBMIT',
  MUTATION_ACK: 'MUTATION_ACK',
  MUTATION_BROADCAST: 'MUTATION_BROADCAST',
  MUTATION_REJECT: 'MUTATION_REJECT',
  PRESENCE_UPDATE: 'PRESENCE_UPDATE',
  PRESENCE_BROADCAST: 'PRESENCE_BROADCAST',
  HEARTBEAT_PING: 'HEARTBEAT_PING',
  HEARTBEAT_PONG: 'HEARTBEAT_PONG',
  ROOM_CLEAR: 'ROOM_CLEAR',
  SIMULATE_RACE: 'SIMULATE_RACE',
  ROOM_AUTH_ERROR: 'ROOM_AUTH_ERROR'
} as const;

export type ProtocolActionType = typeof ProtocolAction[keyof typeof ProtocolAction];

export interface ProtocolMessage<T = unknown> {
  action: ProtocolActionType;
  payload: T;
  timestamp: number;
}

export interface SyncStatePayload {
  roomId: string;
  roomVersion: number;
  lamportClock: number;
  elements: Record<string, CanvasElement>;
  presences: Record<string, Presence>;
  clientId: string;
  serverTimestamp: number;
}
