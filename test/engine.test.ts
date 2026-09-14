import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/Room.ts';
import type { Mutation } from '../src/types.ts';

test('Room State & Monotonic Clocks', async (t) => {
  const room = new Room('test-room-1');

  await t.test('initializes with zero version and empty elements', () => {
    assert.equal(room.roomVersion, 0);
    assert.equal(room.lamportClock, 0);
    assert.equal(room.elements.size, 0);
  });

  await t.test('applies CREATE mutation with initial version 1', () => {
    const createMutation: Mutation = {
      mutationId: 'mut_1',
      elementId: 'rect_1',
      type: 'CREATE',
      baseVersion: 0,
      data: {
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 200,
        height: 150,
        stroke: '#22C55E'
      },
      authorId: 'client_alice',
      clientTimestamp: 1000,
      lamportClock: 1
    };

    const result = room.applyMutation(createMutation);

    assert.equal(result.ack.success, true);
    assert.equal(result.ack.serverVersion, 1);
    assert.equal(room.roomVersion, 1);
    assert.equal(room.elements.size, 1);

    const el = room.elements.get('rect_1');
    assert.ok(el);
    assert.equal(el.x, 100);
    assert.equal(el.version, 1);
    assert.equal(el.stroke, '#22C55E');
  });

  await t.test('applies sequential UPDATE mutation', () => {
    const updateMutation: Mutation = {
      mutationId: 'mut_2',
      elementId: 'rect_1',
      type: 'UPDATE',
      baseVersion: 1, // matches current version
      data: {
        x: 250,
        y: 300
      },
      authorId: 'client_alice',
      clientTimestamp: 1100,
      lamportClock: 2
    };

    const result = room.applyMutation(updateMutation);

    assert.equal(result.ack.success, true);
    assert.equal(result.ack.serverVersion, 2);
    assert.equal(room.roomVersion, 2);

    const el = room.elements.get('rect_1');
    assert.ok(el);
    assert.equal(el.x, 250);
    assert.equal(el.y, 300);
    assert.equal(el.version, 2);
  });

  await t.test('resolves concurrent conflict deterministically via Lamport Clock', () => {
    // Current state of rect_1: version 2, lamportClock >= 2.
    // Client Bob tries to update rect_1 with baseVersion 2 (concurrent with Alice)
    const bobMutation: Mutation = {
      mutationId: 'mut_bob',
      elementId: 'rect_1',
      type: 'UPDATE',
      baseVersion: 2,
      data: { x: 500 },
      authorId: 'client_bob',
      clientTimestamp: 1200,
      lamportClock: 5 // higher Lamport clock
    };

    const resultBob = room.applyMutation(bobMutation);
    assert.equal(resultBob.ack.success, true);
    assert.equal(resultBob.ack.serverVersion, 3);

    // Client Charlie submits an outdated mutation with baseVersion 2 (lower Lamport clock)
    const charlieMutation: Mutation = {
      mutationId: 'mut_charlie',
      elementId: 'rect_1',
      type: 'UPDATE',
      baseVersion: 2, // outdated! Current is now 3
      data: { x: 999 },
      authorId: 'client_charlie',
      clientTimestamp: 1150,
      lamportClock: 2 // lower Lamport clock than Bob's
    };

    const resultCharlie = room.applyMutation(charlieMutation);
    // Charlie's mutation was superseded
    assert.equal(resultCharlie.ack.success, false);
    assert.match(resultCharlie.ack.reason || '', /superseded/i);

    // Ensure rect_1 retains Bob's winning position
    const el = room.elements.get('rect_1');
    assert.ok(el);
    assert.equal(el.x, 500);
    assert.equal(el.version, 3);
  });

  await t.test('deletes element cleanly', () => {
    const deleteMutation: Mutation = {
      mutationId: 'mut_del',
      elementId: 'rect_1',
      type: 'DELETE',
      baseVersion: 3,
      data: {},
      authorId: 'client_bob',
      clientTimestamp: 1300,
      lamportClock: 6
    };

    const result = room.applyMutation(deleteMutation);
    assert.equal(result.ack.success, true);
    assert.equal(room.elements.has('rect_1'), false);
  });
});

