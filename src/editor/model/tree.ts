import { pointInRotatedBox, rotatedBounds, unionBoxes } from '../geometry';
import { routeConnector, targetId, visibleTables } from './connector';
import { tableHeight } from './table';
import type { Anchor, Cardinality, DesignNode, Point, TableNode } from './types';

/**
 * Pure helpers for the layer tree. The document stays a flat list in preorder
 * (parent before descendants, siblings bottom-to-top), so code that only needs
 * paint order can keep iterating `nodes` directly.
 */

export type ById = ReadonlyMap<string, DesignNode>;

export const byIdOf = (nodes: readonly DesignNode[]): ById => new Map(nodes.map((n) => [n.id, n]));

export const isContainer = (n: DesignNode | undefined): boolean => n?.type === 'frame' || n?.type === 'group';

/** Children of each parent (null = top level), bottom-to-top. */
export function childrenByParent(nodes: readonly DesignNode[]): Map<string | null, DesignNode[]> {
  const map = new Map<string | null, DesignNode[]>();
  for (const n of nodes) {
    const list = map.get(n.parentId);
    if (list) list.push(n);
    else map.set(n.parentId, [n]);
  }
  return map;
}

/** Ancestor ids, nearest first. */
export function ancestorIds(byId: ById, id: string): string[] {
  const result: string[] = [];
  let parent = byId.get(id)?.parentId ?? null;
  while (parent !== null && !result.includes(parent)) {
    result.push(parent);
    parent = byId.get(parent)?.parentId ?? null;
  }
  return result;
}

/** All descendants of `ids` (not including the ids themselves). */
export function descendantIds(nodes: readonly DesignNode[], ids: Iterable<string>): Set<string> {
  const children = childrenByParent(nodes);
  const result = new Set<string>();
  const stack = [...ids];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    for (const c of children.get(id) ?? []) {
      if (!result.has(c.id)) {
        result.add(c.id);
        stack.push(c.id);
      }
    }
  }
  return result;
}

/** Drops ids whose ancestor is also listed, so a subtree is never handled twice. */
export function topLevelIds(byId: ById, ids: readonly string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => byId.has(id) && !ancestorIds(byId, id).some((a) => set.has(a)));
}

/** Hidden if the node or any ancestor is hidden. */
export function isEffectivelyVisible(byId: ById, node: DesignNode): boolean {
  return node.visible && ancestorIds(byId, node.id).every((a) => byId.get(a)?.visible !== false);
}

/**
 * Containers whose children a plain click may select directly: every ancestor
 * of the current selection, plus (for double-click) the selected nodes
 * themselves.
 */
export function enteredScopes(byId: ById, selection: readonly string[], includeSelected: boolean): Set<string> {
  const scopes = new Set<string>();
  for (const id of selection) {
    if (includeSelected) scopes.add(id);
    for (const a of ancestorIds(byId, id)) scopes.add(a);
  }
  return scopes;
}

/**
 * What a click on `hitId` selects. Design choice: a group is selected as a
 * whole until you enter it (double-click) or select inside it; frames never
 * capture clicks meant for their children. `deep` (Mod+click) picks the hit
 * layer itself.
 */
export function selectTarget(byId: ById, hitId: string, entered: ReadonlySet<string>, deep = false): string {
  if (deep) return hitId;
  const chain = [...ancestorIds(byId, hitId)].reverse(); // root first
  for (const id of chain) {
    if (byId.get(id)?.type === 'group' && !entered.has(id)) return id;
  }
  return hitId;
}

/**
 * The deepest visible frame containing `point`, ignoring `exclude` and its
 * subtrees. A child frame only counts where its parent frames also contain
 * the point, because frames clip their content.
 */
export function frameAt(nodes: readonly DesignNode[], point: Point, exclude: ReadonlySet<string>): string | null {
  const children = childrenByParent(nodes);
  const search = (parentId: string | null): string | null => {
    const list = children.get(parentId) ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i] as DesignNode;
      if (exclude.has(n.id) || !n.visible) continue;
      if (n.type === 'group') {
        const inner = search(n.id);
        if (inner) return inner;
      } else if (n.type === 'frame' && pointInRotatedBox(n, n.rotation, point)) {
        return search(n.id) ?? n.id;
      }
    }
    return null;
  };
  return search(null);
}

/** Applies `fn` to every sibling list (bottom-to-top) and flattens back to preorder. */
export function mapSiblings(
  nodes: readonly DesignNode[],
  fn: (siblings: DesignNode[]) => DesignNode[],
): DesignNode[] {
  const children = childrenByParent(nodes);
  const out: DesignNode[] = [];
  const visit = (parentId: string | null) => {
    for (const n of fn(children.get(parentId) ?? [])) {
      out.push(n);
      visit(n.id);
    }
  };
  visit(null);
  return out;
}

