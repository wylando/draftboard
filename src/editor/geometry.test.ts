import { describe, expect, it } from 'vitest';
import { fitBox, nextCullWindow, placePopup, viewWorldBox } from './geometry';
import type { Box } from './model/types';

const view: Box = { x: 1000, y: 500, width: 800, height: 600 };

describe('fitBox', () => {
  const size = { width: 1000, height: 800 };

  it('never zooms in past 100%, however small the box', () => {
    const vp = fitBox({ x: 0, y: 0, width: 50, height: 50 }, size);
    expect(vp.zoom).toBe(1);
    expect(vp.x).toBe(500 - 25);
  });

  it('shrinks a large box to fit with padding, centred', () => {
    const vp = fitBox({ x: 0, y: 0, width: 4000, height: 1000 }, size);
    expect(vp.zoom).toBeCloseTo((1000 - 128) / 4000);
    expect(vp.x + 2000 * vp.zoom).toBeCloseTo(500);
  });
});

describe('viewWorldBox', () => {
  it('is the world area the canvas shows', () => {
    expect(viewWorldBox({ x: 100, y: -50, zoom: 2 }, { width: 800, height: 600 })).toEqual({ x: -50, y: 25, width: 400, height: 300 });
  });

  it('is a point before the canvas is measured', () => {
    expect(viewWorldBox({ x: 0, y: 0, zoom: 1 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('nextCullWindow', () => {
  it('pads a fresh window by half a view on each side', () => {
    expect(nextCullWindow(null, view)).toEqual({ x: 600, y: 200, width: 1600, height: 1200 });
  });

  it('keeps the same object on a small pan', () => {
    const prev = nextCullWindow(null, view);
    expect(nextCullWindow(prev, { ...view, x: view.x + 150, y: view.y - 100 })).toBe(prev);
  });

  it('recomputes once the view is within a quarter view of the window edge', () => {
    const prev = nextCullWindow(null, view);
    const panned = { ...view, x: view.x + 250 };
    const next = nextCullWindow(prev, panned);
    expect(next).not.toBe(prev);
    expect(next).toEqual(nextCullWindow(null, panned));
  });

  it('recomputes after zooming out past the window', () => {
    const prev = nextCullWindow(null, view);
    const next = nextCullWindow(prev, { x: view.x, y: view.y, width: view.width * 2, height: view.height * 2 });
    expect(next).toEqual({ x: 200, y: -100, width: 3200, height: 2400 });
  });

  it('recomputes after zooming in 3x, when the window holds 9x too much', () => {
    const prev = nextCullWindow(null, view);
    const zoomed = { x: view.x + 200, y: view.y + 150, width: view.width / 3, height: view.height / 3 };
    expect(nextCullWindow(prev, zoomed)).not.toBe(prev);
  });

  it('keeps the window while it is at most 4x the fresh area', () => {
    const prev = nextCullWindow(null, view);
    const zoomed = { x: view.x + 100, y: view.y + 75, width: view.width / 1.5, height: view.height / 1.5 };
    expect(nextCullWindow(prev, zoomed)).toBe(prev);
  });

  it('gives a point window for an unmeasured view and recovers once it is measured', () => {
    const empty = { x: 5, y: 7, width: 0, height: 0 };
    const first = nextCullWindow(null, empty);
    expect(first).toEqual(empty);
    expect(nextCullWindow(first, view)).toEqual(nextCullWindow(null, view));
  });
});

describe('placePopup', () => {
  const bounds: Box = { x: 0, y: 0, width: 1000, height: 800 };
  const size = { width: 200, height: 100 };
  const gap = 10;
  const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });
  const clearOf = (at: { x: number; y: number }, b: Box) =>
    at.x + size.width <= b.x - gap || at.x >= b.x + b.width + gap || at.y + size.height <= b.y - gap || at.y >= b.y + b.height + gap;

  it('goes below, centred, when there is room', () => {
    expect(placePopup([box(400, 100, 100, 50)], size, bounds, gap)).toEqual({ x: 350, y: 160 });
  });

  it('goes above when below would leave the bounds', () => {
    expect(placePopup([box(400, 700, 100, 50)], size, bounds, gap)).toEqual({ x: 350, y: 590 });
  });

  it('goes right when above and below are out, and left when right is out too', () => {
    const short: Box = { x: 0, y: 0, width: 1000, height: 300 };
    expect(placePopup([box(400, 100, 100, 100)], size, short, gap)).toEqual({ x: 510, y: 100 });
    expect(placePopup([box(700, 100, 100, 100)], size, short, gap)).toEqual({ x: 490, y: 100 });
  });

  it('shifts along the cross axis to stay inside the bounds', () => {
    expect(placePopup([box(900, 100, 90, 50)], size, bounds, gap)).toEqual({ x: 800, y: 160 });
  });

  it('skips a spot that would cover another box in the avoid list', () => {
    const avoid = [box(400, 100, 100, 50), box(300, 170, 400, 5)];
    const at = placePopup(avoid, size, bounds, gap);
    expect(at).not.toEqual({ x: 350, y: 160 });
    for (const b of avoid) expect(clearOf(at, b)).toBe(true);
  });

  it('falls back to the clear corner nearest the route', () => {
    // Union is wide enough that every side is out of bounds; top-left is covered.
    expect(placePopup([box(0, 100, 100, 100), box(900, 700, 100, 100)], size, bounds, gap)).toEqual({ x: 0, y: 700 });
  });

  it('takes the corner farthest from the route when no corner is clear', () => {
    const wide: Box = { x: 0, y: 0, width: 1200, height: 900 };
    const avoid = [box(0, 0, 100, 100), box(900, 0, 100, 100), box(0, 700, 100, 100), box(950, 790, 50, 20)];
    expect(placePopup(avoid, size, wide, gap)).toEqual({ x: 1000, y: 800 });
  });

  it('sits in the top-right corner when there is nothing to avoid', () => {
    expect(placePopup([], size, bounds, gap)).toEqual({ x: 800, y: 0 });
  });
});
