import { boxCenter, rotatedBounds } from '../geometry';
import { createId } from './names';
import { boxTouches, routeAround, segmentHitsBox, STUB, type Side } from './orthogonalRoute';
import { tableRowTop, TABLE_ROW_HEIGHT } from './table';
import type { Anchor, Box, Cardinality, ConnectorNode, DesignNode, Point } from './types';

/**
 * Design choice: how close a rerouted connector may pass a table. Less than
 * a stub, so a route can still leave a table whose neighbour is near.
 */
export const ROUTE_MARGIN = 16;

const NORMAL: Record<Side, Point> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

/** Connector defaults are document data, like shape defaults. `fill` fills a loose end's hollow dot. */
export const CONNECTOR_COLOR = '#757575';
const CONNECTOR_LOOSE_FILL = '#ffffff';

const isTableNode = (a: Anchor, byId: ReadonlyMap<string, DesignNode>) => a.kind === 'node' && byId.get(a.nodeId)?.type === 'table';

/**
 * What a new link between `from` and `to` means, by design choice: column to
 * column is a many-to-one foreign key, table to table one-to-many, anything
 * else plain (no markers).
 */
export function relationDefaults(
  from: Anchor,
  to: Anchor,
  byId: ReadonlyMap<string, DesignNode>,
): Pick<ConnectorNode, 'fromCardinality' | 'toCardinality' | 'isForeignKey'> {
  const kind = linkKind(from, to, byId);
  if (kind === 'columns') return { fromCardinality: 'many', toCardinality: 'one', isForeignKey: true };
  if (kind === 'tables') return { fromCardinality: 'one', toCardinality: 'many', isForeignKey: false };
  return { fromCardinality: 'none', toCardinality: 'none', isForeignKey: false };
}

export const isMany = (c: Cardinality) => c === 'many' || c === 'oneOrMany';

/** The kind of link, which decides its defaults: between columns, between whole tables, or anything else. */
export function linkKind(from: Anchor, to: Anchor, byId: ReadonlyMap<string, DesignNode>): 'columns' | 'tables' | 'plain' {
  if (from.kind === 'column' && to.kind === 'column') return 'columns';
  return isTableNode(from, byId) && isTableNode(to, byId) ? 'tables' : 'plain';
}

/** Whether an end can carry a cardinality: it sits on a table or one of its rows. */
export const relationalEnd = (a: Anchor, byId: ReadonlyMap<string, DesignNode>) => a.kind === 'column' || isTableNode(a, byId);

/** Many-to-many only between whole tables: between columns it can't be one column's reference. */
export const allowsManyToMany = (from: Anchor, to: Anchor, byId: ReadonlyMap<string, DesignNode>) =>
  isTableNode(from, byId) && isTableNode(to, byId);

const CYCLE: Cardinality[] = ['one', 'zeroOrOne', 'many', 'oneOrMany', 'none'];

/** The next cardinality in the cycle, skipping the many ones when they would make a link many-to-many it can't be. */
export function nextCardinality(current: Cardinality, other: Cardinality, manyToMany: boolean): Cardinality {
  let i = CYCLE.indexOf(current);
  for (let step = 0; step < CYCLE.length; step++) {
    i = (i + 1) % CYCLE.length;
    const next = CYCLE[i] as Cardinality;
    if (manyToMany || !isMany(other) || !isMany(next)) return next;
  }
  return current;
}

/** Live foreign keys, by table: the `from` column of every column-to-column connector marked as one. */
export function foreignKeyColumns(nodes: readonly DesignNode[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const n of nodes) {
    if (n.type !== 'connector' || !n.isForeignKey || n.from.kind !== 'column' || n.to.kind !== 'column') continue;
    const set = out.get(n.from.tableId) ?? new Set<string>();
    set.add(n.from.columnId);
    out.set(n.from.tableId, set);
  }
  return out;
}

export const normalType = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/** Whether a foreign key's column types differ (ignoring case and spacing); false for anything else. */
export function typeMismatch(c: ConnectorNode, byId: ReadonlyMap<string, DesignNode>): boolean {
  if (!c.isForeignKey || c.from.kind !== 'column' || c.to.kind !== 'column') return false;
  const column = (a: Extract<Anchor, { kind: 'column' }>) => {
    const t = byId.get(a.tableId);
    return t?.type === 'table' ? t.columns.find((col) => col.id === a.columnId) : undefined;
  };
  const a = column(c.from);
  const b = column(c.to);
  return !!a && !!b && normalType(a.dataType) !== normalType(b.dataType);
}

export function createConnector(from: Anchor, to: Anchor, name: string, byId: ReadonlyMap<string, DesignNode>): ConnectorNode {
  return {
    ...relationDefaults(from, to, byId),
    id: createId(),
    type: 'connector',
    name,
    parentId: null,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    fill: CONNECTOR_LOOSE_FILL,
    stroke: CONNECTOR_COLOR,
    strokeWidth: 1.5,
    opacity: 1,
    visible: true,
    from,
    to,
    routing: 'orthogonal',
    points: [],
  };
}

