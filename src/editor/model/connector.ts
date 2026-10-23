import { boxCenter, rotatedBounds } from '../geometry';
import { createId } from './names';
import { tableRowTop, TABLE_ROW_HEIGHT } from './table';
import type { Anchor, Box, Cardinality, ConnectorNode, DesignNode, Point } from './types';

/**
 * Design choice: how far a route leaves its side before its first turn, in
 * world px. Longer than an end marker reaches, so the marker never sits on a bend.
 */
export const STUB = 24;

type Side = 'left' | 'right' | 'top' | 'bottom';

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

/** The route from `from` to `to`: straight, or design choice: out from each side by a stub, then right angles. */
export function routeBetween(from: Anchor, to: Anchor, routing: ConnectorNode['routing'], byId: ReadonlyMap<string, DesignNode>): Point[] {
  const start = endpoint(from, aim(to, byId), byId);
  let end = endpoint(to, aim(from, byId), byId);
  const shared = sharedSide(from, to, start.side, end.side, byId);
  if (shared) end = endpoint(to, start.at, byId, shared);
  if (routing === 'straight') return [start.at, end.at];
  const s0 = start.side ?? looseSide(start.at, end.at);
  const s1 = end.side ?? looseSide(end.at, start.at);
  const a = { x: start.at.x + NORMAL[s0].x * STUB, y: start.at.y + NORMAL[s0].y * STUB };
  const b = { x: end.at.x + NORMAL[s1].x * STUB, y: end.at.y + NORMAL[s1].y * STUB };
  // Facing ends closer than two stubs: the stubs would cross and zigzag, so meet in the gap instead.
  const crossX = (s0 === 'right' && s1 === 'left' && a.x > b.x) || (s0 === 'left' && s1 === 'right' && a.x < b.x);
  const crossY = (s0 === 'bottom' && s1 === 'top' && a.y > b.y) || (s0 === 'top' && s1 === 'bottom' && a.y < b.y);
  if (crossX) {
    const midX = (start.at.x + end.at.x) / 2;
    return simplify([start.at, { x: midX, y: start.at.y }, { x: midX, y: end.at.y }, end.at]);
  }
  if (crossY) {
    const midY = (start.at.y + end.at.y) / 2;
    return simplify([start.at, { x: start.at.x, y: midY }, { x: end.at.x, y: midY }, end.at]);
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
  return simplify([start.at, a, ...middle, b, end.at]);
}

/**
 * `connector` routed against the final layers: an end whose target is gone
 * becomes a broken loose end where its route last ended, and the box is the
 * route's bounds.
 */
export function routeConnector(connector: ConnectorNode, byId: ReadonlyMap<string, DesignNode>): ConnectorNode {
  const loosen = (anchor: Anchor, last: Point | undefined): Anchor =>
    anchorLive(anchor, byId) ? anchor : { kind: 'point', x: last?.x ?? 0, y: last?.y ?? 0, broken: true };
  const from = loosen(connector.from, connector.points[0]);
  const to = loosen(connector.to, connector.points[connector.points.length - 1]);
  // Many-to-many only between whole tables, whatever a loaded document says.
  const toCardinality =
    isMany(connector.fromCardinality) && isMany(connector.toCardinality) && !allowsManyToMany(from, to, byId) ? 'one' : connector.toCardinality;
  const points = routeBetween(from, to, connector.routing, byId);
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
  'from' | 'to' | 'routing' | 'points' | 'x' | 'y' | 'width' | 'height' | 'fromCardinality' | 'toCardinality' | 'isForeignKey'
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