/**
 * Restores the tree invariants after any structural change:
 * - parents that are missing, not containers, or part of a cycle become null;
 * - the list is rewritten in preorder, keeping sibling order;
 * - empty groups are removed;
 * - each group's box is the union of its children, with rotation 0;
 * - each table is as tall as its header and rows, with rotation 0;
 * - each connector sits at the top level and is routed against the final
 *   layers (see `routeConnector`).
 * Nodes that need no change keep their identity, so memoized views skip them.
 */
export function normalizeTree(input: readonly DesignNode[]): DesignNode[] {
  const byId = byIdOf(input);
  const parentOf = new Map<string, string | null>();
  for (const n of input) {
    const p = n.parentId ?? null;
    const nests = n.type !== 'connector' && p !== null && p !== n.id && isContainer(byId.get(p));
    parentOf.set(n.id, nests ? p : null);
  }
  // Detach any node caught in a parent cycle.
  for (const n of input) {
    const seen = new Set<string>([n.id]);
    let p = parentOf.get(n.id) ?? null;
    while (p !== null) {
      if (seen.has(p)) {
        parentOf.set(n.id, null);
        break;
      }
      seen.add(p);
      p = parentOf.get(p) ?? null;
    }
  }

  const children = new Map<string | null, DesignNode[]>();
  for (const n of input) {
    const p = parentOf.get(n.id) ?? null;
    const node = n.parentId === p ? n : ({ ...n, parentId: p } as DesignNode);
    const list = children.get(p);
    if (list) list.push(node);
    else children.set(p, [node]);
  }

  // Post-order, so a group is sized from children that are already final.
  const build = (node: DesignNode): DesignNode[] | null => {
    const sub: DesignNode[] = [];
    const direct: DesignNode[] = [];
    for (const c of children.get(node.id) ?? []) {
      const built = build(c);
      if (!built) continue;
      direct.push(built[0] as DesignNode);
      sub.push(...built);
    }
    if (node.type === 'table') {
      const height = tableHeight(node.columns.length);
      return [node.height === height && node.rotation === 0 ? node : { ...node, height, rotation: 0 }, ...sub];
    }
    if (node.type !== 'group') return [node, ...sub];
    const bounds = unionBoxes(direct.map((c) => rotatedBounds(c, c.rotation)));
    if (!bounds) return null;
    const same =
      node.x === bounds.x &&
      node.y === bounds.y &&
      node.width === bounds.width &&
      node.height === bounds.height &&
      node.rotation === 0;
    return [same ? node : { ...node, ...bounds, rotation: 0 }, ...sub];
  };

  const out: DesignNode[] = [];
  for (const root of children.get(null) ?? []) out.push(...(build(root) ?? []));
  // Connectors last: their routes depend on where everything else ended up.
  if (!out.some((n) => n.type === 'connector')) return out;
  const final = byIdOf(out);
  const tables = visibleTables(final);
  return out.map((n) => (n.type === 'connector' ? routeConnector(n, final, tables) : n));
}

/**
 * What focusing tables highlights: the visible connectors with an end on one of
 * the selected tables, and the visible tables at those connectors' other ends
 * (never a focused table). A table counts as focused only when it is itself
 * selected; groups and frames holding tables do not. Loose and broken ends
 * attach to nothing, and a non-table layer at the far end adds no table.
 */
export function relatedToTables(selection: readonly string[], byId: ById): { connectors: Set<string>; tables: Set<string> } {
  const connectors = new Set<string>();
  const tables = new Set<string>();
  const focused = new Set(selection.filter((id) => {
    const node = byId.get(id);
    return node?.type === 'table' && isEffectivelyVisible(byId, node);
  }));
  if (focused.size === 0) return { connectors, tables };
  for (const node of byId.values()) {
    if (node.type !== 'connector' || !isEffectivelyVisible(byId, node)) continue;
    const ends = [targetId(node.from), targetId(node.to)];
    const i = ends.findIndex((id) => id !== null && focused.has(id));
    if (i < 0) continue;
    connectors.add(node.id);
    const other = ends[1 - i];
    const neighbour = other ? byId.get(other) : undefined;
    if (neighbour?.type === 'table' && !focused.has(neighbour.id) && isEffectivelyVisible(byId, neighbour)) tables.add(neighbour.id);
  }
  return { connectors, tables };
}

/**
 * Heuristic join costs: the model has no row counts, so a lookup into an indexed column is assumed cheap and any
 * other a scan. Only the ratio matters.
 */
export const INDEXED_JOIN_COST = 1;
export const SCAN_JOIN_COST = 10;

