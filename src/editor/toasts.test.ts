import { describe, expect, it } from 'vitest';
import { editorReducer, initialEditorState, type EditorState } from './model/editorReducer';
import { createNode } from './model/nodes';
import type { DesignNode } from './model/types';
import { initialWorkspace, workspaceReducer, type WorkspaceState } from './model/workspace';
import { isUndoable, toastFor } from './toasts';

const withRects = (n: number): EditorState => {
  const nodes: DesignNode[] = [];
  for (let i = 0; i < n; i++) nodes.push(createNode('rect', { x: i * 10, y: 0, width: 5, height: 5 }, nodes));
  return { ...initialEditorState(nodes), selection: nodes.map((x) => x.id) };
};

describe('toastFor', () => {
  it('counts selected layers and uses the singular for one', () => {
    expect(toastFor(withRects(1), { type: 'copySelection' })?.message).toBe('Copied 1 layer');
    expect(toastFor(withRects(2), { type: 'duplicateSelection' })?.message).toBe('Duplicated 2 layers');
    expect(toastFor(withRects(2), { type: 'cutSelection' })?.message).toBe('Cut 2 layers');
  });

  it('offers Undo only for delete, and is silent with nothing selected', () => {
    expect(toastFor(withRects(2), { type: 'deleteSelection' })).toEqual({ id: 'delete', message: 'Deleted 2 layers', undoable: true });
    const empty = { ...withRects(2), selection: [] };
    for (const type of ['copySelection', 'cutSelection', 'duplicateSelection', 'deleteSelection'] as const) {
      expect(toastFor(empty, { type })).toBeNull();
    }
  });

  it('reports paste from the clipboard size', () => {
    expect(toastFor(withRects(1), { type: 'pasteClipboard' })?.message).toBe('Nothing to paste');
    const copied = editorReducer(withRects(2), { type: 'copySelection' });
    expect(toastFor(copied, { type: 'pasteClipboard' })?.message).toBe('Pasted 2 layers');
  });

  it('does no work for any other action', () => {
    const touched: string[] = [];
    const spy = new Proxy({} as EditorState, { get: (_, key) => void touched.push(String(key)) });
    expect(toastFor(spy, { type: 'updateNodes', patches: [] } as never)).toBeNull();
    expect(touched).toEqual([]);
  });
});

describe('isUndoable', () => {
  const editor = (ws: WorkspaceState, action: Parameters<typeof editorReducer>[1]): WorkspaceState => workspaceReducer(ws, { type: 'editor', action });
  const active = (ws: WorkspaceState) => ws.boards.find((b) => b.id === ws.activeId)!.editor;
  const deleted = () => {
    const start = editor(initialWorkspace([], undefined), { type: 'loadDocument', nodes: withRects(2).nodes });
    const picked = editor(start, { type: 'select', ids: [active(start).nodes[0]!.id] });
    const mark = { boardId: picked.activeId, nodes: active(picked).nodes };
    return { mark, ws: editor(picked, { type: 'deleteSelection' }) };
  };

  it('holds while the delete is the newest history entry', () => {
    const { mark, ws } = deleted();
    expect(isUndoable(ws, mark)).toBe(true);
  });

  it('fails after another edit, an undo, or a board change', () => {
    const { mark, ws } = deleted();
    expect(isUndoable(editor(ws, { type: 'checkpoint' }), mark)).toBe(false);
    expect(isUndoable(editor(ws, { type: 'undo' }), mark)).toBe(false);
    expect(isUndoable(workspaceReducer(ws, { type: 'newBoard' }), mark)).toBe(false);
  });
});
