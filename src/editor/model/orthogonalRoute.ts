import type { Box, Point } from './types';

export type Side = 'left' | 'right' | 'top' | 'bottom';

/**
 * Design choice: how far a route leaves its side before its first turn, in
 * world px. Longer than an end marker reaches, so the marker never sits on a bend.
 */
export const STUB = 24;

// Design choice: a bend costs as much as a 40px detour, so routes take a slightly longer path to save a corner (corners read as clutter).
const BEND_PENALTY = 40;

// Breaks ties between equal-length, equal-bend routes toward turning near the middle of the run, as the plain elbow does.
const CENTER_BIAS = 0.001;
const TIE_BREAK = 1e-6;

// A search with no way through (an end boxed in by overlapping tables) would otherwise visit the whole grid, every frame of a drag. Real routes take a few thousand.
const MAX_EXPANSIONS = 150000;

/**
 * Running total of A* expansions across all searches. Only tests read it: a deterministic stand-in for routing time,
 * so performance tests assert on search work instead of a wall clock that varies by machine.
 */
export const routeWork = { expansions: 0 };

// Reused across calls: a drag frame routes many connectors, and allocating dense tables for each dominated the search.
const pool = { g: new Float64Array(0), parent: new Int32Array(0), seen: new Uint32Array(0), done: new Uint32Array(0), gen: 0 };
function acquireScratch(size: number) {
  if (pool.g.length < size) {
    pool.g = new Float64Array(size);
    pool.parent = new Int32Array(size);
    pool.seen = new Uint32Array(size);
    pool.done = new Uint32Array(size);
    pool.gen = 0;
  }
  pool.gen++;
  return pool;
}

// Index = direction: 0 right, 1 down, 2 left, 3 up. (d + 2) % 4 reverses, odd/even differ by a quarter turn.
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const SIDE_DIR: Record<Side, number> = { right: 0, bottom: 1, left: 2, top: 3 };

/** Whether `p` lies on or inside `box`. */
export const boxTouches = (box: Box, p: Point) => p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;

/** True when the segment passes through the open interior of `box`; touching or running along its edge is free. */
export function segmentHitsBox(p: Point, q: Point, box: Box): boolean {
  return segmentHits(p.x, p.y, q.x, q.y, box.x, box.y, box.x + box.width, box.y + box.height);
}

function segmentHits(px: number, py: number, qx: number, qy: number, x1: number, y1: number, x2: number, y2: number): boolean {
  return Math.min(px, qx) < x2 && Math.max(px, qx) > x1 && Math.min(py, qy) < y2 && Math.max(py, qy) > y1
    ? // Axis-aligned segments only: a zero-width extent must lie strictly inside the box on that axis.
      (px !== qx || (px > x1 && px < x2)) && (py !== qy || (py > y1 && py < y2))
    : false;
}

/**
 * An orthogonal route from `start` (leaving along `startSide`) to `end` (arriving against `endSide`'s outward
 * normal) that keeps `margin` px clear of every obstacle box, or null when none exists.
 *
 * A* over the sparse grid formed by the inflated obstacle edges, the two stub tips and the midlines between
 * them. Search states carry the travel direction, so a turn can be charged `BEND_PENALTY` and a reversal
 * forbidden. The first and last segments are the stubs.
 */
