import test from 'node:test';
import assert from 'node:assert/strict';
import { StateEngine } from '../src/engine/StateEngine.ts';

test('Multi-Layer State Engine & Creative Elements', async (t) => {
  await t.test('initializes with 3 default ordered layers', () => {
    const engine = new StateEngine();
    const sorted = engine.getSortedLayers();

    assert.equal(sorted.length, 3);
    assert.equal(sorted[0].id, 'layer-1');
    assert.equal(sorted[0].name, 'Layer 1 (Base)');
    assert.equal(sorted[0].order, 0);
    assert.equal(sorted[0].visible, true);
    assert.equal(sorted[0].locked, false);

    assert.equal(sorted[1].id, 'layer-2');
    assert.equal(sorted[2].id, 'layer-3');
    assert.equal(engine.activeLayerId, 'layer-2');
  });

  await t.test('creates new layers sequentially with proper ordering', () => {
    const engine = new StateEngine();
    let notified = false;
    engine.onLayersChange(() => {
      notified = true;
    });

    const newLayer = engine.createLayer('Custom Overlay');
    assert.ok(newLayer.id);
    assert.equal(newLayer.name, 'Custom Overlay');
    assert.equal(engine.layers.size, 4);
    assert.equal(engine.activeLayerId, newLayer.id);
    assert.equal(notified, true);

    const sorted = engine.getSortedLayers();
    assert.equal(sorted[3].id, newLayer.id);
    assert.equal(sorted[3].order, 3);
  });

  await t.test('toggles visibility and lock states', () => {
    const engine = new StateEngine();

    engine.toggleLayerVisibility('layer-2');
    assert.equal(engine.layers.get('layer-2')?.visible, false);

    engine.toggleLayerVisibility('layer-2');
    assert.equal(engine.layers.get('layer-2')?.visible, true);

    engine.toggleLayerLock('layer-1');
    assert.equal(engine.layers.get('layer-1')?.locked, true);

    engine.toggleLayerLock('layer-1');
    assert.equal(engine.layers.get('layer-1')?.locked, false);
  });

  await t.test('adjusts layer opacity between 0 and 1', () => {
    const engine = new StateEngine();

    engine.setLayerOpacity('layer-1', 0.45);
    assert.equal(engine.layers.get('layer-1')?.opacity, 0.45);

    // Clamp check
    engine.setLayerOpacity('layer-1', 1.5);
    assert.equal(engine.layers.get('layer-1')?.opacity, 1.0);

    engine.setLayerOpacity('layer-1', -0.2);
    assert.equal(engine.layers.get('layer-1')?.opacity, 0.0);
  });

  await t.test('renames layers', () => {
    const engine = new StateEngine();
    engine.renameLayer('layer-2', 'Vector Illustrations');
    assert.equal(engine.layers.get('layer-2')?.name, 'Vector Illustrations');
  });

  await t.test('reorders layers up and down', () => {
    const engine = new StateEngine();
    const beforeSorted = engine.getSortedLayers();
    assert.equal(beforeSorted[0].id, 'layer-1');
    assert.equal(beforeSorted[1].id, 'layer-2');

    // Move layer-1 up (towards foreground, higher order)
    engine.moveLayerUp('layer-1');
    const afterUp = engine.getSortedLayers();
    assert.equal(afterUp[0].id, 'layer-2');
    assert.equal(afterUp[1].id, 'layer-1');

    // Move layer-1 down (towards background, lower order)
    engine.moveLayerDown('layer-1');
    const afterDown = engine.getSortedLayers();
    assert.equal(afterDown[0].id, 'layer-1');
    assert.equal(afterDown[1].id, 'layer-2');
  });

  await t.test('deletes layer and migrates its elements to base layer', () => {
    const engine = new StateEngine();

    // Create an element assigned to layer-3
    const mut = engine.submitMutation('CREATE', 'triangle_1', {
      type: 'triangle',
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      layerId: 'layer-3',
      stroke: '#4F46E5',
      dash: 'dashed'
    });

    assert.equal(engine.speculativeElements.get(mut.elementId)?.layerId, 'layer-3');

    // Delete layer-3
    const deleted = engine.deleteLayer('layer-3');
    assert.equal(deleted, true);
    assert.equal(engine.layers.has('layer-3'), false);
    assert.equal(engine.layers.size, 2);

    // Element should be reassigned to remaining base layer
    assert.equal(engine.speculativeElements.get(mut.elementId)?.layerId, 'layer-1');
  });

  await t.test('refuses to delete the last remaining layer', () => {
    const engine = new StateEngine();
    engine.deleteLayer('layer-3');
    engine.deleteLayer('layer-2');
    assert.equal(engine.layers.size, 1);

    const couldDeleteLast = engine.deleteLayer('layer-1');
    assert.equal(couldDeleteLast, false);
    assert.equal(engine.layers.size, 1);
  });

  await t.test('supports new creative shapes and brush types in mutations', () => {
    const engine = new StateEngine();

    const starMut = engine.submitMutation('CREATE', 'star_1', {
      type: 'star',
      x: 200,
      y: 200,
      width: 80,
      height: 80,
      fill: '#F59E0B',
      stroke: '#D97706',
      dash: 'dotted'
    });

    const diamondMut = engine.submitMutation('CREATE', 'diamond_1', {
      type: 'diamond',
      x: 350,
      y: 200,
      width: 120,
      height: 90,
      fill: '#38BDF8'
    });

    const lineMut = engine.submitMutation('CREATE', 'line_1', {
      type: 'line',
      x: 10,
      y: 10,
      width: 100,
      height: 0,
      stroke: '#10B981',
      brushType: 'neon'
    });

    const star = engine.speculativeElements.get(starMut.elementId);
    assert.equal(star?.type, 'star');
    assert.equal(star?.dash, 'dotted');

    const diamond = engine.speculativeElements.get(diamondMut.elementId);
    assert.equal(diamond?.type, 'diamond');

    const line = engine.speculativeElements.get(lineMut.elementId);
    assert.equal(line?.type, 'line');
    assert.equal(line?.brushType, 'neon');
  });

  await t.test('calculates accurate bounding box for pen strokes and normalizes on sync', () => {
    const engine = new StateEngine();

    // Create a pen stroke spanning from (50, 80) to (350, 420)
    const penMut = engine.submitMutation('CREATE', 'pen_stroke_1', {
      type: 'pen',
      stroke: '#EC4899',
      strokeWidth: 4,
      brushType: 'calligraphy',
      points: [
        { x: 50, y: 100 },
        { x: 120, y: 80 },
        { x: 250, y: 300 },
        { x: 350, y: 420 }
      ]
    });

    const created = engine.speculativeElements.get(penMut.elementId);
    assert.ok(created);
    assert.equal(created.x, 50, 'x should match minX of points');
    assert.equal(created.y, 80, 'y should match minY of points');
    assert.equal(created.width, 300, 'width should match maxX - minX');
    assert.equal(created.height, 340, 'height should match maxY - minY');

    // Test sync state normalization for legacy/default 100x100 elements
    engine.handleSyncState({
      roomVersion: 5,
      lamportClock: 10,
      elements: {
        legacy_pen: {
          id: 'legacy_pen',
          type: 'pen',
          x: 0,
          y: 0,
          width: 100, // legacy dummy width
          height: 100, // legacy dummy height
          stroke: '#38BDF8',
          strokeWidth: 2,
          fill: 'transparent',
          opacity: 1,
          authorId: 'peer_1',
          version: 1,
          lamportClock: 2,
          updatedAt: 12345,
          points: [
            { x: 150, y: 200 },
            { x: 400, y: 550 }
          ]
        }
      },
      presences: {}
    });

    const normalized = engine.speculativeElements.get('legacy_pen');
    assert.ok(normalized);
    assert.equal(normalized.x, 150);
    assert.equal(normalized.y, 200);
    assert.equal(normalized.width, 250);
    assert.equal(normalized.height, 350);
  });
});

