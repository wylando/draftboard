import { describe, expect, it } from 'vitest';
import { nameKey } from './names';
import { createConnector } from './connector';
import { createNode } from './nodes';
import { initialWorkspace, sameSavedParts, workspaceReducer, type WorkspaceAction, type WorkspaceState } from './workspace';

const rect = () => createNode('rect', { x: 0, y: 0, width: 50, height: 50 }, []);
const run = (s: WorkspaceState, ...actions: WorkspaceAction[]) => actions.reduce(workspaceReducer, s);
const editor = (action: Extract<WorkspaceAction, { type: 'editor' }>['action']): WorkspaceAction => ({ type: 'editor', action });
const active = (s: WorkspaceState) => s.boards.find((b) => b.id === s.activeId)!;

const two = () => run(initialWorkspace([]), { type: 'newBoard' });

describe('initialWorkspace', () => {
  it('gives one empty "Board 1" when nothing was saved', () => {
    const s = initialWorkspace([]);
    expect(s.boards.map((b) => b.name)).toEqual(['Board 1']);
    expect(s.boards[0]!.editor.nodes).toEqual([]);
    expect(s.activeId).toBe(s.boards[0]!.id);
  });

  it('builds each board from its nodes and falls back to the first board for a missing or unknown active id', () => {
    const r = rect();
    const saved = [
      { id: 'a', name: 'One', nodes: [r] },
      { id: 'b', name: 'Two', nodes: [] },
    ];
    expect(initialWorkspace(saved, 'b').activeId).toBe('b');
    expect(initialWorkspace(saved, 'nope').activeId).toBe('a');
    expect(initialWorkspace(saved).activeId).toBe('a');
    expect(initialWorkspace(saved).boards[0]!.editor.nodes.map((n) => n.id)).toEqual([r.id]);
  });

  it('repairs empty and duplicate names, ignoring case', () => {
    const s = initialWorkspace([
      { id: 'a', name: 'Plan', nodes: [] },
      { id: 'b', name: 'plan', nodes: [] },
      { id: 'c', name: '  ', nodes: [] },
    ]);
    const keys = s.boards.map((b) => nameKey(b.name));
    expect(new Set(keys).size).toBe(3);
    expect(s.boards[0]!.name).toBe('Plan');
    expect(s.boards.every((b) => b.name.trim() !== '')).toBe(true);
  });
});

describe('editor', () => {
  it('forwards to the active board only', () => {
    const s = two();
    const first = s.boards[0]!;
    const next = run(s, editor({ type: 'addNode', node: rect() }));
    expect(active(next).editor.nodes).toHaveLength(1);
    expect(next.boards[0]).toBe(first);
  });

  it('returns the same workspace when the editor state does not change', () => {
    const s = two();
    expect(run(s, editor({ type: 'undo' }))).toBe(s);
  });
});

describe('newBoard', () => {
  it('names the board with the smallest free "Board N", ignoring case, and activates it', () => {
    const s = initialWorkspace([
      { id: 'a', name: 'Board 1', nodes: [] },
      { id: 'b', name: 'board 3', nodes: [] },
    ]);
    const next = run(s, { type: 'newBoard' });
    expect(next.boards.map((b) => b.name)).toEqual(['Board 1', 'board 3', 'Board 2']);
    expect(next.activeId).toBe(next.boards[2]!.id);
  });

  it('starts with the current canvas size so zoom-to-fit works at once', () => {
    const s = run(initialWorkspace([]), editor({ type: 'setCanvasSize', size: { width: 800, height: 600 } }), { type: 'newBoard' });
    expect(active(s).editor.canvasSize).toEqual({ width: 800, height: 600 });
  });
});