/** What an anchor is attached to, or null when that layer or column is gone (or can't take connectors). */
function target(anchor: Anchor, byId: ReadonlyMap<string, DesignNode>): { box: Box; rowY?: number } | null {
  if (anchor.kind === 'point') return null;
  const node = byId.get(anchor.kind === 'column' ? anchor.tableId : anchor.nodeId);
  if (!node || node.type === 'connector' || node.type === 'group') return null;
  if (anchor.kind === 'node') return { box: rotatedBounds(node, node.rotation) };
  if (node.type !== 'table') return null;
  const index = node.columns.findIndex((c) => c.id === anchor.columnId);
  return index < 0 ? null : { box: node, rowY: tableRowTop(node, index) + TABLE_ROW_HEIGHT / 2 };
}

/** The box an end attaches to: a table row, or a layer's bounds. Null for a loose end or a gone target. */
export function anchorBox(anchor: Anchor, byId: ReadonlyMap<string, DesignNode>): Box | null {
  const t = target(anchor, byId);
  if (!t) return null;
  return t.rowY === undefined ? t.box : { x: t.box.x, y: t.rowY - TABLE_ROW_HEIGHT / 2, width: t.box.width, height: TABLE_ROW_HEIGHT };
}

/** Whether `anchor` still has what it is attached to. */
export const anchorLive = (anchor: Anchor, byId: ReadonlyMap<string, DesignNode>) => anchor.kind === 'point' || target(anchor, byId) !== null;

/** The point the other end aims for when picking a side. */
function aim(anchor: Anchor, byId: ReadonlyMap<string, DesignNode>): Point {
  if (anchor.kind === 'point') return anchor;
  const t = target(anchor, byId);
  if (!t) return { x: 0, y: 0 };
  const c = boxCenter(t.box);
  return { x: c.x, y: t.rowY ?? c.y };
}

/**
 * Where an end sits and which way it leaves. A column end sits on its row's
 * left or right edge, a layer end mid-side, each on the side facing `toward`.
 */
function endpoint(anchor: Anchor, toward: Point, byId: ReadonlyMap<string, DesignNode>, forced?: 'left' | 'right'): { at: Point; side: Side | null } {
  if (anchor.kind === 'point') return { at: { x: anchor.x, y: anchor.y }, side: null };
  const t = target(anchor, byId);
  if (!t) return { at: { x: 0, y: 0 }, side: null };
  const { box } = t;
  const c = boxCenter(box);
  const y = t.rowY ?? c.y;
  if (forced) return forced === 'right' ? { at: { x: box.x + box.width, y }, side: 'right' } : { at: { x: box.x, y }, side: 'left' };
  if (t.rowY !== undefined) {
    return toward.x >= c.x ? { at: { x: box.x + box.width, y: t.rowY }, side: 'right' } : { at: { x: box.x, y: t.rowY }, side: 'left' };
  }
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  // Normalized by the box's own size, so a wide box still prefers its long sides for far-off targets.
  if (Math.abs(dx) / Math.max(box.width, 1) >= Math.abs(dy) / Math.max(box.height, 1)) {
    return dx >= 0 ? { at: { x: box.x + box.width, y: c.y }, side: 'right' } : { at: { x: box.x, y: c.y }, side: 'left' };
  }
  return dy >= 0 ? { at: { x: c.x, y: box.y + box.height }, side: 'bottom' } : { at: { x: c.x, y: box.y }, side: 'top' };
}