test('StateEngine Optimistic UI & Reconciliation', async (t) => {
  const { StateEngine } = await import('../src/engine/StateEngine.ts');
  const { WebSocketClient } = await import('../src/engine/WebSocketClient.ts');

  class MockWebSocketClient extends WebSocketClient {
    public sentMessages: Array<{ action: any; payload: any }> = [];
    override send<T>(action: any, payload: T): void {
      this.sentMessages.push({ action, payload });
    }
  }

  const mockWs = new MockWebSocketClient();
  const engine = new StateEngine(mockWs);

  await t.test('applies optimistic local creation instantly', () => {
    const mutation = engine.submitMutation('CREATE', 'el_optimistic_1', {
      type: 'circle',
      x: 150,
      y: 150,
      width: 80,
      height: 80,
      stroke: '#38BDF8'
    });

    // 1. Must be in speculative state immediately
    const spec = engine.speculativeElements.get('el_optimistic_1');
    assert.ok(spec, 'Speculative state should have optimistic element');
    assert.equal(spec.x, 150);
    assert.equal(spec.type, 'circle');

    // 2. Must not be in authoritative state yet
    assert.equal(engine.authoritativeElements.has('el_optimistic_1'), false);

    // 3. Must be in pending mutations queue
    assert.equal(engine.pendingMutations.length, 1);
    assert.equal(engine.pendingMutations[0].mutationId, mutation.mutationId);

    // 4. Must have sent to WebSocket
    assert.equal(mockWs.sentMessages.length, 1);
  });

  await t.test('reconciles on server ACK', () => {
    const pendingMut = engine.pendingMutations[0];

    engine.handleAck({
      mutationId: pendingMut.mutationId,
      elementId: pendingMut.elementId,
      serverVersion: 1,
      roomVersion: 1,
      success: true,
      resolvedElement: {
        id: 'el_optimistic_1',
        type: 'circle',
        x: 150,
        y: 150,
        width: 80,
        height: 80,
        stroke: '#38BDF8',
        strokeWidth: 2,
        fill: 'transparent',
        opacity: 1,
        authorId: engine.clientId,
        version: 1,
        lamportClock: 1,
        updatedAt: 2000
      }
    });

    // 1. Pending queue cleared
    assert.equal(engine.pendingMutations.length, 0);

    // 2. Authoritative state now holds the element
    const auth = engine.authoritativeElements.get('el_optimistic_1');
    assert.ok(auth);
    assert.equal(auth.version, 1);

    // 3. Speculative state intact
    const spec = engine.speculativeElements.get('el_optimistic_1');
    assert.ok(spec);
    assert.equal(spec.version, 1);
  });

  await t.test('detects concurrent conflict and rolls back / replays', () => {
    // 1. Submit local speculative update to move circle to x: 400
    engine.submitMutation('UPDATE', 'el_optimistic_1', { x: 400 });
    assert.equal(engine.speculativeElements.get('el_optimistic_1')?.x, 400);
    assert.equal(engine.pendingMutations.length, 1);

    // 2. Meanwhile, incoming remote broadcast from peer Alice arrives with serverVersion 2 and x: 300
    let conflictFired = false;
    engine.onConflict((evt) => {
      conflictFired = true;
      assert.equal(evt.elementId, 'el_optimistic_1');
    });

    engine.handleBroadcast({
      mutationId: 'peer_mut_9',
      elementId: 'el_optimistic_1',
      type: 'UPDATE',
      serverVersion: 2,
      roomVersion: 3,
      data: { x: 300, fill: '#EF4444' },
      authorId: 'client_alice',
      timestamp: Date.now(),
      lamportClock: 4
    });

    assert.equal(conflictFired, true, 'Conflict listener should be triggered');
    assert.equal(engine.conflictsResolvedCount, 1);

    // Authoritative state should reflect peer's x: 300
    assert.equal(engine.authoritativeElements.get('el_optimistic_1')?.x, 300);
    // Speculative state replayed local pending mutation on top, so local x: 400 remains active
    assert.equal(engine.speculativeElements.get('el_optimistic_1')?.x, 400);
  });

  await t.test('handles selective local undo and redo correctly', () => {
    // 1. Create a rectangle
    engine.submitMutation('CREATE', 'rect_undo_test', {
      type: 'rectangle',
      x: 50,
      y: 50,
      width: 100,
      height: 100
    });
    assert.equal(engine.speculativeElements.has('rect_undo_test'), true);
    assert.equal(engine.canUndo(), true);
    assert.equal(engine.canRedo(), false);

    // 2. Undo creation -> element should be deleted
    engine.undo();
    assert.equal(engine.speculativeElements.has('rect_undo_test'), false);
    assert.equal(engine.canRedo(), true);

    // 3. Redo creation -> element should be restored
    engine.redo();
    assert.equal(engine.speculativeElements.has('rect_undo_test'), true);
    assert.equal(engine.speculativeElements.get('rect_undo_test')?.x, 50);

    // 4. Update element position from 50 to 180
    engine.submitMutation('UPDATE', 'rect_undo_test', { x: 180 });
    assert.equal(engine.speculativeElements.get('rect_undo_test')?.x, 180);

    // 5. Undo update -> position should revert to 50
    engine.undo();
    assert.equal(engine.speculativeElements.get('rect_undo_test')?.x, 50);

    // 6. Redo update -> position should return to 180
    engine.redo();
    assert.equal(engine.speculativeElements.get('rect_undo_test')?.x, 180);
  });
});


