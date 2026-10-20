import { boxCenter, mapBoxBetween, rotatePoint } from '../geometry';
import type { Box, DesignNode, NodePatch, Point, ToolId, Viewport } from './types';
import { createId, nameKey, nameTaken, uniqueName } from './names';
import { createGroup } from './nodes';
import { applyTableEdit, type TableEdit } from './table';
import { byIdOf, descendantIds, type ById, frameAt, isContainer, mapSiblings, normalizeTree, topLevelIds } from './tree';

const HISTORY_LIMIT = 200;
const PASTE_OFFSET = 10;

export interface EditorState {
  nodes: DesignNode[];
  selection: string[];
  tool: ToolId;
  viewport: Viewport;
  /** Canvas element size in screen px; needed to zoom around the center or fit content. */
  canvasSize: { width: number; height: number };
  past: DesignNode[][];
  future: DesignNode[][];
  /** Copied or cut layers with their descendants, in preorder. In memory only; not saved. */
  clipboard: DesignNode[];
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
  /** `parentAt`: put the node in the deepest frame under this world point. */
  | { type: 'addNode'; node: DesignNode; select?: boolean; parentAt?: Point }
  /** Transient: does not snapshot history. Pair with a prior checkpoint. */
  | { type: 'updateNodes'; patches: Record<string, NodePatch> }
  /** Ignored when the trimmed name is empty, unchanged or held by another layer (ignoring case). */
  | { type: 'renameNode'; id: string; name: string }
  /** One change to a table's columns or indexes, as one undo step. Ignored when `applyTableEdit` refuses it. */
  | { type: 'editTable'; id: string; edit: TableEdit }
  /**
   * Transient. Sets a node's box and carries its children along: moving a
   * frame or group moves them, resizing a group scales them, resizing a frame
   * leaves them where they are, and rotating a frame turns them about its center.
   */
  | { type: 'transformNode'; id: string; box: Partial<Box & { rotation: number }> }
  /**
   * Transient, sent at the end of a canvas drag: each moved layer joins the
   * deepest frame under `point`, or the top level. Layers inside a group stay
   * in their group.
   */
  | { type: 'dropSelectionAt'; point: Point }
  /** Layers-panel drag and drop: re-parent and reorder `ids` relative to `targetId`. */
  | { type: 'moveLayers'; ids: string[]; targetId: string; position: 'above' | 'below' | 'inside' }
  | { type: 'groupSelection' }
  | { type: 'ungroupSelection' }
  /** Move the selection by a delta, as one undo step. Computed from current state. */
  | { type: 'nudgeSelection'; dx: number; dy: number }
  | { type: 'deleteSelection' }
  | { type: 'duplicateSelection' }
  | { type: 'copySelection' }
  /** Copy, then delete, as one undo step. */
  | { type: 'cutSelection' }
  /** Paste the clipboard 10px from where it was copied; the next paste goes 10px further. */
  | { type: 'pasteClipboard' }
  | { type: 'reorderSelection'; direction: 'forward' | 'backward' | 'front' | 'back' }
  | { type: 'loadDocument'; nodes: DesignNode[] };

/** Saved or imported documents may repeat a name; the first layer in tree order keeps it. */
function dedupeNames(nodes: DesignNode[]): DesignNode[] {
  const taken = new Set<string>();
  return nodes.map((n) => {
    const name = uniqueName(n.name, taken);
    taken.add(nameKey(name));
    return name === n.name ? n : { ...n, name };
  });
}

export function initialEditorState(nodes: DesignNode[] = []): EditorState {
  return {
    nodes: dedupeNames(normalizeTree(nodes)),
    selection: [],
    tool: 'select',
    viewport: { x: 0, y: 0, zoom: 1 },
    canvasSize: { width: 0, height: 0 },
    past: [],
    future: [],
    clipboard: [],
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

function reorderSiblings(nodes: DesignNode[], selected: Set<string>, direction: 'forward' | 'backward' | 'front' | 'back') {
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

function patchNodes(nodes: DesignNode[], patches: Record<string, NodePatch>): DesignNode[] | null {
  let changed = false;
  const next = nodes.map((n) => {
    const patch = patches[n.id];
    if (!patch) return n;
    changed = true;
    return { ...n, ...patch } as DesignNode;
  });
  return changed ? normalizeTree(next) : null;
}

function selectionWithDescendants(nodes: DesignNode[], selection: string[]): Set<string> {
  const top = topLevelIds(byIdOf(nodes), selection);
  return new Set([...top, ...descendantIds(nodes, top)]);
}

/**
 * Copies of `nodes` (a subtree list in preorder) with fresh ids, offset by
 * PASTE_OFFSET. Parents inside the list are remapped; a parent outside it is
 * kept only if it is in `existing`. A copy whose name is taken gets the next free one.
 */
function cloneOffset(nodes: DesignNode[], existing: ById): { copies: DesignNode[]; newIds: Map<string, string> } {
  const newIds = new Map<string, string>();
  for (const n of nodes) newIds.set(n.id, createId());
  const taken = new Set([...existing.values()].map((n) => nameKey(n.name)));
  const copies = nodes.map((n) => {
    const inner = n.parentId === null ? undefined : newIds.get(n.parentId);
    const name = uniqueName(n.name, taken);
    taken.add(nameKey(name));
    return {
      ...n,
      id: newIds.get(n.id) as string,
      name,
      parentId: inner ?? (n.parentId !== null && existing.has(n.parentId) ? n.parentId : null),
      x: n.x + PASTE_OFFSET,
      y: n.y + PASTE_OFFSET,
    };
  });
  return { copies, newIds };
}

function transformPatches(
  nodes: DesignNode[],
  id: string,
  box: Partial<Box & { rotation: number }>,
): Record<string, NodePatch> {
  const node = nodes.find((n) => n.id === id);
  if (!node) return {};
  const { rotation, ...rest } = box;
  const next = { x: node.x, y: node.y, width: node.width, height: node.height, ...rest };
  const patches: Record<string, NodePatch> = { [id]: next };
  if (rotation !== undefined && node.type !== 'group') {
    patches[id] = { ...next, rotation };
    const delta = rotation - node.rotation;
    if (node.type !== 'frame' || delta === 0) return patches;
    const pivot = boxCenter(node);
    const inner = descendantIds(nodes, [id]);
    for (const d of nodes) {
      if (!inner.has(d.id)) continue;
      const c = rotatePoint(boxCenter(d), delta, pivot);
      // Groups take their box from their children, so only leaves and frames turn.
      patches[d.id] =
        d.type === 'group' ? {} : { x: c.x - d.width / 2, y: c.y - d.height / 2, rotation: d.rotation + delta };
    }
    return patches;
  }
  if (!isContainer(node)) return patches;
  const resized = next.width !== node.width || next.height !== node.height;
  if (node.type === 'frame' && resized) return patches;
  const dx = next.x - node.x;
  const dy = next.y - node.y;
  const inner = descendantIds(nodes, [id]);
  for (const d of nodes) {
    if (!inner.has(d.id)) continue;
    patches[d.id] = resized ? mapBoxBetween(d, node, next) : { x: d.x + dx, y: d.y + dy };
  }
  return patches;
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
      const parentId = action.parentAt ? frameAt(s.nodes, action.parentAt, new Set()) : action.node.parentId;
      return {
        ...s,
        nodes: normalizeTree([...s.nodes, { ...action.node, parentId }]),
        selection: action.select === false ? s.selection : [action.node.id],
      };
    }

    case 'updateNodes': {
      const nodes = patchNodes(state.nodes, action.patches);
      return nodes ? { ...state, nodes } : state;
    }

    case 'renameNode': {
      const name = action.name.trim();
      const node = state.nodes.find((n) => n.id === action.id);
      if (!node || !name || name === node.name || nameTaken(state.nodes, name, node.id)) return state;
      const s = pushHistory(state);
      return { ...s, nodes: s.nodes.map((n) => (n.id === action.id ? { ...n, name } : n)) };
    }

    case 'editTable': {
      const table = state.nodes.find((n) => n.id === action.id);
      const next = table?.type === 'table' ? applyTableEdit(table, action.edit) : null;
      if (!next) return state;
      const s = pushHistory(state);
      return { ...s, nodes: normalizeTree(s.nodes.map((n) => (n.id === action.id ? next : n))) };
    }

    case 'transformNode': {
      const nodes = patchNodes(state.nodes, transformPatches(state.nodes, action.id, action.box));
      return nodes ? { ...state, nodes } : state;
    }

    case 'dropSelectionAt': {
      const byId = byIdOf(state.nodes);
      const top = topLevelIds(byId, state.selection);
      const exclude = new Set([...top, ...descendantIds(state.nodes, top)]);
      const target = frameAt(state.nodes, action.point, exclude);
      const moving = new Set(
        top.filter((id) => {
          const n = byId.get(id) as DesignNode;
          const parent = n.parentId === null ? undefined : byId.get(n.parentId);
          return parent?.type !== 'group' && n.parentId !== target;
        }),
      );
      if (moving.size === 0) return state;
      // Re-parented layers go on top of their new siblings.
      const rest = state.nodes.filter((n) => !moving.has(n.id));
      const moved = state.nodes.filter((n) => moving.has(n.id)).map((n) => ({ ...n, parentId: target }));
      return { ...state, nodes: normalizeTree([...rest, ...moved]) };
    }

    case 'moveLayers': {
      const byId = byIdOf(state.nodes);
      const target = byId.get(action.targetId);
      if (!target) return state;
      if (action.position === 'inside' && !isContainer(target)) return state;
      const top = topLevelIds(byId, action.ids).filter((id) => id !== target.id);
      // Can't drop a layer into its own subtree.
      if (top.length === 0 || descendantIds(state.nodes, top).has(target.id)) return state;
      const movingSet = new Set(top);
      const parentId = action.position === 'inside' ? target.id : target.parentId;
      const moved = state.nodes.filter((n) => movingSet.has(n.id)).map((n) => ({ ...n, parentId }));
      const rest = state.nodes.filter((n) => !movingSet.has(n.id));
      const at = rest.indexOf(target);
      // Siblings are bottom-to-top, so "above" in the panel means later in the list.
      const index = action.position === 'inside' ? rest.length : action.position === 'above' ? at + 1 : at;
      const s = pushHistory(state);
      return {
        ...s,
        nodes: normalizeTree([...rest.slice(0, index), ...moved, ...rest.slice(index)]),
        selection: top,
      };
    }

    case 'groupSelection': {
      const top = topLevelIds(byIdOf(state.nodes), state.selection);
      if (top.length === 0) return state;
      const topSet = new Set(top);
      // The group takes the place of the highest selected layer.
      const highest = state.nodes.reduce((acc, n, i) => (topSet.has(n.id) ? i : acc), -1);
      const anchor = state.nodes[highest] as DesignNode;
      const group = createGroup(anchor.parentId, state.nodes);
      const nodes = state.nodes.map((n) => (topSet.has(n.id) ? { ...n, parentId: group.id } : n));
      nodes.splice(highest, 0, group);
      const s = pushHistory(state);
      return { ...s, nodes: normalizeTree(nodes), selection: [group.id] };
    }

    case 'ungroupSelection': {
      const byId = byIdOf(state.nodes);
      const groups = topLevelIds(byId, state.selection).filter((id) => byId.get(id)?.type === 'group');
      if (groups.length === 0) return state;
      const groupSet = new Set(groups);
      const released: string[] = [];
      const nodes: DesignNode[] = [];
      for (const n of state.nodes) {
        if (groupSet.has(n.id)) continue;
        if (n.parentId !== null && groupSet.has(n.parentId)) {
          released.push(n.id);
          nodes.push({ ...n, parentId: (byId.get(n.parentId) as DesignNode).parentId });
        } else {
          nodes.push(n);
        }
      }
      const s = pushHistory(state);
      return { ...s, nodes: normalizeTree(nodes), selection: released };
    }

    case 'nudgeSelection': {
      if (state.selection.length === 0) return state;
      const moving = selectionWithDescendants(state.nodes, state.selection);
      const s = pushHistory(state);
      return {
        ...s,
        nodes: normalizeTree(
          s.nodes.map((n) => (moving.has(n.id) ? { ...n, x: n.x + action.dx, y: n.y + action.dy } : n)),
        ),
      };
    }

    case 'deleteSelection': {
      if (state.selection.length === 0) return state;
      const removed = selectionWithDescendants(state.nodes, state.selection);
      const s = pushHistory(state);
      return { ...s, nodes: normalizeTree(s.nodes.filter((n) => !removed.has(n.id))), selection: [] };
    }

    case 'duplicateSelection': {
      if (state.selection.length === 0) return state;
      const byId = byIdOf(state.nodes);
      const top = topLevelIds(byId, state.selection);
      const copying = selectionWithDescendants(state.nodes, state.selection);
      // Preorder is kept, and copies land on top of their original's siblings.
      const { copies, newIds } = cloneOffset(
        state.nodes.filter((n) => copying.has(n.id)),
        byId,
      );
      const s = pushHistory(state);
      return {
        ...s,
        nodes: normalizeTree([...s.nodes, ...copies]),
        selection: top.map((id) => newIds.get(id) as string),
      };
    }

    case 'copySelection': {
      if (state.selection.length === 0) return state;
      const copying = selectionWithDescendants(state.nodes, state.selection);
      return { ...state, clipboard: state.nodes.filter((n) => copying.has(n.id)) };
    }

    case 'cutSelection': {
      if (state.selection.length === 0) return state;
      const removed = selectionWithDescendants(state.nodes, state.selection);
      const s = pushHistory(state);
      return {
        ...s,
        nodes: normalizeTree(s.nodes.filter((n) => !removed.has(n.id))),
        selection: [],
        clipboard: s.nodes.filter((n) => removed.has(n.id)),
      };
    }

    case 'pasteClipboard': {
      if (state.clipboard.length === 0) return state;
      const inClipboard = new Set(state.clipboard.map((n) => n.id));
      const top = state.clipboard.filter((n) => n.parentId === null || !inClipboard.has(n.parentId));
      const { copies, newIds } = cloneOffset(state.clipboard, byIdOf(state.nodes));
      const s = pushHistory(state);
      return {
        ...s,
        nodes: normalizeTree([...s.nodes, ...copies]),
        selection: top.map((n) => newIds.get(n.id) as string),
        // The next paste offsets from this one, so repeated pastes cascade.
        clipboard: copies,
      };
    }

    case 'reorderSelection': {
      if (state.selection.length === 0) return state;
      const s = pushHistory(state);
      const selected = new Set(state.selection);
      return { ...s, nodes: mapSiblings(s.nodes, (siblings) => reorderSiblings(siblings, selected, action.direction)) };
    }

    case 'loadDocument':
      return {
        ...initialEditorState(normalizeTree(action.nodes)),
        viewport: state.viewport,
        canvasSize: state.canvasSize,
        clipboard: state.clipboard,
      };
  }
}