/** A loose end's side: the one that points at the other end, so its stub doesn't double back. */
function looseSide(at: Point, toward: Point): Side {
  const dx = toward.x - at.x;
  const dy = toward.y - at.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

const horizontal = (s: Side) => s === 'left' || s === 'right';

const between = (a: number, b: number, c: number) => (a <= b && b <= c) || (c <= b && b <= a);

/**
 * Drops repeated points and any point lying on the straight run between its
 * neighbours, so every point left is a real turn. A point where the route
 * turns back on itself stays: dropping it would hide a stub.
 */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = out[out.length - 2];
    if (prev && last && ((prev.x === last.x && last.x === p.x && between(prev.y, last.y, p.y)) || (prev.y === last.y && last.y === p.y && between(prev.x, last.x, p.x)))) {
      out.pop();
      // Dropping `last` may leave `p` repeating the point now before it.
      const back = out[out.length - 1];
      if (back && back.x === p.x && back.y === p.y) continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * Two attached ends whose targets overlap sideways (stacked tables) would
 * otherwise face opposite sides and route back through both; they share the
 * side the first end picked instead.
 */
function sharedSide(from: Anchor, to: Anchor, fromSide: Side | null, toSide: Side | null, byId: ReadonlyMap<string, DesignNode>): 'left' | 'right' | null {
  if ((fromSide !== 'left' && fromSide !== 'right') || (toSide !== 'left' && toSide !== 'right') || fromSide === toSide) return null;
  const a = target(from, byId)?.box;
  const b = target(to, byId)?.box;
  if (!a || !b) return null;
  // Overlapping in height too, the boxes overlap outright, and the facing sides are the shortest way.
  const overlapX = a.x < b.x + b.width && b.x < a.x + a.width;
  const overlapY = a.y < b.y + b.height && b.y < a.y + a.height;
  return overlapX && !overlapY ? fromSide : null;
}

/**
 * Every visible table, as the obstacles a route avoids. Hidden if the table or
 * any ancestor is; tree.ts has isEffectivelyVisible, but it imports this module.
 * `normalizeTree` collects them once and hands them to every `routeConnector`.
 */
export function visibleTables(byId: ReadonlyMap<string, DesignNode>): Box[] {
  const shown = (n: DesignNode): boolean => {
    let node: DesignNode | undefined = n;
    // A parent cycle in a damaged document must not loop: no chain is longer than the document.
    for (let hops = 0; node && hops <= byId.size; hops++) {
      if (!node.visible) return false;
      node = node.parentId === null ? undefined : byId.get(node.parentId);
    }
    return true;
  };
  const out: Box[] = [];
  for (const n of byId.values()) if (n.type === 'table' && shown(n)) out.push(n);
  return out;
}

/**
 * Design choice: a route is searched among the tables within this far of the
 * box spanned by its two stub tips, then 4 times as far, then all of them.
 * Searching every table makes a drag frame cost grow with the whole document.
 */
const CORRIDOR_PADS = [4 * STUB, 16 * STUB, Infinity];

/**
 * A shaped leg a table blocks is only rerouted among nearby tables. Its ends
 * are bends the user chose, which may be walled in, and searching every table
 * to find that out costs ~100 ms per leg on each normalize.
 */
const SHAPED_PADS = CORRIDOR_PADS.slice(0, 2);

/** Design choice: tried in order, so a tight gap costs clearance rather than forcing the route through tables. */
const MARGINS = [ROUTE_MARGIN, 4, 0];

/**
 * Design choice: clearance is worth some length but not any: a route with the
 * wider margin is kept only if it is at most this many times as long as the
 * one with the narrower margin, and a route this close to the plain elbow's
 * length is not worth a second search.
 */
const CLEARANCE_LENGTH_RATIO = 1.5;

/** Design choice: a kept detour may be this many times the estimated shortest detour before it is searched again. */
const REUSE_LENGTH_RATIO = 1.5;

/** Design choice: the clearance a kept route must still have, so one that ends up flush against a table is searched again. */
const KEEP_MARGIN = 4;

const routeLength = (route: readonly Point[]) => route.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.abs(p.x - route[i - 1]!.x) + Math.abs(p.y - route[i - 1]!.y)), 0);

const inflateBox = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, width: b.width + 2 * m, height: b.height + 2 * m });

/** Whether `route` keeps `margin` clear of every table; the tables its ends sit on only need to be left alone, as the stubs start on them. */
function routeClear(route: readonly Point[], tables: readonly Box[], margin: number): boolean {
  const first = route[0]!;
  const last = route[route.length - 1]!;
  return tables.every((o) => {
    const box = boxTouches(o, first) || boxTouches(o, last) ? o : inflateBox(o, margin);
    return route.every((p, i) => i === 0 || !segmentHitsBox(route[i - 1]!, p, box));
  });
}

/**
 * A cheap lower bound on the length of any route round what blocks `plain`:
 * its own length plus the shortest way past the worst blocker, out to one of
 * the sides of that table and back. Real detours are at least this long, so a
 * kept route near the bound has little to gain from a new search, and one far
 * above it has.
 */
function detourEstimate(plain: readonly Point[], tables: readonly Box[]): number {
  let extra = 0;
  for (const o of tables) {
    if (routeClear(plain, [o], ROUTE_MARGIN)) continue;
    const box = inflateBox(o, ROUTE_MARGIN);
    let shortest = Infinity;
    for (let i = 1; i < plain.length; i++) {
      const p = plain[i - 1]!;
      const q = plain[i]!;
      if (!segmentHitsBox(p, q, box)) continue;
      const out = p.y === q.y ? Math.min(p.y - box.y, box.y + box.height - p.y) : Math.min(p.x - box.x, box.x + box.width - p.x);
      shortest = Math.min(shortest, 2 * out);
    }
    if (shortest < Infinity) extra = Math.max(extra, shortest);
  }
  return routeLength(plain) + extra;
}

/** Whether `route` is a clean right-angled run that still starts and ends where these ends are and leaves them the same way. */
function reusable(route: readonly Point[], start: Point, s0: Side, end: Point, s1: Side): boolean {
  const n = route.length;
  // Stale or hand-edited points must not be trusted past their ends: every step has to be a real axis-aligned run.
  for (let i = 1; i < n; i++) {
    if ((route[i]!.x === route[i - 1]!.x) === (route[i]!.y === route[i - 1]!.y)) return false;
  }
  if (n < 2 || route[0]!.x !== start.x || route[0]!.y !== start.y || route[n - 1]!.x !== end.x || route[n - 1]!.y !== end.y) return false;
  const leaves = (from: Point, to: Point, side: Side) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return dx * NORMAL[side].y === 0 && dy * NORMAL[side].x === 0 && dx * NORMAL[side].x + dy * NORMAL[side].y > 0;
  };
  return leaves(start, route[1]!, s0) && leaves(end, route[n - 2]!, s1);
}