describe('switchBoard', () => {
  it('ignores an unknown id and the active board', () => {
    const s = two();
    expect(run(s, { type: 'switchBoard', id: 'nope' })).toBe(s);
    expect(run(s, { type: 'switchBoard', id: s.activeId })).toBe(s);
  });

  it('keeps nodes, selection, viewport, tool and undo history per board', () => {
    const r = rect();
    const first = initialWorkspace([]);
    const firstId = first.activeId;
    let s = run(
      first,
      editor({ type: 'addNode', node: r }),
      editor({ type: 'setViewport', viewport: { x: 5, y: 6, zoom: 2 } }),
      editor({ type: 'setTool', tool: 'rect' }),
      { type: 'newBoard' },
    );
    expect(active(s).editor.nodes).toEqual([]);
    expect(active(s).editor.viewport.zoom).toBe(1);
    expect(active(s).editor.tool).toBe('select');
    s = run(s, { type: 'switchBoard', id: firstId });
    const e = active(s).editor;
    expect(e.nodes.map((n) => n.id)).toEqual([r.id]);
    expect(e.selection).toEqual([r.id]);
    expect(e.viewport).toEqual({ x: 5, y: 6, zoom: 2 });
    expect(e.tool).toBe('rect');
    expect(active(run(s, editor({ type: 'undo' }))).editor.nodes).toEqual([]);
  });

  it('shares the clipboard: copy on one board, paste on another with fresh ids', () => {
    const r = rect();
    const first = run(initialWorkspace([]), editor({ type: 'addNode', node: r }), editor({ type: 'copySelection' }));
    const s = run(first, { type: 'newBoard' }, editor({ type: 'pasteClipboard' }));
    const pasted = active(s).editor.nodes;
    expect(pasted).toHaveLength(1);
    expect(pasted[0]!.id).not.toBe(r.id);
    const back = run(s, { type: 'switchBoard', id: first.activeId });
    expect(active(back).editor.nodes.map((n) => n.id)).toEqual([r.id]);
  });

  it('carries the canvas size to a board that never saw a resize', () => {
    const base = two();
    const firstId = base.boards[0]!.id;
    const s = run(base, editor({ type: 'setCanvasSize', size: { width: 900, height: 700 } }), { type: 'switchBoard', id: firstId });
    expect(active(s).editor.canvasSize).toEqual({ width: 900, height: 700 });
  });
});

describe('closeBoard', () => {
  const three = () => run(initialWorkspace([]), { type: 'newBoard' }, { type: 'newBoard' });

  it('refuses the last board and an unknown id', () => {
    const one = initialWorkspace([]);
    expect(run(one, { type: 'closeBoard', id: one.activeId })).toBe(one);
    const s = two();
    expect(run(s, { type: 'closeBoard', id: 'nope' })).toBe(s);
  });

  it('activates the right neighbour of a closed active board, else the left', () => {
    const s = three();
    const [a, b, c] = s.boards.map((x) => x.id) as [string, string, string];
    const mid = run(s, { type: 'switchBoard', id: b }, { type: 'closeBoard', id: b });
    expect(mid.activeId).toBe(c);
    const last = run(s, { type: 'closeBoard', id: c });
    expect(last.activeId).toBe(b);
    expect(last.boards.map((x) => x.id)).toEqual([a, b]);
  });

  it('keeps the active board when an inactive one closes', () => {
    const s = three();
    const [a, b, c] = s.boards.map((x) => x.id) as [string, string, string];
    const next = run(s, { type: 'closeBoard', id: a });
    expect(next.activeId).toBe(c);
    expect(next.boards.map((x) => x.id)).toEqual([b, c]);
  });

  it('gives the board that becomes active the shared clipboard and canvas size', () => {
    const base = two();
    const firstId = base.boards[0]!.id;
    const r = rect();
    const s = run(
      base,
      editor({ type: 'setCanvasSize', size: { width: 640, height: 480 } }),
      editor({ type: 'addNode', node: r }),
      editor({ type: 'copySelection' }),
      { type: 'closeBoard', id: base.activeId },
    );
    expect(s.activeId).toBe(firstId);
    expect(active(s).editor.canvasSize).toEqual({ width: 640, height: 480 });
    expect(active(s).editor.clipboard.map((n) => n.id)).toEqual([r.id]);
  });
});

