import type { Box, Point, Viewport } from './model/types';

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 256;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function screenToWorld(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.x) / vp.zoom, y: (p.y - vp.y) / vp.zoom };
}

export function worldToScreen(p: Point, vp: Viewport): Point {
  return { x: p.x * vp.zoom + vp.x, y: p.y * vp.zoom + vp.y };
}

/** Zoom to `nextZoom` while keeping the world point under `anchor` (screen) fixed. */
export function zoomAt(vp: Viewport, anchor: Point, nextZoom: number): Viewport {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const world = screenToWorld(anchor, vp);
  return { zoom, x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom };
}

/** Fit `box` inside a screen of `size`, with padding; caps at 100%. */
export function fitBox(box: Box, size: { width: number; height: number }, padding = 64): Viewport {
  const w = Math.max(box.width, 1);
  const h = Math.max(box.height, 1);
  const zoom = clamp(
    Math.min((size.width - padding * 2) / w, (size.height - padding * 2) / h, 1),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  return {
    zoom,
    x: size.width / 2 - (box.x + w / 2) * zoom,
    y: size.height / 2 - (box.y + h / 2) * zoom,
  };
}

/** Box spanning two arbitrary corner points. */
export function boxFromPoints(a: Point, b: Point): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export function rotatePoint(p: Point, degrees: number, origin: Point = { x: 0, y: 0 }): Point {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}

export function boxCenter(b: Box): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Axis-aligned bounds of a box rotated about its center. */
export function rotatedBounds(b: Box, rotation: number): Box {
  if (rotation % 360 === 0) return { ...b };
  const c = boxCenter(b);
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ].map((p) => rotatePoint(p, rotation, c));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function unionBoxes(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

/** Handle direction: -1 = left/top edge, 0 = middle, 1 = right/bottom edge. */
export interface HandleDir {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

export const HANDLES: Array<HandleDir & { id: string; cursor: string }> = [
  { id: 'nw', dx: -1, dy: -1, cursor: 'nwse-resize' },
  { id: 'n', dx: 0, dy: -1, cursor: 'ns-resize' },
  { id: 'ne', dx: 1, dy: -1, cursor: 'nesw-resize' },
  { id: 'e', dx: 1, dy: 0, cursor: 'ew-resize' },
  { id: 'se', dx: 1, dy: 1, cursor: 'nwse-resize' },
  { id: 's', dx: 0, dy: 1, cursor: 'ns-resize' },
  { id: 'sw', dx: -1, dy: 1, cursor: 'nesw-resize' },
  { id: 'w', dx: -1, dy: 0, cursor: 'ew-resize' },
];

/**
 * Resize a rotated box by dragging one handle by `worldDelta`, keeping the
 * opposite handle fixed in world space. Works for rotation 0 as a special case.
 */
export function resizeBox(
  start: Box,
  rotation: number,
  handle: HandleDir,
  worldDelta: Point,
  minSize: { width: number; height: number } = { width: 1, height: 1 },
): Box {
  const local = rotatePoint(worldDelta, -rotation);
  const width = Math.max(minSize.width, start.width + handle.dx * local.x);
  const height = Math.max(minSize.height, start.height + handle.dy * local.y);

  // World position of the anchor (the point opposite the dragged handle).
  const c0 = boxCenter(start);
  const anchorOffset0 = { x: (-handle.dx * start.width) / 2, y: (-handle.dy * start.height) / 2 };
  const anchor = rotatePoint({ x: c0.x + anchorOffset0.x, y: c0.y + anchorOffset0.y }, rotation, c0);

  // New center sits so the anchor stays put.
  const offset1 = rotatePoint({ x: (-handle.dx * width) / 2, y: (-handle.dy * height) / 2 }, rotation);
  const c1 = { x: anchor.x - offset1.x, y: anchor.y - offset1.y };
  return { x: c1.x - width / 2, y: c1.y - height / 2, width, height };
}

/** Degrees in (-180, 180], so a full turn reads as 0 rather than 360. */
export function normalizeDegrees(degrees: number): number {
  const d = ((degrees % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/** Without `snap`, rounds to whole degrees, as a move gesture rounds to whole pixels. */
export function dragRotation(
  startRotation: number,
  center: Point,
  startPointer: Point,
  pointer: Point,
  snap?: number,
): number {
  const angle = (p: Point) => (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI;
  const raw = startRotation + angle(pointer) - angle(startPointer);
  const step = snap ?? 1;
  return normalizeDegrees(Math.round(raw / step) * step);
}

/** Whether a world point lies inside a box rotated about its center. */
export function pointInRotatedBox(b: Box, rotation: number, p: Point): boolean {
  const local = rotation % 360 === 0 ? p : rotatePoint(p, -rotation, boxCenter(b));
  return local.x >= b.x && local.x <= b.x + b.width && local.y >= b.y && local.y <= b.y + b.height;
}

/**
 * Re-maps `b` from the `from` frame of reference to `to`, scaling position and
 * size linearly. Used to scale a group's children when the group is resized.
 */
export function mapBoxBetween(b: Box, from: Box, to: Box): Box {
  const sx = from.width === 0 ? 1 : to.width / from.width;
  const sy = from.height === 0 ? 1 : to.height / from.height;
  return {
    x: to.x + (b.x - from.x) * sx,
    y: to.y + (b.y - from.y) * sy,
    width: b.width * sx,
    height: b.height * sy,
  };
}

/** Smallest on-screen grid spacing (px) worth drawing. */
export const MIN_GRID_SPACING = 12;

/**
 * Screen spacing for a canvas grid of `base` world units. It doubles (or
 * halves) by powers of two, so it stays between MIN_GRID_SPACING and twice
 * that at any zoom.
 */
export function gridSpacing(zoom: number, base = 16): number {
  let s = base * zoom;
  if (!(s > 0) || !Number.isFinite(s)) return MIN_GRID_SPACING;
  while (s < MIN_GRID_SPACING) s *= 2;
  while (s >= MIN_GRID_SPACING * 2) s /= 2;
  return s;
}

export type Axis = 'x' | 'y';

/**
 * A smart guide in world units: the line `axis = at`, with a mark at each
 * aligned edge or center along it. The line spans from the first mark to the last.
 */
export interface SnapGuide {
  axis: Axis;
  at: number;
  marks: number[];
}

/** Everything the overlay draws while a gesture snaps. */
export interface Guides {
  lines: SnapGuide[];
  spacing: SpacingGuide[];
}

/** Start edge, center and end edge of a box on one axis. */
export function boxLines(b: Box, axis: Axis): number[] {
  const start = axis === 'x' ? b.x : b.y;
  const size = axis === 'x' ? b.width : b.height;
  return [start, start + size / 2, start + size];
}

/**
 * The shift that brings the closest of `values` onto a line of a candidate box,
 * or null when none is within `threshold`.
 */
export function snapOffset(values: number[], candidates: Box[], axis: Axis, threshold: number): number | null {
  let best: number | null = null;
  let bestDist = threshold;
  for (const c of candidates) {
    for (const line of boxLines(c, axis)) {
      for (const v of values) {
        const dist = Math.abs(line - v);
        if (dist <= bestDist) {
          best = line - v;
          bestDist = dist;
        }
      }
    }
  }
  return best;
}

// Snapped values are exact, but an unsnapped axis is rounded before the check.
const ALIGN_EPSILON = 0.01;

/** One guide per `lines` value that some candidate's edge or center sits on. */
export function alignmentGuides(subject: Box, lines: { x: number[]; y: number[] }, candidates: Box[]): SnapGuide[] {
  const guides: SnapGuide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const cross: Axis = axis === 'x' ? 'y' : 'x';
    for (const at of new Set(lines[axis])) {
      const aligned = candidates.filter((c) => boxLines(c, axis).some((l) => Math.abs(l - at) < ALIGN_EPSILON));
      if (aligned.length === 0) continue;
      const marks = [subject, ...aligned].flatMap((b) =>
        cross === 'x' ? [b.x, b.x + b.width] : [b.y, b.y + b.height],
      );
      guides.push({ axis, at, marks });
    }
  }
  return guides;
}

/** A measured span along `axis` from `from` to `to`, drawn at `at` on the other axis. */
export interface Span {
  axis: Axis;
  from: number;
  to: number;
  at: number;
}

/** Equal gaps between layers in a row (axis x) or column (axis y), all `distance` long. */
export interface SpacingGuide {
  axis: Axis;
  distance: number;
  gaps: Span[];
}

const crossOf = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x');
const startOf = (b: Box, axis: Axis) => (axis === 'x' ? b.x : b.y);
const endOf = (b: Box, axis: Axis) => (axis === 'x' ? b.x + b.width : b.y + b.height);

/** Where two boxes overlap on the axis across `axis`, or null when they don't. */
function crossOverlap(a: Box, b: Box, axis: Axis): [number, number] | null {
  const c = crossOf(axis);
  const lo = Math.max(startOf(a, c), startOf(b, c));
  const hi = Math.min(endOf(a, c), endOf(b, c));
  return hi > lo ? [lo, hi] : null;
}

/** The gap from `a` to a later `b` on `axis`, drawn through the middle of their overlap. */
function gapBetween(a: Box, b: Box, axis: Axis): Span {
  const [lo, hi] = crossOverlap(a, b, axis) ?? [0, 0];
  return { axis, from: endOf(a, axis), to: startOf(b, axis), at: (lo + hi) / 2 };
}

// Labels show one decimal, so gaps that read the same count as equal.
const SPACING_EPSILON = 0.05;

/**
 * The layers sharing a row (or column) with `subject`, the gaps between
 * neighbours among them, and the nearest one on each side of `subject`.
 * A layer counts as before `subject` when it ends no more than `slack` past
 * `subject`'s start, so a snap can still find a neighbour it slightly overlaps.
 * Nearest neighbours only: a layer further along the row is never compared.
 */
function rowLayout(subject: Box, candidates: Box[], axis: Axis, slack: number) {
  const row = candidates.filter((c) => crossOverlap(c, subject, axis));
  const gaps: Span[] = [];
  for (const a of row) {
    const next = row
      .filter((b) => startOf(b, axis) >= endOf(a, axis) && crossOverlap(a, b, axis))
      .reduce<Box | null>((best, b) => (best && startOf(best, axis) <= startOf(b, axis) ? best : b), null);
    if (!next || startOf(next, axis) <= endOf(a, axis)) continue;
    // Only empty space counts: a layer reaching into the gap beside both of them (one
    // overlapping `a`, or a frame around `a` alone) means they aren't neighbours. A layer
    // enclosing both, like their parent frame or a backdrop, doesn't. The subject isn't a
    // candidate, so a gap spanning it is checked separately.
    const blocked = row.some(
      (c) =>
        c !== a &&
        c !== next &&
        startOf(c, axis) < startOf(next, axis) &&
        endOf(c, axis) > endOf(a, axis) &&
        !(startOf(c, axis) <= startOf(a, axis) && endOf(c, axis) >= endOf(next, axis)) &&
        !!crossOverlap(c, a, axis) &&
        !!crossOverlap(c, next, axis),
    );
    const spansSubject = endOf(a, axis) < endOf(subject, axis) && startOf(next, axis) > startOf(subject, axis);
    if (!blocked && !spansSubject) gaps.push(gapBetween(a, next, axis));
  }
  const before = row
    .filter((c) => endOf(c, axis) <= startOf(subject, axis) + slack)
    .reduce<Box | null>((best, c) => (best && endOf(best, axis) >= endOf(c, axis) ? best : c), null);
  const after = row
    .filter((c) => startOf(c, axis) >= endOf(subject, axis) - slack)
    .reduce<Box | null>((best, c) => (best && startOf(best, axis) <= startOf(c, axis) ? best : c), null);
  return { gaps, before, after };
}

/**
 * The shift that gives `subject` a gap to its neighbour already used between
 * other layers in its row, or centers it between its two neighbours; null when
 * neither is within `threshold`.
 */
export function snapSpacing(subject: Box, candidates: Box[], axis: Axis, threshold: number): number | null {
  const { gaps, before, after } = rowLayout(subject, candidates, axis, threshold);
  const size = endOf(subject, axis) - startOf(subject, axis);
  const targets: number[] = [];
  for (const g of gaps) {
    if (before) targets.push(endOf(before, axis) + (g.to - g.from));
    if (after) targets.push(startOf(after, axis) - (g.to - g.from) - size);
  }
  if (before && after) {
    const even = (startOf(after, axis) - endOf(before, axis) - size) / 2;
    if (even > 0) targets.push(endOf(before, axis) + even);
  }
  let best: number | null = null;
  for (const t of targets) {
    const offset = t - startOf(subject, axis);
    if (Math.abs(offset) <= threshold && (best === null || Math.abs(offset) < Math.abs(best))) best = offset;
  }
  return best;
}

/** One guide per gap of `subject` to a neighbour that matches another gap in its row or column. */
export function spacingGuides(subject: Box, candidates: Box[]): SpacingGuide[] {
  const guides: SpacingGuide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const { gaps, before, after } = rowLayout(subject, candidates, axis, ALIGN_EPSILON);
    const own = [before && gapBetween(before, subject, axis), after && gapBetween(subject, after, axis)].filter(
      (g): g is Span => !!g && g.to - g.from > 0,
    );
    const done: number[] = [];
    for (const g of own) {
      const distance = g.to - g.from;
      if (done.some((d) => Math.abs(d - distance) < SPACING_EPSILON)) continue;
      done.push(distance);
      const equal = [...gaps, ...own].filter((s) => Math.abs(s.to - s.from - distance) < SPACING_EPSILON);
      if (equal.length >= 2) guides.push({ axis, distance, gaps: equal });
    }
  }
  return guides;
}

/**
 * Distances from box `a` to box `b` on each axis: the gap between them when
 * they're apart, the space on each side when one spans the other, or the
 * offsets of matching edges when they partly overlap. A gap to a layer that
 * shares no row or column with `a` gets a dashed leader from the gap's end to
 * that layer, so the number visibly belongs to it.
 */
export function measureBetween(a: Box, b: Box): { spans: Span[]; leaders: Span[] } {
  const spans: Span[] = [];
  const leaders: Span[] = [];
  const middle = (box: Box, axis: Axis) => (startOf(box, crossOf(axis)) + endOf(box, crossOf(axis))) / 2;
  for (const axis of ['x', 'y'] as const) {
    const cross = crossOf(axis);
    const overlap = crossOverlap(a, b, axis);
    const at = overlap ? (overlap[0] + overlap[1]) / 2 : middle(a, axis);
    const [aStart, aEnd, bStart, bEnd] = [startOf(a, axis), endOf(a, axis), startOf(b, axis), endOf(b, axis)];
    const push = (from: number, to: number, on: number) => {
      if (to > from) spans.push({ axis, from, to, at: on });
    };
    const gap = (from: number, to: number, end: number) => {
      push(from, to, at);
      if (overlap) return;
      const [near, far] = startOf(b, cross) > at ? [at, startOf(b, cross)] : [endOf(b, cross), at];
      leaders.push({ axis: cross, from: near, to: far, at: end });
    };
    if (aEnd <= bStart) gap(aEnd, bStart, bStart);
    else if (bEnd <= aStart) gap(bEnd, aStart, bEnd);
    else if (bStart <= aStart && aEnd <= bEnd) {
      push(bStart, aStart, middle(a, axis));
      push(aEnd, bEnd, middle(a, axis));
    } else if (aStart <= bStart && bEnd <= aEnd) {
      push(aStart, bStart, middle(b, axis));
      push(bEnd, aEnd, middle(b, axis));
    } else {
      push(Math.min(aStart, bStart), Math.max(aStart, bStart), at);
      push(Math.min(aEnd, bEnd), Math.max(aEnd, bEnd), at);
    }
  }
  return { spans, leaders };
}

/** Whether any segment of `points` passes through `box` (Liang–Barsky clipping per segment). */
export function polylineHitsBox(points: Point[], box: Box): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let lo = 0;
    let hi = 1;
    const clips: Array<[number, number]> = [
      [-dx, a.x - box.x],
      [dx, box.x + box.width - a.x],
      [-dy, a.y - box.y],
      [dy, box.y + box.height - a.y],
    ];
    let inside = true;
    for (const [p, q] of clips) {
      if (p === 0) {
        if (q < 0) inside = false;
      } else if (p < 0) lo = Math.max(lo, q / p);
      else hi = Math.min(hi, q / p);
    }
    if (inside && lo <= hi) return true;
  }
  return false;
}