/**
 * The best right-angled route from `start` (leaving along `s0`) to `end`
 * (arriving against `s1`) around `tables`, or null: the margin ladder over the
 * corridor tiers, preferring clearance unless it costs too much length.
 * `baseLength` is what a route is compared with to judge it short enough.
 */
function searchLadder(start: Point, s0: Side, end: Point, s1: Side, tables: readonly Box[], baseLength: number, pads: readonly number[] = CORRIDOR_PADS): Point[] | null {
  const tipA = { x: start.x + NORMAL[s0].x * STUB, y: start.y + NORMAL[s0].y * STUB };
  const tipB = { x: end.x + NORMAL[s1].x * STUB, y: end.y + NORMAL[s1].y * STUB };
  // A tip inside a table's margin cannot be left at that margin, and a search would only exhaust the grid to say so. A table an end sits on is never a cause: its stub tip is a full stub away.
  const tipBlocked = (margin: number) =>
    tables.some((o) => [tipA, tipB].some((t) => {
      const box = inflateBox(o, margin);
      return t.x > box.x && t.x < box.x + box.width && t.y > box.y && t.y < box.y + box.height;
    }));
  const searchAt = (margin: number): Point[] | null => {
    if (tipBlocked(margin)) return null;
    for (const pad of pads) {
      const x1 = Math.min(tipA.x, tipB.x) - pad;
      const y1 = Math.min(tipA.y, tipB.y) - pad;
      const x2 = Math.max(tipA.x, tipB.x) + pad;
      const y2 = Math.max(tipA.y, tipB.y) + pad;
      const near: Box[] = [];
      const far: Box[] = [];
      for (const o of tables) (o.x < x2 && o.x + o.width > x1 && o.y < y2 && o.y + o.height > y1 ? near : far).push(o);
      const route = routeAround(start, s0, end, s1, near, margin);
      // Left-out tables are not in the search, so a route that strays into one is searched again with a wider corridor.
      if (route && routeClear(route, far, margin)) return route;
      if (far.length === 0) break;
    }
    return null;
  };
  let best: Point[] | null = null;
  for (const margin of MARGINS) {
    const route = searchAt(margin);
    if (!route) continue;
    if (best && routeLength(best) <= CLEARANCE_LENGTH_RATIO * routeLength(route)) break;
    best = route;
    if (routeLength(best) <= CLEARANCE_LENGTH_RATIO * baseLength) break;
  }
  return best;
}

/**
 * The route through the user's `bends`: out of `start` by a stub, through every
 * bend in order, into `end` by a stub. Two consecutive points that differ both
 * ways are joined by a corner: the one clear of the tables if either is, and
 * otherwise the one that keeps going the way the route was heading (and, for
 * the last leg, arrives the way the end's stub leaves). Legs a table now
 * blocks are detoured by `avoidTables`; the detour is never stored in `bends`.
 */
function shapeChain(start: Point, s0: Side, end: Point, s1: Side, bends: readonly Point[], tables: readonly Box[]): Point[] {
  const tipA = { x: start.x + NORMAL[s0].x * STUB, y: start.y + NORMAL[s0].y * STUB };
  const tipB = { x: end.x + NORMAL[s1].x * STUB, y: end.y + NORMAL[s1].y * STUB };
  const waypoints = [tipA, ...bends, tipB];
  const route: Point[] = [start, tipA];
  let heading = NORMAL[s0];
  waypoints.slice(1).forEach((q, i) => {
    const p = waypoints[i]!;
    const last = i === waypoints.length - 2;
    if (p.x !== q.x && p.y !== q.y) {
      const options = [{ x: q.x, y: p.y }, { x: p.x, y: q.y }];
      // Lower is better, in this order of weight: runs through a table, doubles back on the heading, arrives against the end's stub.
      const score = (c: Point) => {
        const first = { x: Math.sign(c.x - p.x), y: Math.sign(c.y - p.y) };
        const arrives = { x: Math.sign(q.x - c.x), y: Math.sign(q.y - c.y) };
        const hit = tables.some((o) => segmentHitsBox(p, c, o) || segmentHitsBox(c, q, o));
        const reverses = first.x === -heading.x && first.y === -heading.y && (first.x !== 0 || first.y !== 0);
        const misses = last && !(arrives.x === -NORMAL[s1].x && arrives.y === -NORMAL[s1].y);
        return (hit ? 4 : 0) + (reverses ? 2 : 0) + (misses ? 1 : 0);
      };
      const corner = score(options[1]!) < score(options[0]!) ? options[1]! : options[0]!;
      route.push(corner);
    }
    route.push(q);
    const prev = route[route.length - 2]!;
    heading = { x: Math.sign(q.x - prev.x), y: Math.sign(q.y - prev.y) };
  });
  route.push(end);
  // The end's turn-out is the start's on the reversed chain.
  const startTurned = turnOut(route, s0, tables);
  const turned = [...turnOut([...startTurned].reverse(), s1, tables)].reverse();
  return simplify(turned);
}

/**
 * The shaped route with the legs a table blocks routed around it. Known limit:
 * a detour is searched against tables only, so it may cross the route's own
 * unblocked legs.
 */
