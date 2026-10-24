import { describe, expect, it } from 'vitest';
import { nameKey } from './names';
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
