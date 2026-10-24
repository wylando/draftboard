import type { SavedBoard } from '../persistence';
import { editorReducer, initialEditorState, type EditorAction, type EditorState } from './editorReducer';
import { createId, nameKey, uniqueName } from './names';

export interface Board {
  id: string;
  name: string;
  editor: EditorState;
}

export interface WorkspaceState {
  boards: Board[];
  activeId: string;
}

export type WorkspaceAction =
  /** Forwarded to the active board's `editorReducer`; the other boards are untouched. */
  | { type: 'editor'; action: EditorAction }
  /** Appends a board named the next free "Board N" and activates it. */
  | { type: 'newBoard' }
  /** Ignored for an unknown id or the active board. */
  | { type: 'switchBoard'; id: string }
  /** Ignored for an unknown id or the last board. Closing the active board activates its right neighbour, else its left. */
  | { type: 'closeBoard'; id: string };

/** Saved boards may be missing a name or repeat one; the first board keeps it. */
export function initialWorkspace(saved: SavedBoard[], activeId?: string): WorkspaceState {
  const taken = new Set<string>();
  const boards = saved.map((b): Board => {
    const name = uniqueName(b.name.trim() || 'Board 1', taken);
    taken.add(nameKey(name));
    return { id: b.id, name, editor: initialEditorState(b.nodes) };
  });
  if (boards.length === 0) boards.push({ id: createId(), name: 'Board 1', editor: initialEditorState() });
  const active = boards.find((b) => b.id === activeId) ?? (boards[0] as Board);
  return { boards, activeId: active.id };
}

/** Whether two workspaces save the same: pans, selection and tool changes don't count. */
export function sameSavedParts(a: WorkspaceState, b: WorkspaceState): boolean {
  return (
    a.activeId === b.activeId &&
    a.boards.length === b.boards.length &&
    a.boards.every((x, i) => {
      const y = b.boards[i] as Board;
      return x.id === y.id && x.name === y.name && x.editor.nodes === y.editor.nodes;
    })
  );
}

const activeOf = (state: WorkspaceState) => state.boards.find((b) => b.id === state.activeId) as Board;

/**
 * The clipboard and canvas size belong to the app, not a document: they are copied into the board
 * being shown (the canvas element keeps its size across boards, and setCanvasSize only fires on resize).
 */
function carryShared(from: EditorState, to: EditorState): EditorState {
  if (to.clipboard === from.clipboard && to.canvasSize === from.canvasSize) return to;
  return { ...to, clipboard: from.clipboard, canvasSize: from.canvasSize };
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'editor': {
      const active = activeOf(state);
      const editor = editorReducer(active.editor, action.action);
      if (editor === active.editor) return state;
      return { ...state, boards: state.boards.map((b) => (b === active ? { ...b, editor } : b)) };
    }

    case 'newBoard': {
      const taken = new Set(state.boards.map((b) => nameKey(b.name)));
      let n = 1;
      while (taken.has(nameKey(`Board ${n}`))) n += 1;
      const board: Board = {
        id: createId(),
        name: `Board ${n}`,
        editor: carryShared(activeOf(state).editor, initialEditorState()),
      };
      return { boards: [...state.boards, board], activeId: board.id };
    }

    case 'switchBoard': {
      const target = state.boards.find((b) => b.id === action.id);
      if (!target || target.id === state.activeId) return state;
      const editor = carryShared(activeOf(state).editor, target.editor);
      return {
        boards: editor === target.editor ? state.boards : state.boards.map((b) => (b === target ? { ...b, editor } : b)),
        activeId: target.id,
      };
    }

    case 'closeBoard': {
      const index = state.boards.findIndex((b) => b.id === action.id);
      if (index < 0 || state.boards.length === 1) return state;
      const boards = state.boards.filter((b) => b.id !== action.id);
      if (action.id !== state.activeId) return { ...state, boards };
      const next = boards[index] ?? (boards[index - 1] as Board);
      const editor = carryShared(activeOf(state).editor, next.editor);
      return {
        boards: editor === next.editor ? boards : boards.map((b) => (b === next ? { ...b, editor } : b)),
        activeId: next.id,
      };
    }
  }
}