function shapedRoute(start: Point, s0: Side, end: Point, s1: Side, bends: readonly Point[], tables: readonly Box[]): Point[] {
  return avoidTables(shapeChain(start, s0, end, s1, bends, tables), s0, s1, tables);
}

/** The side that points along (dx, dy), which must be axis-aligned; (0, 0) gives 'top'. */
const sideOfDirection = (dx: number, dy: number): Side => (dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'bottom' : 'top');

/** How much of the right-angled segment p-q runs through the inside of `box`. */
function lengthInside(p: Point, q: Point, box: Box): number {
  if (p.y === q.y) return p.y > box.y && p.y < box.y + box.height ? Math.max(0, Math.min(Math.max(p.x, q.x), box.x + box.width) - Math.max(Math.min(p.x, q.x), box.x)) : 0;
  return p.x > box.x && p.x < box.x + box.width ? Math.max(0, Math.min(Math.max(p.y, q.y), box.y + box.height) - Math.max(Math.min(p.y, q.y), box.y)) : 0;
}

/**
 * If the second leg of `chain` (start, stub tip, next, ...) goes straight back
 * the way the stub came, the route would double over itself; sidestep by a stub
 * first (to the side that runs through the tables for less) so it leaves along the stub.
 */
function turnOut(chain: Point[], side: Side, tables: readonly Box[]): Point[] {
  const [, tip, next] = chain;
  if (!tip || !next) return chain;
  const n = NORMAL[side];
  if (Math.sign(next.x - tip.x) !== -n.x || Math.sign(next.y - tip.y) !== -n.y || (n.x === 0 && next.x !== tip.x) || (n.y === 0 && next.y !== tip.y)) return chain;
  const across = (sign: number): Point[] => {
    const off = { x: Math.abs(n.y) * sign * STUB, y: Math.abs(n.x) * sign * STUB };
    return [{ x: tip.x + off.x, y: tip.y + off.y }, { x: next.x + off.x, y: next.y + off.y }];
  };
  const overlap = (corners: Point[]) =>
    [tip, ...corners, next].reduce((sum, p, i, all) => (i === 0 ? 0 : sum + tables.reduce((inside, o) => inside + lengthInside(all[i - 1]!, p, o), 0)), 0);
  const corners = overlap(across(1)) <= overlap(across(-1)) ? across(1) : across(-1);
  return [chain[0]!, tip, ...corners, ...chain.slice(2)];
}

/**
 * Replaces each run of legs that a table blocks with a route around it, from
 * the run's first to its last point, leaving along the first leg and arriving
 * along the last. The legs beside it keep their bends; where no way round is
 * found the user's leg stays. A leg is blocked when it comes within
 * `KEEP_MARGIN` of a table, or passes through the table an end sits on.
 */
function avoidTables(route: Point[], s0: Side, s1: Side, tables: readonly Box[]): Point[] {
  const last = route.length - 1;
  const blocked = route.slice(1).map((p, i) =>
    tables.some((o) => segmentHitsBox(route[i]!, p, boxTouches(o, route[0]!) || boxTouches(o, route[last]!) ? o : inflateBox(o, KEEP_MARGIN))),
  );
  if (!blocked.includes(true)) return route;
  const out: Point[] = [route[0]!];
  const dir = (k: number) => ({ dx: Math.sign(route[k + 1]!.x - route[k]!.x), dy: Math.sign(route[k + 1]!.y - route[k]!.y) });
  // `baseLength` is the user's own run: a detour is judged by how much longer than that it is.
  const detourFor = (lo: number, hi: number) =>
    searchLadder(
      route[lo]!,
      lo === 0 ? s0 : sideOfDirection(dir(lo).dx, dir(lo).dy),
      route[hi + 1]!,
      hi + 1 === last ? s1 : sideOfDirection(-dir(hi).dx, -dir(hi).dy),
      tables,
      routeLength(route.slice(lo, hi + 2)),
      SHAPED_PADS,
    );
  let replacedTo = 0;
  for (let i = 0; i < last; ) {
    if (!blocked[i]) {
      out.push(route[++i]!);
      continue;
    }
    let j = i;
    while (j + 1 < last && blocked[j + 1]) j++;
    let lo = i;
    let hi = j;
    let detour = detourFor(lo, hi);
    // A bend next to a table can leave the run with no room for a stub of its own: start from the points beside it, whose headings are real.
    if (!detour && (i > replacedTo || j + 1 < last)) {
      lo = i > replacedTo ? i - 1 : i;
      hi = j + 1 < last ? j + 1 : j;
      detour = detourFor(lo, hi);
    }
    if (detour) {
      out.length -= i - lo;
      out.push(...detour.slice(1));
      i = replacedTo = hi + 1;
    } else {
      out.push(...route.slice(i + 1, j + 2));
      i = replacedTo = j + 1;
    }
  }
  return simplify(out);
}

/** Design choice: the closest a dragged segment may come to the run beside it, so both stay visible and grabbable. */
const SEGMENT_GAP = 8;

