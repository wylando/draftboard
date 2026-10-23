import { describe, expect, it } from 'vitest';
import { createConnector } from './connector';
import { editorReducer, initialEditorState } from './editorReducer';
import { createNode } from './nodes';
import type { ConnectorNode, DesignNode, TableNode } from './types';

function importBatch() {
  const a = createNode('table', { x: 0, y: 0, width: 200, height: 100 }, []) as TableNode;
  const b = createNode('table', { x: 400, y: 0, width: 200, height: 100 }, [a]) as TableNode;
  const byId = new Map<string, DesignNode>([[a.id, a], [b.id, b]]);
  const link = createConnector(
    { kind: 'column', tableId: a.id, columnId: a.columns[0]!.id },
    { kind: 'column', tableId: b.id, columnId: b.columns[0]!.id },
    'a_b',
    byId,
  );
  return { a, b, link, nodes: [a, b, link] as DesignNode[] };
}

describe('importNodes', () => {
  const seed = () => {
    const existing = createNode('table', { x: 0, y: 300, width: 200, height: 100 }, []);
    return { existing, state: initialEditorState([existing]) };
  };

  it('appends after existing nodes in batch order and selects only the tables', () => {
    const { a, b, link } = importBatch();
    const { existing, state } = seed();
    const s = editorReducer(state, { type: 'importNodes', nodes: [a, b, link] });
    expect(s.nodes.map((n) => n.id)).toEqual([existing.id, a.id, b.id, link.id]);
    expect(s.selection).toEqual([a.id, b.id]);
    const routed = s.nodes.find((n) => n.id === link.id) as ConnectorNode;
    expect(routed.points.length).toBeGreaterThan(0);
  });

  it('is one undo step back to the seeded nodes', () => {
    const { nodes } = importBatch();
    const { state } = seed();
    const imported = editorReducer(state, { type: 'importNodes', nodes });
    const undone = editorReducer(imported, { type: 'undo' });
    expect(undone.nodes).toEqual(state.nodes);
    expect(editorReducer(undone, { type: 'redo' }).nodes).toHaveLength(4);
  });

  it('adds nodes at the top level even if they name a parent', () => {
    const { a } = importBatch();
    const frame = createNode('frame', { x: -50, y: -50, width: 400, height: 400 }, []);
    const s = editorReducer(initialEditorState([frame]), {
      type: 'importNodes',
      nodes: [{ ...a, parentId: frame.id }],
    });
    expect(s.nodes.find((n) => n.id === a.id)?.parentId).toBeNull();
  });

  it('ignores an empty batch without a history entry', () => {
    const state = initialEditorState();
    expect(editorReducer(state, { type: 'importNodes', nodes: [] })).toBe(state);
  });
});

