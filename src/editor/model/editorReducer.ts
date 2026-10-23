import { boxCenter, mapBoxBetween, rotatePoint } from '../geometry';
import type { Anchor, Box, ConnectorNode, DesignNode, NodePatch, Point, ToolId, Viewport } from './types';
import { createId, nameKey, nameTaken, uniqueName } from './names';
import { createGroup } from './nodes';
import { allowsManyToMany, isMany, linkKind, linksToItself, nextCardinality, relationDefaults, sameAnchor, shiftLooseEnds } from './connector';
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
  /** A column picked inside the one selected table, so Delete removes the column rather than the table. */
  selectedColumn: { tableId: string; columnId: string } | null;
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
  /** Selects the table and picks one of its columns. */
  | { type: 'selectColumn'; tableId: string; columnId: string }
  /** Steps back one level: a drawing tool to Move, else a picked column to its table, else the selection to nothing. */
  | { type: 'escape' }
  /** `parentAt`: put the node in the deepest frame under this world point. */
  | { type: 'addNode'; node: DesignNode; select?: boolean; parentAt?: Point }
  /** Nodes must have fresh ids; they're added at the top level as one undo step, selecting the tables. */
  | { type: 'importNodes'; nodes: DesignNode[] }
  /** Transient: does not snapshot history. Pair with a prior checkpoint. */
  | { type: 'updateNodes'; patches: Record<string, NodePatch> }
  /** Ignored when the trimmed name is empty, unchanged or held by another layer (ignoring case). */
  | { type: 'renameNode'; id: string; name: string }
  /**
   * Re-attaches a connector end or changes its routing, cardinality or foreign-key flag, as one undo
   * step. Ignored for a self-link, no change, or a many-to-many link that isn't between whole tables.
   */
  | {
      type: 'editConnector';
      id: string;
      patch: Partial<Pick<ConnectorNode, 'from' | 'to' | 'routing' | 'fromCardinality' | 'toCardinality' | 'isForeignKey'>>;
    }
  /** Steps one end's cardinality to the next allowed one, as one undo step. */
  | { type: 'cycleCardinality'; id: string; end: 'from' | 'to' }
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
    selectedColumn: null,
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

/** A copied connector's ends: re-pointed at copied layers, otherwise loose where they were, offset. */
function copyEnds(c: ConnectorNode, newIds: Map<string, string>): Pick<ConnectorNode, 'from' | 'to'> {
  const end = (a: Anchor, at: Point | undefined): Anchor => {
    // A broken end stays broken in the copy: it is still a lost link, not a deliberate loose end.
    if (a.kind === 'point') return { ...a, x: a.x + PASTE_OFFSET, y: a.y + PASTE_OFFSET };
    const id = newIds.get(a.kind === 'column' ? a.tableId : a.nodeId);
    if (id) return a.kind === 'column' ? { ...a, tableId: id } : { ...a, nodeId: id };
    return { kind: 'point', x: (at?.x ?? c.x) + PASTE_OFFSET, y: (at?.y ?? c.y) + PASTE_OFFSET };
  };
  return { from: end(c.from, c.points[0]), to: end(c.to, c.points[c.points.length - 1]) };
}

/**
 * Copies of `nodes` (a subtree list in preorder) with fresh ids, offset by
 * PASTE_OFFSET. Parents inside the list are remapped; a parent outside it is
 * kept only if it is in `existing`. A copy whose name is taken gets the next free one.
 * A copied connector stays attached to copied layers; an end whose layer wasn't
 * copied comes loose where the original's end was, offset like everything else.
 */
