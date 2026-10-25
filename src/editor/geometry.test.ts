import { describe, expect, it } from 'vitest';
import { nextCullWindow, viewWorldBox } from './geometry';
import type { Box } from './model/types';

const view: Box = { x: 1000, y: 500, width: 800, height: 600 };

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