describe('connector bends', () => {
  const seed = () => {
    const a = createNode('table', { x: 0, y: 0, width: 200, height: 100 }, []) as TableNode;
    const b = createNode('table', { x: 600, y: 0, width: 200, height: 100 }, [a]) as TableNode;
    const link = createConnector({ kind: 'node', nodeId: a.id }, { kind: 'node', nodeId: b.id }, 'a_b', new Map<string, DesignNode>([[a.id, a], [b.id, b]]));
    return { link, state: initialEditorState([a, b, link]) };
  };
  const bends = [{ x: 400, y: 32 }, { x: 400, y: -100 }, { x: 500, y: -100 }, { x: 500, y: 32 }];
  const connectorOf = (s: ReturnType<typeof seed>['state'], id: string) => s.nodes.find((n) => n.id === id) as ConnectorNode;

  it('setConnectorBends reroutes through the bends without touching history', () => {
    const { link, state } = seed();
    const s = editorReducer(state, { type: 'setConnectorBends', id: link.id, bends });
    expect(connectorOf(s, link.id).bends).toEqual(bends);
    for (const bend of bends) expect(connectorOf(s, link.id).points).toContainEqual(bend);
    expect(s.past).toBe(state.past);
  });

  it('a checkpoint, a drag and an undo restore the automatic route', () => {
    const { link, state } = seed();
    let s = editorReducer(state, { type: 'checkpoint' });
    s = editorReducer(s, { type: 'setConnectorBends', id: link.id, bends });
    s = editorReducer(s, { type: 'setConnectorBends', id: link.id, bends: bends.map((p) => ({ ...p, y: p.y - 10 })) });
    s = editorReducer(s, { type: 'undo' });
    expect(connectorOf(s, link.id).bends).toBeUndefined();
    expect(connectorOf(s, link.id).points).toEqual(connectorOf(state, link.id).points);
  });

  it('ignores bends for a straight connector and for other nodes', () => {
    const { link, state } = seed();
    const straight = editorReducer(state, { type: 'editConnector', id: link.id, patch: { routing: 'straight' } });
    expect(editorReducer(straight, { type: 'setConnectorBends', id: link.id, bends })).toBe(straight);
    const table = state.nodes[0]!;
    expect(editorReducer(state, { type: 'setConnectorBends', id: table.id, bends })).toBe(state);
  });

  it('Reset route clears the bends as one undo step, and is nothing to undo when there are none', () => {
    const { link, state } = seed();
    expect(editorReducer(state, { type: 'editConnector', id: link.id, patch: { bends: undefined } })).toBe(state);
    const shaped = editorReducer(editorReducer(state, { type: 'checkpoint' }), { type: 'setConnectorBends', id: link.id, bends });
    const reset = editorReducer(shaped, { type: 'editConnector', id: link.id, patch: { bends: undefined } });
    expect(connectorOf(reset, link.id).bends).toBeUndefined();
    expect('bends' in connectorOf(reset, link.id)).toBe(false);
    expect(connectorOf(reset, link.id).points).toEqual(connectorOf(state, link.id).points);
    expect(reset.past).toHaveLength(shaped.past.length + 1);
    expect(connectorOf(editorReducer(reset, { type: 'undo' }), link.id).bends).toEqual(bends);
  });

  it('updateNodes can carry bends for a gesture that moves a whole connector', () => {
    const { link, state } = seed();
    const shaped = editorReducer(state, { type: 'setConnectorBends', id: link.id, bends });
    const moved = bends.map((p) => ({ x: p.x + 5, y: p.y }));
    const s = editorReducer(shaped, { type: 'updateNodes', patches: { [link.id]: { bends: moved } } });
    expect(connectorOf(s, link.id).bends).toEqual(moved);
    expect(s.past).toBe(shaped.past);
  });

  it('Reset route recomputes the route even when the plain one is blocked', () => {
    const { link, state } = seed();
    const blocker = createNode('table', { x: 380, y: 0, width: 100, height: 64 }, state.nodes);
    const blocked = editorReducer(initialEditorState([...state.nodes, blocker]), { type: 'checkpoint' });
    const automatic = connectorOf(blocked, link.id).points;
    expect(automatic.length).toBeGreaterThan(2);
    const shaped = editorReducer(blocked, { type: 'setConnectorBends', id: link.id, bends: [{ x: 360, y: 32 }, { x: 360, y: -60 }, { x: 500, y: -60 }, { x: 500, y: 32 }] });
    expect(connectorOf(shaped, link.id).points).not.toEqual(automatic);
    expect(connectorOf(editorReducer(shaped, { type: 'editConnector', id: link.id, patch: { bends: undefined } }), link.id).points).toEqual(automatic);
    expect(connectorOf(editorReducer(shaped, { type: 'setConnectorBends', id: link.id, bends: [] }), link.id).points).toEqual(automatic);
  });

  it('drops the bends when an end is re-attached, unless the same edit brings new ones', () => {
    const { link, state } = seed();
    const c = createNode('table', { x: 600, y: 300, width: 200, height: 100 }, state.nodes);
    const withThird = initialEditorState([...state.nodes, c]);
    const shaped = editorReducer(withThird, { type: 'setConnectorBends', id: link.id, bends });
    const moved = editorReducer(shaped, { type: 'editConnector', id: link.id, patch: { to: { kind: 'node', nodeId: c.id } } });
    expect(connectorOf(moved, link.id).to).toEqual({ kind: 'node', nodeId: c.id });
    expect(connectorOf(moved, link.id).bends).toBeUndefined();
    const kept = editorReducer(shaped, { type: 'editConnector', id: link.id, patch: { to: { kind: 'node', nodeId: c.id }, bends } });
    expect(connectorOf(kept, link.id).bends).toEqual(bends);
  });

  it('filters non-finite bends in editConnector too', () => {
    const { link, state } = seed();
    const s = editorReducer(state, { type: 'editConnector', id: link.id, patch: { bends: [...bends, { x: Number.NaN, y: 0 }] } });
    expect(connectorOf(s, link.id).bends).toEqual(bends);
    expect(editorReducer(state, { type: 'editConnector', id: link.id, patch: { bends: [{ x: Number.NaN, y: 0 }] } })).toBe(state);
  });

  it('keeps bends while straight and uses them again when switched back', () => {
    const { link, state } = seed();
    const shaped = editorReducer(state, { type: 'setConnectorBends', id: link.id, bends });
    const straight = editorReducer(shaped, { type: 'editConnector', id: link.id, patch: { routing: 'straight' } });
    expect(connectorOf(straight, link.id).points).toHaveLength(2);
    expect(connectorOf(straight, link.id).bends).toEqual(bends);
    const back = editorReducer(straight, { type: 'editConnector', id: link.id, patch: { routing: 'orthogonal' } });
    expect(connectorOf(back, link.id).points).toEqual(connectorOf(shaped, link.id).points);
  });

  describe('moving and copying a shaped connector', () => {
    const shapedSeed = () => {
      const { link, state } = seed();
      const shaped = editorReducer(state, { type: 'setConnectorBends', id: link.id, bends });
      const [a, b] = state.nodes;
      return { link, a: a!, b: b!, shaped };
    };
    const shifted = (dx: number, dy: number) => bends.map((p) => ({ x: p.x + dx, y: p.y + dy }));

    it('nudges the bends with a selected connector and its tables', () => {
      const { link, a, b, shaped } = shapedSeed();
      const s = editorReducer({ ...shaped, selection: [a.id, b.id, link.id] }, { type: 'nudgeSelection', dx: 10, dy: 20 });
      expect(connectorOf(s, link.id).bends).toEqual(shifted(10, 20));
    });

    it('nudges the bends when both its tables move, though it is not selected', () => {
      const { link, a, b, shaped } = shapedSeed();
      const s = editorReducer({ ...shaped, selection: [a.id, b.id] }, { type: 'nudgeSelection', dx: 10, dy: 20 });
      expect(connectorOf(s, link.id).bends).toEqual(shifted(10, 20));
    });

    it('leaves the bends where they were when the connector moves with only one of its tables', () => {
      const { link, a, shaped } = shapedSeed();
      const s = editorReducer({ ...shaped, selection: [a.id, link.id] }, { type: 'nudgeSelection', dx: 10, dy: 20 });
      expect(connectorOf(s, link.id).bends).toEqual(bends);
    });

    it('nudges a connector with both ends loose, only when it is selected', () => {
      const { link, shaped } = shapedSeed();
      const loose = editorReducer(shaped, { type: 'editConnector', id: link.id, patch: { from: { kind: 'point', x: 200, y: 32 }, to: { kind: 'point', x: 600, y: 32 }, bends } });
      expect(connectorOf(editorReducer({ ...loose, selection: [link.id] }, { type: 'nudgeSelection', dx: 10, dy: 20 }), link.id).bends).toEqual(shifted(10, 20));
      const other = loose.nodes[0]!;
      expect(connectorOf(editorReducer({ ...loose, selection: [other.id] }, { type: 'nudgeSelection', dx: 10, dy: 20 }), link.id).bends).toEqual(bends);
    });

    it('leaves the bends where they were when only one table moves', () => {
      const { link, a, shaped } = shapedSeed();
      const s = editorReducer({ ...shaped, selection: [a.id] }, { type: 'nudgeSelection', dx: 10, dy: 20 });
      expect(connectorOf(s, link.id).bends).toEqual(bends);
    });

    it('offsets the bends of a duplicated connector like everything else it copies', () => {
      const { link, a, b, shaped } = shapedSeed();
      const s = editorReducer({ ...shaped, selection: [a.id, b.id, link.id] }, { type: 'duplicateSelection' });
      const copy = s.nodes.filter((n): n is ConnectorNode => n.type === 'connector' && n.id !== link.id)[0]!;
      expect(copy.bends).toEqual(shifted(10, 10));
      expect(connectorOf(s, link.id).bends).toEqual(bends);
    });
  });
});

