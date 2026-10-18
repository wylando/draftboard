import { boxCenter, boxThrough, edgePointToward, pointInRotatedBox, rotatedBounds, unionBoxes } from '../geometry';
import type { ConnectorNode, DesignNode, Point } from './types';

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

/** Connectors attach to drawn layers only: never to groups (no body) or other connectors. */
const isAttachable = (n: DesignNode | undefined): n is DesignNode =>
  n !== undefined && n.type !== 'group' && n.type !== 'connector';

/** The topmost visible attachable layer under a world point, for starting or ending a connector. */
export function attachTargetAt(nodes: readonly DesignNode[], point: Point): string | null {
  const byId = byIdOf(nodes);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i] as DesignNode;
    if (isAttachable(n) && isEffectivelyVisible(byId, n) && pointInRotatedBox(n, n.rotation, point)) return n.id;
  }
  return null;
}

/** World positions of a connector's two ends. */
export function connectorEnds(c: ConnectorNode): [Point, Point] {
  return c.ends.map((e) => ({ x: c.x + e.x * c.width, y: c.y + e.y * c.height })) as [Point, Point];
}

/**
 * Moves each attached connector end to the edge of its layer (on its rotated
 * bounds), facing the other end. A missing target, or a second end on the same
 * layer, becomes a free end where it was. Unchanged connectors keep their identity.
 */
function routeConnectors(nodes: readonly DesignNode[]): DesignNode[] {
  if (!nodes.some((n) => n.type === 'connector')) return nodes as DesignNode[];
  const byId = byIdOf(nodes);
  return nodes.map((n) => {
    if (n.type !== 'connector') return n;
    const fromNode = n.fromId === null ? undefined : byId.get(n.fromId);
    const from = isAttachable(fromNode) ? fromNode : undefined;
    const toNode = n.toId === null || n.toId === n.fromId ? undefined : byId.get(n.toId);
    const to = isAttachable(toNode) ? toNode : undefined;
    let [start, end] = connectorEnds(n);
    const fromBox = from && rotatedBounds(from, from.rotation);
    const toBox = to && rotatedBounds(to, to.rotation);
    if (fromBox) start = edgePointToward(fromBox, toBox ? boxCenter(toBox) : end);
    if (toBox) end = edgePointToward(toBox, fromBox ? boxCenter(fromBox) : start);
    const next = { ...n, ...boxThrough(start, end), fromId: from?.id ?? null, toId: to?.id ?? null, rotation: 0 };
    const same =
      next.x === n.x &&
      next.y === n.y &&
      next.width === n.width &&
      next.height === n.height &&
      next.fromId === n.fromId &&
      next.toId === n.toId &&
      n.rotation === 0 &&
      next.ends.every((e, i) => e.x === n.ends[i]?.x && e.y === n.ends[i]?.y);
    return same ? n : next;
  });
}

/**
 * Restores the tree invariants after any structural change:
 * - connector ends attached to a layer are re-routed to its edge;
 * - parents that are missing, not containers, or part of a cycle become null;
 * - the list is rewritten in preorder, keeping sibling order;
 * - empty groups are removed;
 * - each group's box is the union of its children, with rotation 0.
 * Nodes that need no change keep their identity, so memoized views skip them.
 */
export function normalizeTree(raw: readonly DesignNode[]): DesignNode[] {
  // Before group bounds, so a group holding a connector is sized from its routed box.
  const input = routeConnectors(raw);
  const byId = byIdOf(input);
  const parentOf = new Map<string, string | null>();
  for (const n of input) {
    const p = n.parentId ?? null;
    parentOf.set(n.id, p !== null && p !== n.id && isContainer(byId.get(p)) ? p : null);
  }
  // Break cycles: walk up from each node; if we come back to it, detach it.
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
  return out;
}
