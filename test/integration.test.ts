import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import {
  ProtocolAction,
  Mutation,
  SyncStatePayload,
  MutationBroadcast
} from '../src/types.ts';

const WS_URL = 'ws://localhost:4000/ws';

test('Multi-Client Real-Time WebSocket Integration & Undo/Redo', async () => {
  // 1. Connect Client 1
  const ws1 = new WebSocket(WS_URL);
  await new Promise<void>((resolve, reject) => {
    ws1.on('open', resolve);
    ws1.on('error', reject);
  });

  // 2. Connect Client 2
  const ws2 = new WebSocket(WS_URL);
  await new Promise<void>((resolve, reject) => {
    ws2.on('open', resolve);
    ws2.on('error', reject);
  });

  // Client 1 joins room
  ws1.send(
    JSON.stringify({
      action: ProtocolAction.JOIN_ROOM,
      payload: { roomId: 'test-integration-room', clientName: 'Alice', clientColor: '#38BDF8' }
    })
  );

  // Client 2 joins same room
  ws2.send(
    JSON.stringify({
      action: ProtocolAction.JOIN_ROOM,
      payload: { roomId: 'test-integration-room', clientName: 'Bob', clientColor: '#22C55E' }
    })
  );

  // Await SYNC_STATE on Client 2
  const syncPayload = await new Promise<SyncStatePayload>((resolve) => {
    ws2.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.action === ProtocolAction.SYNC_STATE) {
        resolve(msg.payload);
      }
    });
  });

  assert.equal(syncPayload.roomId, 'test-integration-room');
  assert.ok(syncPayload.clientId);

  // 3. Client 1 submits a CREATE mutation
  const createMutation: Mutation = {
    mutationId: 'test_mut_1',
    elementId: 'rect_collab_1',
    type: 'CREATE',
    baseVersion: 0,
    data: {
      type: 'rectangle',
      x: 120,
      y: 150,
      width: 200,
      height: 100,
      stroke: '#38BDF8'
    },
    authorId: 'Alice',
    clientTimestamp: Date.now(),
    lamportClock: 1
  };

  const broadcastPromise = new Promise<MutationBroadcast>((resolve) => {
    ws2.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.action === ProtocolAction.MUTATION_BROADCAST) {
        resolve(msg.payload);
      }
    });
  });

  ws1.send(
    JSON.stringify({
      action: ProtocolAction.MUTATION_SUBMIT,
      payload: createMutation
    })
  );

  // Client 2 should receive the broadcast
  const broadcast = await broadcastPromise;
  assert.equal(broadcast.elementId, 'rect_collab_1');
  assert.equal(broadcast.type, 'CREATE');
  assert.equal(broadcast.serverVersion, 1);
  assert.equal(broadcast.data.x, 120);

  // 4. Client 1 submits an Undo (DELETE)
  const undoPromise = new Promise<MutationBroadcast>((resolve) => {
    ws2.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.action === ProtocolAction.MUTATION_BROADCAST && msg.payload.type === 'DELETE') {
        resolve(msg.payload);
      }
    });
  });

  ws1.send(
    JSON.stringify({
      action: ProtocolAction.MUTATION_SUBMIT,
      payload: {
        mutationId: 'test_undo_1',
        elementId: 'rect_collab_1',
        type: 'DELETE',
        baseVersion: 1,
        data: {},
        authorId: 'Alice',
        clientTimestamp: Date.now(),
        lamportClock: 2
      }
    })
  );

  const undoBroadcast = await undoPromise;
  assert.equal(undoBroadcast.elementId, 'rect_collab_1');
  assert.equal(undoBroadcast.type, 'DELETE');

  // 5. Test Heartbeat Ping/Pong
  const pongPromise = new Promise<any>((resolve) => {
    ws1.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.action === ProtocolAction.HEARTBEAT_PONG) {
        resolve(msg.payload);
      }
    });
  });

  ws1.send(
    JSON.stringify({
      action: ProtocolAction.HEARTBEAT_PING,
      payload: { pingId: 'ping_test_123', clientTimestamp: Date.now() }
    })
  );

  const pong = await pongPromise;
  assert.equal(pong.pingId, 'ping_test_123');
  assert.ok(pong.serverTimestamp);

  ws1.close();
  ws2.close();
});
