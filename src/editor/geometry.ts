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
export function resizeBox(start: Box, rotation: number, handle: HandleDir, worldDelta: Point, minSize = 1): Box {
  const local = rotatePoint(worldDelta, -rotation);
  const width = Math.max(minSize, start.width + handle.dx * local.x);
  const height = Math.max(minSize, start.height + handle.dy * local.y);

  // World position of the anchor (the point opposite the dragged handle).
  const c0 = boxCenter(start);
  const anchorOffset0 = { x: (-handle.dx * start.width) / 2, y: (-handle.dy * start.height) / 2 };
  const anchor = rotatePoint({ x: c0.x + anchorOffset0.x, y: c0.y + anchorOffset0.y }, rotation, c0);

  // New center sits so the anchor stays put.
  const offset1 = rotatePoint({ x: (-handle.dx * width) / 2, y: (-handle.dy * height) / 2 }, rotation);
  const c1 = { x: anchor.x - offset1.x, y: anchor.y - offset1.y };
  return { x: c1.x - width / 2, y: c1.y - height / 2, width, height };
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