describe('renameBoard', () => {
  const named = () =>
    initialWorkspace([
      { id: 'a', name: 'Plan', nodes: [] },
      { id: 'b', name: 'Notes', nodes: [] },
    ]);

  it('trims and renames', () => {
    const s = run(named(), { type: 'renameBoard', id: 'a', name: '  Roadmap ' });
    expect(s.boards.map((b) => b.name)).toEqual(['Roadmap', 'Notes']);
  });

  it('ignores an empty, unchanged or unknown-id rename', () => {
    const s = named();
    expect(run(s, { type: 'renameBoard', id: 'a', name: '   ' })).toBe(s);
    expect(run(s, { type: 'renameBoard', id: 'a', name: 'Plan' })).toBe(s);
    expect(run(s, { type: 'renameBoard', id: 'nope', name: 'X' })).toBe(s);
  });

  it("ignores another board's name, ignoring case, but allows a case-only change of its own", () => {
    const s = named();
    expect(run(s, { type: 'renameBoard', id: 'a', name: 'notes' })).toBe(s);
    expect(run(s, { type: 'renameBoard', id: 'a', name: 'PLAN' }).boards[0]!.name).toBe('PLAN');
  });
});

describe('moveBoard', () => {
  const three = () => run(initialWorkspace([]), { type: 'newBoard' }, { type: 'newBoard' });
  const ids = (s: WorkspaceState) => s.boards.map((b) => b.id);

  it('moves a board to the index and keeps the active board', () => {
    const s = three();
    const [a, b, c] = ids(s) as [string, string, string];
    const next = run(s, { type: 'moveBoard', id: c, toIndex: 0 });
    expect(ids(next)).toEqual([c, a, b]);
    expect(next.activeId).toBe(s.activeId);
    expect(ids(run(s, { type: 'moveBoard', id: a, toIndex: 2 }))).toEqual([b, c, a]);
  });

  it('clamps the index and returns the same state for a no-op or unknown id', () => {
    const s = three();
    const [a, , c] = ids(s) as [string, string, string];
    expect(ids(run(s, { type: 'moveBoard', id: a, toIndex: 99 }))[2]).toBe(a);
    expect(ids(run(s, { type: 'moveBoard', id: c, toIndex: -5 }))[0]).toBe(c);
    expect(run(s, { type: 'moveBoard', id: a, toIndex: 0 })).toBe(s);
    expect(run(s, { type: 'moveBoard', id: 'nope', toIndex: 1 })).toBe(s);
  });
});

describe('duplicateBoard', () => {
  const withLink = () => {
    const t1 = createNode('table', { x: 0, y: 0, width: 200, height: 100 }, []);
    const t2 = createNode('table', { x: 400, y: 0, width: 200, height: 100 }, [t1]);
    const byId = new Map([t1, t2].map((n) => [n.id, n]));
    const link = createConnector({ kind: 'node', nodeId: t1.id }, { kind: 'node', nodeId: t2.id }, 'Link 1', byId);
    const s = run(
      initialWorkspace([]),
      editor({ type: 'addNode', node: t1 }),
      editor({ type: 'addNode', node: t2 }),
      editor({ type: 'addNode', node: link }),
      editor({ type: 'setViewport', viewport: { x: 5, y: 6, zoom: 2 } }),
    );
    return { s, t1, t2 };
  };

  it('inserts a uniquely named copy after the source, activates it, and keeps the source', () => {
    const { s } = withLink();
    const src = active(s);
    const next = run(s, { type: 'duplicateBoard', id: src.id });
    expect(next.boards).toHaveLength(2);
    expect(next.boards[0]).toBe(src);
    expect(next.boards[1]!.name).toBe('Board 2');
    expect(next.activeId).toBe(next.boards[1]!.id);
    const again = run(next, { type: 'duplicateBoard', id: src.id });
    expect(again.boards.map((b) => b.name)).toEqual(['Board 1', 'Board 3', 'Board 2']);
  });

  it('gives the copy fresh ids, with connectors and parents pointing at the copied layers', () => {
    const { s, t1, t2 } = withLink();
    const copy = active(run(s, { type: 'duplicateBoard', id: s.activeId })).editor.nodes;
    const original = new Set([t1.id, t2.id, ...active(s).editor.nodes.map((n) => n.id)]);
    expect(copy).toHaveLength(3);
    expect(copy.every((n) => !original.has(n.id))).toBe(true);
    const tables = copy.filter((n) => n.type === 'table').map((n) => n.id);
    const link = copy.find((n) => n.type === 'connector');
    expect(link?.type === 'connector' && [link.from, link.to]).toEqual(tables.map((nodeId) => ({ kind: 'node', nodeId })));
    expect(copy.map((n) => n.name)).toEqual(active(s).editor.nodes.map((n) => n.name));
  });

  it('starts with fresh undo history and the source viewport', () => {
    const { s } = withLink();
    expect(active(s).editor.past.length).toBeGreaterThan(0);
    const e = active(run(s, { type: 'duplicateBoard', id: s.activeId })).editor;
    expect(e.past).toEqual([]);
    expect(e.selection).toEqual([]);
    expect(e.viewport).toEqual({ x: 5, y: 6, zoom: 2 });
  });

  it('ignores an unknown id', () => {
    const s = two();
    expect(run(s, { type: 'duplicateBoard', id: 'nope' })).toBe(s);
  });
});

