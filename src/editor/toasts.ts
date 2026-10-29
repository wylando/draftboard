import type { EditorAction, EditorState } from './model/editorReducer';
import type { WorkspaceState } from './model/workspace';
import { byIdOf, topLevelIds } from './model/tree';

export interface ToastPlan {
  /** One id per kind, so a held key updates its toast instead of stacking. */
  id: 'copy' | 'cut' | 'paste' | 'duplicate' | 'delete';
  message: string;
  undoable?: boolean;
}

const layers = (n: number) => `${n} ${n === 1 ? 'layer' : 'layers'}`;

/**
 * The toast an action earns, from the state it will run on. Decided from cheap preconditions, without running
 * the reducer, and null for every other action so drags and scrubs cost nothing. Null as well when the action
 * would find nothing to act on, so a key with no target stays silent.
 */
export function toastFor(state: EditorState, action: EditorAction): ToastPlan | null {
  switch (action.type) {
    case 'copySelection':
    case 'cutSelection':
    case 'duplicateSelection': {
      const count = topLevelIds(byIdOf(state.nodes), state.selection).length;
      if (count === 0) return null;
      const [id, verb] = { copySelection: ['copy', 'Copied'], cutSelection: ['cut', 'Cut'], duplicateSelection: ['duplicate', 'Duplicated'] }[action.type] as [ToastPlan['id'], string];
      return { id, message: `${verb} ${layers(count)}` };
    }
    case 'pasteClipboard': {
      if (state.clipboard.length === 0) return { id: 'paste', message: 'Nothing to paste' };
      const inClipboard = new Set(state.clipboard.map((n) => n.id));
      const pasted = state.clipboard.filter((n) => n.parentId === null || !inClipboard.has(n.parentId)).length;
      return { id: 'paste', message: `Pasted ${layers(pasted)}` };
    }
    case 'deleteSelection': {
      // The editorReducer wrapper drops a stale pick, so a non-null one is live and goes on its own.
      if (state.selectedColumn) return { id: 'delete', message: 'Deleted column', undoable: true };
      const count = topLevelIds(byIdOf(state.nodes), state.selection).length;
      return count === 0 ? null : { id: 'delete', message: `Deleted ${layers(count)}`, undoable: true };
    }
    default:
      return null;
  }
}

/** What a delete toast's Undo belongs to: its board, and the document the delete removed. */
export interface DeleteMark {
  boardId: string;
  nodes: EditorState['nodes'];
}

/** True while the delete is still the newest history entry on its board, so Undo takes back that delete only. */
export function isUndoable(ws: WorkspaceState, mark: DeleteMark): boolean {
  if (ws.activeId !== mark.boardId) return false;
  const editor = ws.boards.find((b) => b.id === mark.boardId)?.editor;
  return editor !== undefined && editor.past[editor.past.length - 1] === mark.nodes && editor.nodes !== mark.nodes;
}
