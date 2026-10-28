import { describe, expect, it } from 'vitest';
import { createConnector } from './connector';
import { editorReducer, initialEditorState, type EditorState } from './editorReducer';
import { createNode } from './nodes';
import type { DesignNode } from './types';

const rect = (x: number, y: number, width: number, height: number, existing: DesignNode[]) =>
  createNode('rect', { x, y, width, height }, existing);

function setup(boxes: Array<[number, number, number, number]>) {
  const nodes: DesignNode[] = [];
  for (const [x, y, w, h] of boxes) nodes.push(rect(x, y, w, h, nodes));
  const state = { ...initialEditorState(nodes), selection: nodes.map((n) => n.id) };
  return { nodes, state };
}

const at = (s: EditorState, id: string) => s.nodes.find((n) => n.id === id) as DesignNode;

describe('alignSelection', () => {
  // Selection bounds: x 10..110, y 5..60.
  const boxes: Array<[number, number, number, number]> = [
    [10, 5, 100, 20],
    [30, 15, 80, 45],
    [60, 40, 50, 20],
  ];

  it('left, right, top and bottom line the bounding boxes up with the selection bounds', () => {
    const { nodes, state } = setup(boxes);
    const x = (edge: 'left' | 'right') => nodes.map((n) => at(editorReducer(state, { type: 'alignSelection', align: edge }), n.id).x);
    expect(x('left')).toEqual([10, 10, 10]);
    expect(x('right')).toEqual([10, 30, 60]);
    const y = (edge: 'top' | 'bottom') => nodes.map((n) => at(editorReducer(state, { type: 'alignSelection', align: edge }), n.id).y);
    expect(y('top')).toEqual([5, 5, 5]);
    expect(y('bottom')).toEqual([40, 15, 40]);
  });

  it('centres on the selection bounds', () => {
    const { nodes, state } = setup(boxes);
    const cx = editorReducer(state, { type: 'alignSelection', align: 'centerX' });
    expect(nodes.map((n) => at(cx, n.id).x + at(cx, n.id).width / 2)).toEqual([60, 60, 60]);
    const cy = editorReducer(state, { type: 'alignSelection', align: 'centerY' });
    expect(nodes.map((n) => at(cy, n.id).y + at(cy, n.id).height / 2)).toEqual([32.5, 32.5, 32.5]);
  });

  it('uses the axis-aligned bounds of a rotated layer', () => {
    const wide = { ...rect(0, 0, 100, 20, []), rotation: 90 };
    const other = rect(200, 0, 40, 40, [wide]);
    const state = { ...initialEditorState([wide, other]), selection: [wide.id, other.id] };
    // Rotated 90 degrees about (50,10), the wide layer covers x 40..60.
    const s = editorReducer(state, { type: 'alignSelection', align: 'left' });
    expect(at(s, wide.id).x).toBe(0);
    expect(at(s, other.id).x).toBe(40);
  });

  it('is one undo step', () => {
    const { nodes, state } = setup(boxes);
    const s = editorReducer(state, { type: 'alignSelection', align: 'left' });
    expect(s.past).toHaveLength(1);
    expect(editorReducer(s, { type: 'undo' }).nodes).toEqual(nodes);
  });

  it('does nothing, and records no history, when nothing would move', () => {
    const { state } = setup([[10, 10, 50, 50], [10, 80, 30, 30]]);
    expect(editorReducer(state, { type: 'alignSelection', align: 'left' })).toBe(state);
    expect(editorReducer({ ...state, selection: [state.selection[0]!] }, { type: 'alignSelection', align: 'right' }).past).toHaveLength(0);
  });

  it('carries a container’s children and treats a selected child with its parent as one subtree', () => {
    const frame = createNode('frame', { x: 100, y: 0, width: 100, height: 100 }, []);
    const child = { ...rect(120, 20, 20, 20, [frame]), parentId: frame.id };
    const loose = rect(0, 0, 30, 30, [frame, child]);
    const state = { ...initialEditorState([frame, child, loose]), selection: [frame.id, child.id, loose.id] };
    const s = editorReducer(state, { type: 'alignSelection', align: 'right' });
    expect(at(s, frame.id).x).toBe(100);
    expect(at(s, child.id).x).toBe(120);
    expect(at(s, loose.id).x).toBe(170);
    const left = editorReducer(state, { type: 'alignSelection', align: 'left' });
    expect(at(left, frame.id).x).toBe(0);
    expect(at(left, child.id).x).toBe(20);
  });

  it('moves a group as a whole', () => {
    const a = rect(0, 0, 10, 10, []);
    const b = rect(20, 0, 10, 10, [a]);
    const grouped = editorReducer({ ...initialEditorState([a, b]), selection: [a.id, b.id] }, { type: 'groupSelection' });
    const group = grouped.nodes.find((n) => n.type === 'group') as DesignNode;
    const far = rect(100, 50, 10, 10, grouped.nodes);
    const state = { ...editorReducer(grouped, { type: 'addNode', node: far, select: false }), selection: [group.id, far.id] };
    const s = editorReducer(state, { type: 'alignSelection', align: 'right' });
    expect(at(s, group.id).x).toBe(80);
    expect(at(s, a.id).x).toBe(80);
    expect(at(s, b.id).x).toBe(100);
  });

  it('skips connectors', () => {
    const a = createNode('table', { x: 0, y: 0, width: 200, height: 100 }, []);
    const b = createNode('table', { x: 400, y: 200, width: 200, height: 100 }, [a]);
    const link = createConnector({ kind: 'node', nodeId: a.id }, { kind: 'point', x: 700, y: 700 }, 'link', new Map([[a.id, a], [b.id, b]]));
    const state = { ...initialEditorState([a, b, link]), selection: [a.id, b.id, link.id] };
    const s = editorReducer(state, { type: 'alignSelection', align: 'left' });
    expect(at(s, b.id).x).toBe(0);
    const moved = at(s, link.id);
    expect(moved.type === 'connector' && moved.to).toEqual({ kind: 'point', x: 700, y: 700 });
  });
});