describe('importBoard', () => {
  const tables = () => {
    const t1 = createNode('table', { x: 0, y: 0, width: 200, height: 100 }, []);
    const t2 = createNode('table', { x: 400, y: 0, width: 200, height: 100 }, [t1]);
    return [t1, t2];
  };

  it('inserts a board after the active one with the nodes, activates it, and starts with empty history and no selection', () => {
    const two_ = two();
    const s = run(two_, { type: 'switchBoard', id: two_.boards[0]!.id });
    const next = run(s, { type: 'importBoard', nodes: tables(), name: 'shop' });
    expect(next.boards.map((b) => b.name)).toEqual(['Board 1', 'shop', 'Board 2']);
    expect(next.activeId).toBe(next.boards[1]!.id);
    const e = active(next).editor;
    expect(e.nodes).toHaveLength(2);
    expect(e.past).toEqual([]);
    expect(e.selection).toEqual([]);
  });

  it('names it the next free "Board N" without a name, and avoids a taken name ignoring case', () => {
    const plain = run(initialWorkspace([]), { type: 'importBoard', nodes: tables() });
    expect(plain.boards.map((b) => b.name)).toEqual(['Board 1', 'Board 2']);
    const taken = run(initialWorkspace([]), { type: 'importBoard', nodes: tables(), name: 'BOARD 1' });
    expect(taken.boards[1]!.name).toBe('Board 2');
  });

  it('carries the canvas size and clipboard from the board it was started on', () => {
    const s = run(initialWorkspace([]), editor({ type: 'setCanvasSize', size: { width: 900, height: 700 } }));
    const e = active(run(s, { type: 'importBoard', nodes: tables() })).editor;
    expect(e.canvasSize).toEqual({ width: 900, height: 700 });
  });
});

describe('sameSavedParts', () => {
  it('ignores viewport, selection and tool changes', () => {
    const base = run(initialWorkspace([]), editor({ type: 'addNode', node: rect() }));
    const moved = run(
      base,
      editor({ type: 'setViewport', viewport: { x: 3, y: 4, zoom: 2 } }),
      editor({ type: 'select', ids: [] }),
      editor({ type: 'setTool', tool: 'hand' }),
    );
    expect(moved).not.toBe(base);
    expect(sameSavedParts(base, moved)).toBe(true);
  });

  it('sees changed nodes, order, active board and added boards', () => {
    const base = two();
    const [a, b] = base.boards as [WorkspaceState['boards'][number], WorkspaceState['boards'][number]];
    expect(sameSavedParts(base, run(base, editor({ type: 'addNode', node: rect() })))).toBe(false);
    expect(sameSavedParts(base, { ...base, boards: [b, a] })).toBe(false);
    expect(sameSavedParts(base, { ...base, boards: [a, { ...b, name: 'Renamed' }] })).toBe(false);
    expect(sameSavedParts(base, run(base, { type: 'switchBoard', id: a.id }))).toBe(false);
    expect(sameSavedParts(base, run(base, { type: 'newBoard' }))).toBe(false);
  });
});