/** Design choice: a shape needs a handful of corners; the cap only stops a damaged file making an enormous route. */
const MAX_BENDS = 64;

/**
 * The bends that reproduce `points` (a connector's routed points) with the
 * segment `segment` moved `delta` px sideways, perpendicular to itself.
 * Segment i runs from points[i] to points[i + 1]. Only interior segments can be
 * dragged: the first and the last are attached to their tables and stay put
 * (the current bends come back unchanged). A segment next to an end can't be
 * dragged back closer than one stub to that end, so the stub keeps its length.
 */
export function dragSegment(points: Point[], segment: number, delta: number): Point[] {
  const last = points.length - 1;
  const current = points.slice(1, last);
  if (segment < 1 || segment > last - 2) return current;
  const moved = points.map((p) => ({ ...p }));
  const a = moved[segment]!;
  const b = moved[segment + 1]!;
  const vertical = a.x === b.x;
  const key = vertical ? 'x' : 'y';
  let to = a[key] + delta;
  // Keep a stub's length between an end and the first corner it leads to.
  const hold = (end: Point, corner: Point) => {
    const side = Math.sign(corner[key] - end[key]);
    const room = Math.min(STUB, Math.abs(corner[key] - end[key]));
    if (side !== 0 && (to - end[key]) * side < room) to = end[key] + side * room;
  };
  if (segment === 1) hold(points[0]!, a);
  if (segment === last - 2) hold(points[last]!, a);
  // Nor onto the parallel run on either side (its coordinate is that of the corner next to it), which would fold the route into a spike.
  const origin = a[key];
  const keepApart = (other: number) => {
    const side = Math.sign(origin - other);
    const room = Math.min(SEGMENT_GAP, Math.abs(origin - other));
    if (side !== 0 && (to - other) * side < room) to = other + side * room;
  };
  if (segment >= 2) keepApart(points[segment - 1]![key]);
  if (segment + 2 <= last - 1) keepApart(points[segment + 2]![key]);
  a[key] = to;
  b[key] = to;
  return simplify(moved).slice(1, -1);
}

/** Design choice: out from each side by a stub, then right angles, ignoring everything else on the canvas. */
function elbow(startAt: Point, endAt: Point, s0: Side, s1: Side): Point[] {
  const a = { x: startAt.x + NORMAL[s0].x * STUB, y: startAt.y + NORMAL[s0].y * STUB };
  const b = { x: endAt.x + NORMAL[s1].x * STUB, y: endAt.y + NORMAL[s1].y * STUB };
  // Facing ends closer than two stubs: the stubs would cross and zigzag, so meet in the gap instead.
  const crossX = (s0 === 'right' && s1 === 'left' && a.x > b.x) || (s0 === 'left' && s1 === 'right' && a.x < b.x);
  const crossY = (s0 === 'bottom' && s1 === 'top' && a.y > b.y) || (s0 === 'top' && s1 === 'bottom' && a.y < b.y);
  if (crossX) {
    const midX = (startAt.x + endAt.x) / 2;
    return simplify([startAt, { x: midX, y: startAt.y }, { x: midX, y: endAt.y }, endAt]);
  }
  if (crossY) {
    const midY = (startAt.y + endAt.y) / 2;
    return simplify([startAt, { x: startAt.x, y: midY }, { x: endAt.x, y: midY }, endAt]);
  }
  let middle: Point[];
  if (s0 === s1) {
    // Same side: go round the outside, past whichever stub reaches further.
    const pick = s0 === 'right' || s0 === 'bottom' ? Math.max : Math.min;
    middle = horizontal(s0)
      ? [{ x: pick(a.x, b.x), y: a.y }, { x: pick(a.x, b.x), y: b.y }]
      : [{ x: a.x, y: pick(a.y, b.y) }, { x: b.x, y: pick(a.y, b.y) }];
  } else if (horizontal(s0) && horizontal(s1)) {
    const midX = (a.x + b.x) / 2;
    middle = [{ x: midX, y: a.y }, { x: midX, y: b.y }];
  } else if (!horizontal(s0) && !horizontal(s1)) {
    const midY = (a.y + b.y) / 2;
    middle = [{ x: a.x, y: midY }, { x: b.x, y: midY }];
  } else {
    middle = [horizontal(s0) ? { x: b.x, y: a.y } : { x: a.x, y: b.y }];
  }
  return simplify([startAt, a, ...middle, b, endAt]);
}

/** Where a connector's two ends sit and which side each leaves by (a loose end picks the side facing the other). */
function routeEnds(from: Anchor, to: Anchor, byId: ReadonlyMap<string, DesignNode>): { start: Point; end: Point; s0: Side; s1: Side } {
  const first = endpoint(from, aim(to, byId), byId);
  let second = endpoint(to, aim(from, byId), byId);
  const shared = sharedSide(from, to, first.side, second.side, byId);
  if (shared) second = endpoint(to, first.at, byId, shared);
  return { start: first.at, end: second.at, s0: first.side ?? looseSide(first.at, second.at), s1: second.side ?? looseSide(second.at, first.at) };
}