describe('distributeSelection', () => {
  it('gives equal horizontal gaps and keeps the outermost layers put', () => {
    const { nodes, state } = setup([[0, 0, 20, 10], [30, 0, 40, 10], [200, 0, 20, 10]]);
    const s = editorReducer(state, { type: 'distributeSelection', axis: 'horizontal' });
    // Free space is 220 - 80 = 140, so each of the two gaps is 70.
    expect(nodes.map((n) => at(s, n.id).x)).toEqual([0, 90, 200]);
  });

  it('distributes vertically, in position order rather than selection order', () => {
    const { nodes, state } = setup([[0, 100, 10, 10], [0, 0, 10, 10], [0, 20, 10, 30]]);
    const s = editorReducer(state, { type: 'distributeSelection', axis: 'vertical' });
    // Sorted: y 0 (h10), y 20 (h30), y 100 (h10). Free space is 110 - 50 = 60, gaps of 30.
    expect(nodes.map((n) => at(s, n.id).y)).toEqual([100, 0, 40]);
  });

  it('needs three layers', () => {
    const { state } = setup([[0, 0, 10, 10], [50, 0, 10, 10]]);
    expect(editorReducer(state, { type: 'distributeSelection', axis: 'horizontal' })).toBe(state);
  });

  it('does nothing when the gaps are already equal', () => {
    const { state } = setup([[0, 0, 10, 10], [20, 0, 10, 10], [40, 0, 10, 10]]);
    expect(editorReducer(state, { type: 'distributeSelection', axis: 'horizontal' })).toBe(state);
  });

  it('is one undo step', () => {
    const { nodes, state } = setup([[0, 0, 10, 10], [11, 0, 10, 10], [100, 0, 10, 10]]);
    const s = editorReducer(state, { type: 'distributeSelection', axis: 'horizontal' });
    expect(s.past).toHaveLength(1);
    expect(editorReducer(s, { type: 'undo' }).nodes).toEqual(nodes);
  });
});
