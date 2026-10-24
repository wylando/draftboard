import type { Anchor, DesignNode } from './types';
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
  | { type: 'closeBoard'; id: string }
  /** Ignored when the trimmed name is empty, unchanged or held by another board (ignoring case). */
  | { type: 'renameBoard'; id: string; name: string }
  /** `toIndex` is clamped. The active board stays active. */
  | { type: 'moveBoard'; id: string; toIndex: number }
  /** Inserts a copy right after the board, named like a copied layer ("Board 1" → "Board 2"), and activates it. */
  | { type: 'duplicateBoard'; id: string };

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

/** Fresh ids throughout; parents and connector ends inside the board point at the copies. */
function copyNodes(nodes: DesignNode[]): DesignNode[] {
  const ids = new Map(nodes.map((n) => [n.id, createId()]));
  const remap = (a: Anchor): Anchor => {
    if (a.kind === 'point') return a;
    return a.kind === 'column' ? { ...a, tableId: ids.get(a.tableId) ?? a.tableId } : { ...a, nodeId: ids.get(a.nodeId) ?? a.nodeId };
  };
  return nodes.map((n) => {
    const copy = { ...n, id: ids.get(n.id) as string, parentId: n.parentId === null ? null : (ids.get(n.parentId) ?? null) };
    return copy.type === 'connector' ? { ...copy, from: remap(copy.from), to: remap(copy.to) } : copy;
  });
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
 
    case 'renameBoard': {
      const name = action.name.trim();
      const board = state.boards.find((b) => b.id === action.id);
      if (!board || name === '' || name === board.name) return state;
      if (state.boards.some((b) => b.id !== board.id && nameKey(b.name) === nameKey(name))) return state;
      return { ...state, boards: state.boards.map((b) => (b === board ? { ...b, name } : b)) };
    }

    case 'moveBoard': {
      const from = state.boards.findIndex((b) => b.id === action.id);
      if (from < 0) return state;
      const to = Math.min(Math.max(action.toIndex, 0), state.boards.length - 1);
      if (to === from) return state;
      const boards = [...state.boards];
      const [board] = boards.splice(from, 1);
      boards.splice(to, 0, board as Board);
      return { ...state, boards };
    }

    case 'duplicateBoard': {
      const index = state.boards.findIndex((b) => b.id === action.id);
      if (index < 0) return state;
      const source = state.boards[index] as Board;
      const name = uniqueName(source.name, new Set(state.boards.map((b) => nameKey(b.name))));
      const editor: EditorState = {
        ...initialEditorState(copyNodes(source.editor.nodes)),
        viewport: source.editor.viewport,
      };
      const board: Board = { id: createId(), name, editor: carryShared(activeOf(state).editor, editor) };
      const boards = [...state.boards];
      boards.splice(index + 1, 0, board);
      return { boards, activeId: board.id };
    }
  }
}