/**
 * The route the user shaped, before any detour round tables: what a segment
 * drag has to start from, or the detour would be baked into the bends. A
 * connector without bends (or a straight one) has no shape of its own, so this is its routed points.
 */
export function shapePoints(connector: ConnectorNode, byId: ReadonlyMap<string, DesignNode>): Point[] {
  if (connector.routing !== 'orthogonal' || !connector.bends?.length) return connector.points;
  const { start, end, s0, s1 } = routeEnds(connector.from, connector.to, byId);
  return shapeChain(start, s0, end, s1, connector.bends, visibleTables(byId));
}

/** The route from `from` to `to`: straight, or design choice: out from each side by a stub, then right angles, around tables in the way. */
export function routeBetween(
  from: Anchor,
  to: Anchor,
  routing: ConnectorNode['routing'],
  byId: ReadonlyMap<string, DesignNode>,
  previous?: readonly Point[],
  tables: readonly Box[] = visibleTables(byId),
  bends?: readonly Point[],
): Point[] {
  const { start, end, s0, s1 } = routeEnds(from, to, byId);
  if (routing === 'straight') return [start, end];
  if (bends && bends.length > 0) return shapedRoute(start, s0, end, s1, bends, tables);
  const plain = elbow(start, end, s0, s1);
  if (routeClear(plain, tables, ROUTE_MARGIN)) return plain;
  // Keeping a still-valid detour stops the route flipping between equally good ones as unrelated tables move about.
  if (previous && reusable(previous, start, s0, end, s1) && routeClear(previous, tables, KEEP_MARGIN)) {
    // A long detour stays only while it is about as short as the blockers allow; when one moves away a much shorter way appears and it is searched again.
    if (routeLength(previous) <= REUSE_LENGTH_RATIO * detourEstimate(plain, tables)) return [...previous];
  }

  return searchLadder(start, s0, end, s1, tables, routeLength(plain)) ?? plain;
}

/**
 * `connector` routed against the final layers: an end whose target is gone
 * becomes a broken loose end where its route last ended, and the box is the
 * route's bounds.
 */
