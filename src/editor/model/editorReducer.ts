import type { DesignNode, NodePatch, ToolId, Viewport } from './types';
import { createId } from './nodes';

const HISTORY_LIMIT = 200;
const DUPLICATE_OFFSET = 10;

export interface EditorState {
  nodes: DesignNode[];
  selection: string[];
  tool: ToolId;
  viewport: Viewport;
  /** Canvas element size in screen px; needed to zoom around the center or fit content. */
  canvasSize: { width: number; height: number };
  past: DesignNode[][];
  future: DesignNode[][];
}

export type EditorAction =
  /** Snapshot current nodes onto the undo stack. Dispatch once before a gesture. */
  | { type: 'checkpoint' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'setTool'; tool: ToolId }
  | { type: 'setViewport'; viewport: Viewport }
  | { type: 'setCanvasSize'; size: { width: number; height: number } }
  | { type: 'select'; ids: string[] }
  | { type: 'addNode'; node: DesignNode; select?: boolean }
  /** Transient: does not snapshot history. Pair with a prior checkpoint. */
  | { type: 'updateNodes'; patches: Record<string, NodePatch> }
  /** Move the selection by a delta, as one undo step. Computed from current state. */
  | { type: 'nudgeSelection'; dx: number; dy: number }
  | { type: 'deleteSelection' }
  | { type: 'duplicateSelection' }
  | { type: 'reorderSelection'; direction: 'forward' | 'backward' | 'front' | 'back' }
  | { type: 'loadDocument'; nodes: DesignNode[] };

export function initialEditorState(nodes: DesignNode[] = []): EditorState {
  return {
    nodes,
    selection: [],
    tool: 'select',
    viewport: { x: 0, y: 0, zoom: 1 },
    canvasSize: { width: 0, height: 0 },
    past: [],
    future: [],
  };
}

function pushHistory(state: EditorState): EditorState {
  const past = [...state.past, state.nodes].slice(-HISTORY_LIMIT);
  return { ...state, past, future: [] };
}

function keepExistingSelection(selection: string[], nodes: DesignNode[]): string[] {
  const ids = new Set(nodes.map((n) => n.id));
  return selection.filter((id) => ids.has(id));
}

function reorder(nodes: DesignNode[], selected: Set<string>, direction: 'forward' | 'backward' | 'front' | 'back') {
  if (direction === 'front') {
    return [...nodes.filter((n) => !selected.has(n.id)), ...nodes.filter((n) => selected.has(n.id))];
  }
  if (direction === 'back') {
    return [...nodes.filter((n) => selected.has(n.id)), ...nodes.filter((n) => !selected.has(n.id))];
  }
  const next = [...nodes];
  // Walk from the side we're moving toward so adjacent selected nodes don't leapfrog.
  const step = direction === 'forward' ? 1 : -1;
  const start = step === 1 ? next.length - 2 : 1;
  for (let i = start; i >= 0 && i < next.length; i -= step) {
    const cur = next[i];
    const neighbor = next[i + step];
    if (cur && neighbor && selected.has(cur.id) && !selected.has(neighbor.id)) {
      next[i] = neighbor;
      next[i + step] = cur;
    }
  }
  return next;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'checkpoint':
      return pushHistory(state);

    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        nodes: previous,
        past: state.past.slice(0, -1),
        future: [state.nodes, ...state.future],
        selection: keepExistingSelection(state.selection, previous),
      };
    }

    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        ...state,
        nodes: next,
        past: [...state.past, state.nodes],
        future: rest,
        selection: keepExistingSelection(state.selection, next),
      };
    }

    case 'setTool':
      return { ...state, tool: action.tool };

    case 'setViewport':
      return { ...state, viewport: action.viewport };

    case 'setCanvasSize':
      return { ...state, canvasSize: action.size };

    case 'select':
      return { ...state, selection: action.ids };

    case 'addNode': {
      const s = pushHistory(state);
      return {
        ...s,
        nodes: [...s.nodes, action.node],
        selection: action.select === false ? s.selection : [action.node.id],
      };
    }

    case 'updateNodes': {
      let changed = false;
      const nodes = state.nodes.map((n) => {
        const patch = action.patches[n.id];
        if (!patch) return n;
        changed = true;
        return { ...n, ...patch } as DesignNode;
      });
      return changed ? { ...state, nodes } : state;
    }

    case 'nudgeSelection': {
      if (state.selection.length === 0) return state;
      const selected = new Set(state.selection);
      const s = pushHistory(state);
      return {
        ...s,
        nodes: s.nodes.map((n) => (selected.has(n.id) ? { ...n, x: n.x + action.dx, y: n.y + action.dy } : n)),
      };
    }

    case 'deleteSelection': {
      if (state.selection.length === 0) return state;
      const selected = new Set(state.selection);
      const s = pushHistory(state);
      return { ...s, nodes: s.nodes.filter((n) => !selected.has(n.id)), selection: [] };
    }

    case 'duplicateSelection': {
      if (state.selection.length === 0) return state;
      const selected = new Set(state.selection);
      const copies = state.nodes
        .filter((n) => selected.has(n.id))
        .map((n) => ({ ...n, id: createId(), x: n.x + DUPLICATE_OFFSET, y: n.y + DUPLICATE_OFFSET }));
      const s = pushHistory(state);
      return { ...s, nodes: [...s.nodes, ...copies], selection: copies.map((c) => c.id) };
    }

    case 'reorderSelection': {
      if (state.selection.length === 0) return state;
      const s = pushHistory(state);
      return { ...s, nodes: reorder(s.nodes, new Set(state.selection), action.direction) };
    }

    case 'loadDocument':
      return { ...initialEditorState(action.nodes), viewport: state.viewport, canvasSize: state.canvasSize };
  }
}
