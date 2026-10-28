import { describe, expect, it } from 'vitest';
import { editorReducer, initialEditorState, type EditorState } from './model/editorReducer';
import { createNode } from './model/nodes';
import type { DesignNode } from './model/types';
import { toastFor } from './toasts';

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