export function routeConnector(connector: ConnectorNode, byId: ReadonlyMap<string, DesignNode>, tables: readonly Box[] = visibleTables(byId)): ConnectorNode {
  const loosen = (anchor: Anchor, last: Point | undefined): Anchor =>
    anchorLive(anchor, byId) ? anchor : { kind: 'point', x: last?.x ?? 0, y: last?.y ?? 0, broken: true };
  const from = loosen(connector.from, connector.points[0]);
  const to = loosen(connector.to, connector.points[connector.points.length - 1]);
  // Many-to-many only between whole tables, whatever a loaded document says.
  const toCardinality =
    isMany(connector.fromCardinality) && isMany(connector.toCardinality) && !allowsManyToMany(from, to, byId) ? 'one' : connector.toCardinality;
  const points = routeBetween(from, to, connector.routing, byId, connector.points, tables, connector.bends);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const box = { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  const same =
    from === connector.from &&
    to === connector.to &&
    toCardinality === connector.toCardinality &&
    connector.rotation === 0 &&
    connector.parentId === null &&
    box.x === connector.x &&
    box.y === connector.y &&
    box.width === connector.width &&
    box.height === connector.height &&
    points.length === connector.points.length &&
    points.every((p, i) => p.x === connector.points[i]?.x && p.y === connector.points[i]?.y);
  return same ? connector : { ...connector, ...box, from, to, toCardinality, points, rotation: 0, parentId: null };
}

/** `connector` with its loose ends moved by (dx, dy); attached ends follow their targets on their own. */
export function shiftLooseEnds(connector: ConnectorNode, dx: number, dy: number): Pick<ConnectorNode, 'from' | 'to'> {
  const shift = (a: Anchor): Anchor => (a.kind === 'point' ? { ...a, x: a.x + dx, y: a.y + dy } : a);
  return { from: shift(connector.from), to: shift(connector.to) };
}

/**
 * Whether a connector's bends travel when the layers in `movedIds` move: they
 * do if every layer it is attached to moves (the whole shape goes with them),
 * whether or not the connector itself is selected. A connector with both ends
 * loose has nothing to follow, so it moves only if it is in the set. With an
 * attached layer staying put the bends stay, and the route adapts around them.
 */
export function bendsMoveWith(connector: ConnectorNode, movedIds: ReadonlySet<string>): boolean {
  const layer = (a: Anchor) => (a.kind === 'point' ? null : a.kind === 'column' ? a.tableId : a.nodeId);
  const attached = [layer(connector.from), layer(connector.to)].filter((id): id is string => id !== null);
  return attached.length === 0 ? movedIds.has(connector.id) : attached.every((id) => movedIds.has(id));
}

/**
 * A connector's ends and bends after a move by (dx, dy): loose ends shift, as
 * `shiftLooseEnds` does, and the bends only when `moveBends` (see `bendsMoveWith`).
 * `bends` is left out when there are none.
 */
export function shiftConnector(connector: ConnectorNode, dx: number, dy: number, moveBends: boolean): Pick<ConnectorNode, 'from' | 'to'> & { bends?: Point[] } {
  const ends = shiftLooseEnds(connector, dx, dy);
  if (!connector.bends) return ends;
  return { ...ends, bends: moveBends ? connector.bends.map((p) => ({ x: p.x + dx, y: p.y + dy })) : connector.bends };
}

/** Whether two anchors attach to the same place. */
export function sameAnchor(a: Anchor, b: Anchor): boolean {
  if (a.kind === 'column') return b.kind === 'column' && a.tableId === b.tableId && a.columnId === b.columnId;
  if (a.kind === 'node') return b.kind === 'node' && a.nodeId === b.nodeId;
  return b.kind === 'point' && a.x === b.x && a.y === b.y && a.broken === b.broken;
}

const targetId = (a: Anchor) => (a.kind === 'column' ? a.tableId : a.kind === 'node' ? a.nodeId : null);

/**
 * Whether linking `from` to `to` would loop a layer onto itself. Two different
 * columns of one table may link (a self-referencing foreign key).
 */
export function linksToItself(from: Anchor, to: Anchor): boolean {
  const id = targetId(from);
  if (id === null || id !== targetId(to)) return false;
  return !(from.kind === 'column' && to.kind === 'column' && from.columnId !== to.columnId);
}

/** Whether either end lost what it was attached to. */
export const isBroken = (c: ConnectorNode) => (c.from.kind === 'point' && c.from.broken === true) || (c.to.kind === 'point' && c.to.broken === true);

/**
 * The anchor for a press or release at world `point`, from `elements` under
 * the pointer, topmost first: the first table or layer, looking past
 * selection handles and other connectors; loose when there is none. On a
 * table, the header means the whole table and anything lower its row there.
 */
export function anchorAt(elements: Element[], point: Point, byId: ReadonlyMap<string, DesignNode>): Anchor {
  for (const el of elements) {
    const nodeId = el.closest('[data-node-id]')?.getAttribute('data-node-id');
    const node = nodeId ? byId.get(nodeId) : undefined;
    if (!node || node.type === 'connector' || node.type === 'group') continue;
    if (node.type === 'table') {
      // By height, not by element: on the table's outline or an end dot at its edge, no row element is hit.
      const column = node.columns[Math.floor((point.y - tableRowTop(node, 0)) / TABLE_ROW_HEIGHT)];
      if (column && point.y >= tableRowTop(node, 0)) return { kind: 'column', tableId: node.id, columnId: column.id };
    }
    return { kind: 'node', nodeId: node.id };
  }
  return { kind: 'point', x: Math.round(point.x), y: Math.round(point.y) };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A saved connector's ends and route, repaired so one damaged connector never
 * costs the rest of a document: an end that isn't a valid anchor becomes a
 * broken loose end at the route's matching end (or the box corner).
 */
export function repairConnectorData(
  data: Record<string, unknown>,
): Pick<
  ConnectorNode,
  'from' | 'to' | 'routing' | 'points' | 'x' | 'y' | 'width' | 'height' | 'fromCardinality' | 'toCardinality' | 'isForeignKey' | 'bends'
> {
  const cardinality = (v: unknown): Cardinality => (CYCLE.includes(v as Cardinality) ? (v as Cardinality) : 'none');
  const points = (Array.isArray(data.points) ? data.points : []).filter((p): p is Point => isRecord(p) && isNumber(p.x) && isNumber(p.y));
  const fallback = { x: isNumber(data.x) ? data.x : 0, y: isNumber(data.y) ? data.y : 0 };
  const anchor = (v: unknown, end: Point | undefined): Anchor => {
    if (isRecord(v)) {
      if (v.kind === 'column' && typeof v.tableId === 'string' && typeof v.columnId === 'string') return { kind: 'column', tableId: v.tableId, columnId: v.columnId };
      if (v.kind === 'node' && typeof v.nodeId === 'string') return { kind: 'node', nodeId: v.nodeId };
      if (v.kind === 'point' && isNumber(v.x) && isNumber(v.y)) return { kind: 'point', x: v.x, y: v.y, ...(v.broken === true ? { broken: true } : {}) };
    }
    const at = end ?? fallback;
    return { kind: 'point', x: at.x, y: at.y, broken: true };
  };
  return {
    from: anchor(data.from, points[0]),
    to: anchor(data.to, points[points.length - 1]),
    routing: data.routing === 'straight' ? 'straight' : 'orthogonal',
    points,
    // Shaped corners are optional; anything that isn't a list of points is dropped, back to automatic routing.
    bends: Array.isArray(data.bends) && data.bends.length > 0 && data.bends.every((p) => isRecord(p) && isNumber(p.x) && isNumber(p.y)) ? data.bends.slice(0, MAX_BENDS).map((p) => ({ x: p.x, y: p.y })) : undefined,
    // Saved before relationships existed: plain links, no markers.
    fromCardinality: cardinality(data.fromCardinality),
    toCardinality: cardinality(data.toCardinality),
    isForeignKey: data.isForeignKey === true,
    // The box is derived from the route; this only keeps it a number until the first route.
    x: fallback.x,
    y: fallback.y,
    width: isNumber(data.width) ? data.width : 0,
    height: isNumber(data.height) ? data.height : 0,
  };
}
