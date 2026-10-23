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
