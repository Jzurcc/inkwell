export * from '../src/types.ts';
import type { ProtocolActionType, ProtocolMessage } from '../src/types.ts';

/**
 * Format standard WebSocket message
 */
export function createMessage<T>(action: ProtocolActionType, payload: T): string {
  const msg: ProtocolMessage<T> = {
    action,
    payload,
    timestamp: Date.now()
  };
  return JSON.stringify(msg);
}

/**
 * Parse standard WebSocket message
 */
export function parseMessage(data: string | Buffer): ProtocolMessage | null {
  try {
    const str = typeof data === 'string' ? data : data.toString('utf-8');
    return JSON.parse(str) as ProtocolMessage;
  } catch (err) {
    console.error('Failed to parse WebSocket message:', err);
    return null;
  }
}