export function routeAround(start: Point, startSide: Side, end: Point, endSide: Side, obstacles: readonly Box[], margin: number): Point[] | null {
  const d0 = SIDE_DIR[startSide];
  const dEnd = (SIDE_DIR[endSide] + 2) % 4; // travel direction of the final stub, from its tip into `end`
  const a = { x: start.x + DX[d0]! * STUB, y: start.y + DY[d0]! * STUB };
  const b = { x: end.x - DX[dEnd]! * STUB, y: end.y - DY[dEnd]! * STUB };

  // The boxes the ends sit on are inflated at most by a stub, or the stub tip would start inside its own box.
  const n = obstacles.length;
  const bx1 = new Float64Array(n);
  const by1 = new Float64Array(n);
  const bx2 = new Float64Array(n);
  const by2 = new Float64Array(n);
  obstacles.forEach((o, i) => {
    const m = boxTouches(o, start) || boxTouches(o, end) ? Math.min(margin, STUB) : margin;
    bx1[i] = o.x - m;
    by1[i] = o.y - m;
    bx2[i] = o.x + o.width + m;
    by2[i] = o.y + o.height + m;
  });

  const xs = uniqueSorted([a.x, b.x, (a.x + b.x) / 2, ...bx1, ...bx2]);
  const ys = uniqueSorted([a.y, b.y, (a.y + b.y) / 2, ...by1, ...by2]);
  const nx = xs.length;
  const ny = ys.length;
  const xi = new Map(xs.map((v, i) => [v, i]));
  const yi = new Map(ys.map((v, i) => [v, i]));

  // Single grid steps only, so blocked edges are tabulated lazily per row and column instead of testing every box per step.
  const rowBlocked: (Uint8Array | undefined)[] = [];
  const colBlocked: (Uint8Array | undefined)[] = [];
  const blockedRow = (j: number) => {
    let row = rowBlocked[j];
    if (!row) {
      row = new Uint8Array(nx);
      const y = ys[j]!;
      for (let k = 0; k < n; k++) {
        if (by1[k]! < y && y < by2[k]!) row.fill(1, xi.get(bx1[k]!)!, xi.get(bx2[k]!)!);
      }
      rowBlocked[j] = row;
    }
    return row;
  };
  const blockedCol = (i: number) => {
    let col = colBlocked[i];
    if (!col) {
      col = new Uint8Array(ny);
      const x = xs[i]!;
      for (let k = 0; k < n; k++) {
        if (bx1[k]! < x && x < bx2[k]!) col.fill(1, yi.get(by1[k]!)!, yi.get(by2[k]!)!);
      }
      colBlocked[i] = col;
    }
    return col;
  };
  // Edge between grid line i and i + 1 along the direction of travel `d` from cell (i, j).
  const free = (i: number, j: number, d: number) => {
    if (d === 0) return !blockedRow(j)[i]!;
    if (d === 2) return !blockedRow(j)[i - 1]!;
    if (d === 1) return !blockedCol(i)[j]!;
    return !blockedCol(i)[j - 1]!;
  };

  const goal = nx * ny * 4;
  const scratch = acquireScratch(goal + 1);
  const { g, parent, seen, done } = scratch;
  const gen = scratch.gen;
  const costOf = (s: number) => (seen[s] === gen ? g[s]! : Infinity);
  const setCost = (s: number, cost: number, from: number) => {
    seen[s] = gen;
    g[s] = cost;
    parent[s] = from;
  };
  const heap = sharedHeap;
  heap.size = 0;
  const target = { i: xi.get(b.x)!, j: yi.get(b.y)! };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const bend = (x: number, y: number) => BEND_PENALTY + CENTER_BIAS * (Math.abs(x - mid.x) + Math.abs(y - mid.y));
  // Manhattan distance plus the fewest turns still unavoidable, so the search does not wander through every cheaper-looking detour.
  const h = (i: number, j: number, d: number) => {
    const dx = b.x - xs[i]!;
    const dy = b.y - ys[j]!;
    let turns: number;
    if (dx === 0 && dy === 0) turns = d === dEnd ? 0 : 1;
    else if (dx !== 0 && dy !== 0) {
      const along = d % 2 === 0 ? dx : dy;
      turns = (along > 0) === (d === 0 || d === 1) ? 1 : 2;
    } else {
      const wanted = dx > 0 ? 0 : dx < 0 ? 2 : dy > 0 ? 1 : 3;
      turns = d === wanted ? (d === dEnd ? 0 : 1) : (d + 2) % 4 === wanted ? 2 : 1;
    }
    return Math.abs(dx) + Math.abs(dy) + BEND_PENALTY * turns;
  };

  const first = (xi.get(a.x)! * ny + yi.get(a.y)!) * 4 + d0;
  setCost(first, 0, -1);
  heap.push(h(xi.get(a.x)!, yi.get(a.y)!, d0), first);

  let expansions = 0;
  while (heap.size > 0) {
    const s = heap.pop();
    if (s === goal) return build(parent, goal, xs, ys, ny, start, end);
    // Each state is queued again whenever a cheaper way to it turns up; only its first pop is the cheapest.
    if (done[s] === gen) continue;
    done[s] = gen;
    if (++expansions > MAX_EXPANSIONS) return null;
    routeWork.expansions++;
    const d = s % 4;
    const cell = (s - d) / 4;
    const i = Math.floor(cell / ny);
    const j = cell % ny;
    const cost = g[s]!;

    if (i === target.i && j === target.j && d !== (dEnd + 2) % 4) {
      const total = cost + (d === dEnd ? 0 : bend(b.x, b.y));
      if (total < costOf(goal)) {
        setCost(goal, total, s);
        heap.push(total, goal);
      }
    }

    for (let t = 0; t < 3; t++) {
      const nd = (d + (t === 0 ? 0 : t === 1 ? 1 : 3)) % 4;
      const ni = i + DX[nd]!;
      const nj = j + DY[nd]!;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      if (!free(i, j, nd)) continue;
      const len = Math.abs(xs[ni]! - xs[i]!) + Math.abs(ys[nj]! - ys[j]!);
      const next = cost + len + (nd === d ? 0 : bend(xs[i]!, ys[j]!));
      const ns = (ni * ny + nj) * 4 + nd;
      if (next < costOf(ns)) {
        setCost(ns, next, s);
        // Among equal estimates, expand the deeper state first: open space has many tied routes and this stops the search fanning out over all of them.
        heap.push(next + h(ni, nj, nd) - TIE_BREAK * next, ns);
      }
    }
  }
  return null;
}

function build(parent: Int32Array, goal: number, xs: number[], ys: number[], ny: number, start: Point, end: Point): Point[] {
  const tips: Point[] = [];
  for (let s = parent[goal]!; s !== -1; s = parent[s]!) {
    const cell = (s - (s % 4)) / 4;
    tips.push({ x: xs[Math.floor(cell / ny)]!, y: ys[cell % ny]! });
  }
  tips.reverse();
  const out: Point[] = [];
  for (const p of [start, ...tips, end]) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = out[out.length - 2];
    if (prev && last && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))) out.pop();
    out.push(p);
  }
  return out;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((p, q) => p - q);
}

/** Binary min-heap of state ids keyed by priority, on buffers shared between searches. */
class MinHeap {
  private keys = new Float64Array(1024);
  private vals = new Int32Array(1024);
  size = 0;
  push(key: number, val: number) {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2);
      const vals = new Int32Array(this.size * 2);
      keys.set(this.keys);
      vals.set(this.vals);
      this.keys = keys;
      this.vals = vals;
    }
    const { keys, vals } = this;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop(): number {
    const { keys, vals } = this;
    const top = vals[0]!;
    const len = --this.size;
    if (len > 0) {
      const key = keys[len]!;
      const val = vals[len]!;
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= len) break;
        if (c + 1 < len && keys[c + 1]! < keys[c]!) c++;
        if (keys[c]! >= key) break;
        keys[i] = keys[c]!;
        vals[i] = vals[c]!;
        i = c;
      }
      keys[i] = key;
      vals[i] = val;
    }
    return top;
  }
}

const sharedHeap = new MinHeap();