/** Whether `columnId` can use an index of `table`: a unique column, a leading primary-key column or an index's first column. */
function isIndexed(table: TableNode, columnId: string): boolean {
  const column = table.columns.find((c) => c.id === columnId);
  if (!column) return false;
  // Only the leading column of a composite key or index can serve a lookup on its own.
  return column.unique
    || table.columns.find((c) => c.primaryKey)?.id === columnId
    || table.indexes.some((ix) => ix.columnIds[0] === columnId);
}

const mandatory = (c: Cardinality) => c === 'one' || c === 'oneOrMany';

/**
 * The cheapest join path from the first of exactly two selected visible tables to the second, as the connectors on
 * it and the tables it passes through (not the two selected). Each step costs the lookup into the table it enters:
 * `INDEXED_JOIN_COST` when the connector's end there is an indexed column, else `SCAN_JOIN_COST`; ties go to fewer
 * hops. Selection order therefore matters. `route` lists the tables from the first selected to the second; each
 * after the first carries the connector it is entered by and whether that step cost `INDEXED_JOIN_COST` and whether it always finds a row (the connector's end at the table
 * entered is mandatory). The sets
 * and `route` are empty when no path exists; `null` when the selection is not two visible tables, so callers can
 * fall back to `relatedToTables`. With `guaranteedOnly`, only guaranteed steps are taken (mandatory is `one` or
 * `oneOrMany`).
 */
export function cheapestJoinPath(selection: readonly string[], byId: ById, guaranteedOnly = false): {
  connectors: Set<string>;
  tables: Set<string>;
  route: { table: string; via?: { connector: string; indexed: boolean; guaranteed: boolean } }[];
} | null {
  const isTable = (id: string | null): id is string => {
    const node = id ? byId.get(id) : undefined;
    return node?.type === 'table' && isEffectivelyVisible(byId, node);
  };
  const [start, goal, ...extra] = selection.filter(isTable);
  if (!start || !goal || extra.length > 0) return null;

  const edges = new Map<string, { to: string; indexed: boolean; guaranteed: boolean; connector: string }[]>();
  for (const node of byId.values()) {
    if (node.type !== 'connector' || !isEffectivelyVisible(byId, node)) continue;
    const a = targetId(node.from);
    const b = targetId(node.to);
    if (!isTable(a) || !isTable(b) || a === b) continue;
    const enters = (end: Anchor, id: string) => end.kind === 'column' && isIndexed(byId.get(id) as TableNode, end.columnId);
    const intoB = mandatory(node.toCardinality);
    const intoA = mandatory(node.fromCardinality);
    if (!guaranteedOnly || intoB) {
      const out = edges.get(a) ?? [];
      out.push({ to: b, indexed: enters(node.to, b), guaranteed: intoB, connector: node.id });
      edges.set(a, out);
    }
    if (!guaranteedOnly || intoA) {
      const back = edges.get(b) ?? [];
      back.push({ to: a, indexed: enters(node.from, a), guaranteed: intoA, connector: node.id });
      edges.set(b, back);
    }
  }

  // Imported schemas reach hundreds of tables; an O(V^2) scan for the next node is well under a frame there, so no heap.
  const best = new Map<string, { cost: number; hops: number; via?: { from: string; connector: string; indexed: boolean; guaranteed: boolean } }>([[start, { cost: 0, hops: 0 }]]);
  const done = new Set<string>();
  for (;;) {
    let current: string | null = null;
    for (const [id, d] of best) {
      if (done.has(id)) continue;
      const c = current ? best.get(current)! : null;
      if (!c || d.cost < c.cost) current = id;
    }
    if (current === null || current === goal) break;
    done.add(current);
    const here = best.get(current)!;
    for (const edge of edges.get(current) ?? []) {
      const cost = here.cost + (edge.indexed ? INDEXED_JOIN_COST : SCAN_JOIN_COST);
      const hops = here.hops + 1;
      const known = best.get(edge.to);
      if (!known || cost < known.cost || (cost === known.cost && hops < known.hops)) {
        best.set(edge.to, { cost, hops, via: { from: current, connector: edge.connector, indexed: edge.indexed, guaranteed: edge.guaranteed } });
      }
    }
  }

  const connectors = new Set<string>();
  const tables = new Set<string>();
  const route: { table: string; via?: { connector: string; indexed: boolean; guaranteed: boolean } }[] = [];
  let entered = goal;
  for (let step = best.get(goal)?.via; step; step = best.get(step.from)?.via) {
    connectors.add(step.connector);
    if (step.from !== start) tables.add(step.from);
    route.unshift({ table: entered, via: { connector: step.connector, indexed: step.indexed, guaranteed: step.guaranteed } });
    entered = step.from;
  }
  if (route.length > 0) route.unshift({ table: start });
  return { connectors, tables, route };
}
