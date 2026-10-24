import { describe, expect, it } from 'vitest';
import type { Box, Point } from './types';
import { STUB, routeAround, routeWork, segmentHitsBox, type Side } from './orthogonalRoute';

const inflate = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, width: b.width + 2 * m, height: b.height + 2 * m });

function hits(route: Point[], box: Box): boolean {
  return route.slice(1).some((p, i) => segmentHitsBox(route[i]!, p, box));
}

const bends = (route: Point[]) => route.length - 2;

describe('routeAround', () => {
  it('is a plain elbow when nothing is in the way', () => {
    const route = routeAround({ x: 0, y: 0 }, 'right', { x: 200, y: 100 }, 'left', [], 16);
    expect(route).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }]);
  });

  it('goes around a box between two facing ends, keeping the margin', () => {
    const wall: Box = { x: 150, y: -100, width: 40, height: 200 };
    const route = routeAround({ x: 0, y: 0 }, 'right', { x: 400, y: 0 }, 'left', [wall], 16)!;
    expect(route).not.toBeNull();
    expect(hits(route, inflate(wall, 16))).toBe(false);
    expect(route[0]).toEqual({ x: 0, y: 0 });
    expect(route[route.length - 1]).toEqual({ x: 400, y: 0 });
  });

  it('leaves along the start side and arrives against the end side', () => {
    const route = routeAround({ x: 0, y: 0 }, 'bottom', { x: 300, y: 0 }, 'bottom', [], 16)!;
    expect(route[1]!.x).toBe(0);
    expect(route[1]!.y).toBeGreaterThanOrEqual(STUB);
    expect(route[route.length - 2]!.x).toBe(300);
    expect(route[route.length - 2]!.y).toBeGreaterThanOrEqual(STUB);
  });

  it('does not cut back through the boxes its own ends sit on', () => {
    // Raw boxes: a stub necessarily crosses its own box's margin zone.
    const from: Box = { x: 0, y: 0, width: 100, height: 100 };
    const to: Box = { x: -300, y: 0, width: 100, height: 100 };
    const route = routeAround({ x: 100, y: 50 }, 'right', { x: -200, y: 50 }, 'right', [from, to], 16)!;
    expect(route).not.toBeNull();
    expect(hits(route, from)).toBe(false);
    expect(hits(route, to)).toBe(false);
  });

  it('prefers fewer bends among routes of equal length', () => {
    const aside: Box = { x: 100, y: 300, width: 50, height: 50 };
    const route = routeAround({ x: 0, y: 0 }, 'right', { x: 300, y: 200 }, 'left', [aside], 16)!;
    expect(bends(route)).toBe(2);
  });

  it('returns null when the end is boxed in', () => {
    const cage: Box = { x: 430, y: -60, width: 100, height: 120 };
    expect(routeAround({ x: 0, y: 0 }, 'right', { x: 500, y: 0 }, 'left', [cage], 16)).toBeNull();
  });

  it('routes 100 links through 60 boxes without a search blowing up', () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const boxes: Box[] = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 10; c++) {
        boxes.push({ x: c * 400 + rand() * 100, y: r * 300 + rand() * 100, width: 240, height: 150 });
      }
    }
    const sides: Side[] = ['left', 'right', 'top', 'bottom'];
    const anchor = (b: Box, s: Side): Point =>
      s === 'left' ? { x: b.x, y: b.y + b.height / 2 }
      : s === 'right' ? { x: b.x + b.width, y: b.y + b.height / 2 }
      : s === 'top' ? { x: b.x + b.width / 2, y: b.y }
      : { x: b.x + b.width / 2, y: b.y + b.height };
    const jobs = Array.from({ length: 100 }, () => {
      const a = Math.floor(rand() * boxes.length);
      const b = (a + 1 + Math.floor(rand() * (boxes.length - 1))) % boxes.length;
      const sa = sides[Math.floor(rand() * 4)]!;
      const sb = sides[Math.floor(rand() * 4)]!;
      return { a: anchor(boxes[a]!, sa), sa, b: anchor(boxes[b]!, sb), sb };
    });
    routeWork.expansions = 0;
    jobs.forEach((j) => { routeAround(j.a, j.sa, j.b, j.sb, boxes, 16); });
    // Seeded, so the count is exact. Measured: 178327 expansions for the 100 jobs.
    expect(routeWork.expansions).toBeLessThanOrEqual(450000);
  });
});