function cloneOffset(nodes: DesignNode[], existing: ById): { copies: DesignNode[]; newIds: Map<string, string> } {
  const newIds = new Map<string, string>();
  for (const n of nodes) newIds.set(n.id, createId());
  const taken = new Set([...existing.values()].map((n) => nameKey(n.name)));
  const copies = nodes.map((n) => {
    const inner = n.parentId === null ? undefined : newIds.get(n.parentId);
    const name = uniqueName(n.name, taken);
    taken.add(nameKey(name));
    const copy = {
      ...n,
      id: newIds.get(n.id) as string,
      name,
      parentId: inner ?? (n.parentId !== null && existing.has(n.parentId) ? n.parentId : null),
      x: n.x + PASTE_OFFSET,
      y: n.y + PASTE_OFFSET,
    };
    return copy.type === 'connector' ? { ...copy, ...copyEnds(copy, newIds) } : copy;
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

/** The picked column, if it is still in the one selected table. */
function livePick(state: EditorState): { tableId: string; columnId: string } | null {
  const picked = state.selectedColumn;
  if (!picked || state.selection.length !== 1 || state.selection[0] !== picked.tableId) return null;
  const table = state.nodes.find((n) => n.id === picked.tableId);
  return table?.type === 'table' && table.columns.some((c) => c.id === picked.columnId) ? picked : null;
}

/**
 * A pick lives only while its table is the whole selection and the column
 * exists, whichever action changed the selection or the document.
 */
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const next = reduce(state, action);
  return next.selectedColumn && !livePick(next) ? { ...next, selectedColumn: null } : next;
}

function reduce(state: EditorState, action: EditorAction): EditorState {
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
      return { ...state, selection: action.ids, selectedColumn: null };

    case 'escape':
      if (state.tool !== 'select') return reduce(state, { type: 'setTool', tool: 'select' });
      if (livePick(state)) return { ...state, selectedColumn: null };
      return { ...state, selection: [], selectedColumn: null };

    case 'selectColumn':
      return { ...state, selection: [action.tableId], selectedColumn: { tableId: action.tableId, columnId: action.columnId } };

    case 'addNode': {
      const s = pushHistory(state);
      const parentId = action.parentAt ? frameAt(s.nodes, action.parentAt, new Set()) : action.node.parentId;
      return {
        ...s,
        nodes: normalizeTree([...s.nodes, { ...action.node, parentId }]),
        selection: action.select === false ? s.selection : [action.node.id],
      };
    }

    case 'importNodes': {
      if (action.nodes.length === 0) return state;
      const s = pushHistory(state);
      return {
        ...s,
        nodes: normalizeTree([...s.nodes, ...action.nodes.map((n) => ({ ...n, parentId: null }))]),
        selection: action.nodes.filter((n) => n.type === 'table').map((n) => n.id),
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

    case 'editConnector': {
      const connector = state.nodes.find((n) => n.id === action.id);
      if (connector?.type !== 'connector') return state;
      const { patch } = action;
      let next = { ...connector, ...patch };
      const byId = byIdOf(state.nodes);
      // Re-attached into another kind of link (columns, tables, plain): it takes that kind's meaning.
      if (linkKind(next.from, next.to, byId) !== linkKind(connector.from, connector.to, byId)) {
        next = { ...next, ...relationDefaults(next.from, next.to, byId) };
      }
      if (isMany(next.fromCardinality) && isMany(next.toCardinality) && !allowsManyToMany(next.from, next.to, byId)) {
        if (patch.fromCardinality || patch.toCardinality) return state;
        // A re-attach out of a table-to-table many-to-many: the moved end becomes one.
        next = patch.from ? { ...next, fromCardinality: 'one' } : { ...next, toCardinality: 'one' };
      }
      const unchanged =
        sameAnchor(next.from, connector.from) &&
        sameAnchor(next.to, connector.to) &&
        (['routing', 'fromCardinality', 'toCardinality', 'isForeignKey'] as const).every((k) => next[k] === connector[k]);
      if (unchanged || linksToItself(next.from, next.to)) return state;
      const s = pushHistory(state);
      return { ...s, nodes: normalizeTree(s.nodes.map((n) => (n.id === action.id ? next : n))) };
    }

    case 'cycleCardinality': {
      const connector = state.nodes.find((n) => n.id === action.id);
      if (connector?.type !== 'connector') return state;
      const [own, other] = action.end === 'from' ? (['fromCardinality', 'toCardinality'] as const) : (['toCardinality', 'fromCardinality'] as const);
      const next = nextCardinality(connector[own], connector[other], allowsManyToMany(connector.from, connector.to, byIdOf(state.nodes)));
      return reduce(state, { type: 'editConnector', id: connector.id, patch: { [own]: next } });
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
          if (n.type === 'connector') return false;
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
      // Connectors stay at the top level: they reorder among top-level siblings but never go inside.
      const nests = action.position === 'inside' || target.parentId !== null;
      const top = topLevelIds(byId, action.ids).filter((id) => id !== target.id && !(nests && byId.get(id)?.type === 'connector'));
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
      // Connectors always stay at the top level, so they never join a group.
      const byId = byIdOf(state.nodes);
      const top = topLevelIds(byId, state.selection).filter((id) => byId.get(id)?.type !== 'connector');
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
          s.nodes.map((n) => {
            if (!moving.has(n.id)) return n;
            // A connector's attached ends follow their layers; only its loose ends move.
            if (n.type === 'connector') return { ...n, ...shiftLooseEnds(n, action.dx, action.dy) };
            return { ...n, x: n.x + action.dx, y: n.y + action.dy };
          }),
        ),
      };
    }

    case 'deleteSelection': {
      // A picked column goes on its own; the table stays.
      const picked = livePick(state);
      if (picked) return reduce(state, { type: 'editTable', id: picked.tableId, edit: { kind: 'deleteColumn', columnId: picked.columnId } });
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
