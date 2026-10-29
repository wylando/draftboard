import { describe, expect, it } from 'vitest';
import {
  alignmentGuides,
  fitBox,
  measureBetween,
  nextCullWindow,
  placePopup,
  snapOffset,
  snapSpacing,
  spacingGuides,
  viewWorldBox,
} from './geometry';
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

const rect = (x: number, y: number, width = 100, height = 100): Box => ({ x, y, width, height });

describe('snapOffset', () => {
  // Candidate lines on x: start 200, centre 250, end 300.
  const target = [rect(200, 0)];

  it.each([
    ['start edge, inside the threshold', 204, -4],
    ['start edge, exactly at the threshold', 206, -6],
    ['centre', 246, 4],
    ['end edge', 303, -3],
  ])('snaps to the %s', (_name, value, offset) => {
    expect(snapOffset([value], target, 'x', 6)).toBe(offset);
  });

  it('does not snap just outside the threshold', () => {
    expect(snapOffset([206.5], target, 'x', 6)).toBeNull();
  });

  it('takes the closest line across values and candidates', () => {
    expect(snapOffset([204, 297], [rect(200, 0), rect(100, 0)], 'x', 6)).toBe(3);
  });

  it('reads the y lines for the y axis', () => {
    expect(snapOffset([103], [rect(0, 100)], 'y', 6)).toBe(-3);
  });

  it('is null with nothing to snap to', () => {
    expect(snapOffset([5], [], 'x', 6)).toBeNull();
  });
});

describe('alignmentGuides', () => {
  const subject = rect(200, 100);

  it('marks the cross-axis ends of the subject and each layer sharing the line', () => {
    const [guide] = alignmentGuides(subject, { x: [200], y: [] }, [rect(200, 300, 50, 50)]);
    expect(guide).toMatchObject({ axis: 'x', at: 200 });
    expect([...guide!.marks].sort((a, b) => a - b)).toEqual([100, 200, 300, 350]);
  });

  it('matches a candidate centre as well as its edges', () => {
    const [guide] = alignmentGuides(subject, { x: [], y: [150] }, [rect(0, 100, 50, 100)]);
    expect(guide).toMatchObject({ axis: 'y', at: 150 });
    expect([...guide!.marks].sort((a, b) => a - b)).toEqual([0, 50, 200, 300]);
  });

  it('draws nothing for a line no layer sits on', () => {
    expect(alignmentGuides(subject, { x: [200], y: [] }, [rect(210, 300)])).toEqual([]);
  });
});

describe('snapSpacing', () => {
  // A and B are 100 apart.
  const row = [rect(0, 0), rect(200, 0)];

  it.each([
    ['after the row, to repeat its gap', rect(404, 0), -4],
    ['before the row, to repeat its gap', rect(-204, 0), 4],
  ])('snaps %s', (_name, subject, offset) => {
    expect(snapSpacing(subject, row, 'x', 6)).toBe(offset);
  });

  it('does not snap just outside the threshold', () => {
    expect(snapSpacing(rect(407, 0), row, 'x', 6)).toBeNull();
  });

  it('ignores layers that share no row with the subject', () => {
    expect(snapSpacing(rect(404, 300), row, 'x', 6)).toBeNull();
  });

  it.each([
    ['row', rect(196, 0), [rect(0, 0), rect(400, 0)], 'x'],
    ['column', rect(0, 196), [rect(0, 0), rect(0, 400)], 'y'],
  ] as const)('centres the subject between its two neighbours in a %s', (_name, subject, neighbours, axis) => {
    // 300 free between the neighbours; a 100 wide subject sits centred 200 along the axis.
    expect(snapSpacing(subject, [...neighbours], axis, 6)).toBe(4);
  });

  it('does not centre when the subject is wider than the space between its neighbours', () => {
    // 50 between them; centred, a 54 wide layer would overlap both. Without the guard this snaps by -2.
    expect(snapSpacing(rect(100, 0, 54, 100), [rect(0, 0), rect(150, 0)], 'x', 6)).toBeNull();
  });

  it('finds a neighbour the subject slightly overlaps, within the threshold', () => {
    // B ends at 203; the subject starts 1 px inside it and would sit 3 px clear of it, like A to B.
    expect(snapSpacing(rect(202, 0), [rect(0, 0), rect(103, 0)], 'x', 6)).toBe(4);
  });

  it('works down a column', () => {
    expect(snapSpacing(rect(0, 404), [rect(0, 0), rect(0, 200)], 'y', 6)).toBe(-4);
  });

  describe('with nested layers', () => {
    it('does not reuse a gap that crosses the edge of a frame around only one end', () => {
      // Frame 1 (100..400) holds Child (300..350); Neighbour sits at 450..500. Child to Neighbour is 100,
      // but the frame reaches into that gap, so the real gap is frame to Neighbour: 50.
      const layers = [rect(100, 300, 300, 100), rect(300, 300, 50, 100), rect(450, 300, 50, 100)];
      expect(snapSpacing(rect(603, 300, 50, 100), layers, 'x', 6)).toBeNull();
      expect(snapSpacing(rect(553, 300, 50, 100), layers, 'x', 6)).toBe(-3);
    });

    it('reuses gaps between siblings of a frame that encloses the whole row', () => {
      const layers = [rect(50, 300, 850, 200), rect(100, 350), rect(300, 350)];
      expect(snapSpacing(rect(504, 350), layers, 'x', 6)).toBe(-4);
    });
  });
});

describe('spacingGuides', () => {
  const row = [rect(0, 0), rect(200, 0)];

  it('marks every gap equal to the subject gap', () => {
    expect(spacingGuides(rect(400, 0), row)).toEqual([
      {
        axis: 'x',
        distance: 100,
        gaps: [
          { axis: 'x', from: 100, to: 200, at: 50 },
          { axis: 'x', from: 300, to: 400, at: 50 },
        ],
      },
    ]);
  });

  it('marks nothing when the subject gap matches no other', () => {
    expect(spacingGuides(rect(410, 0), row)).toEqual([]);
  });

  it('counts gaps that read the same to one decimal as equal', () => {
    expect(spacingGuides(rect(400.04, 0), row)).toHaveLength(1);
  });
});

describe('measureBetween', () => {
  it('measures the gap between layers that share a row, with no leader', () => {
    expect(measureBetween(rect(300, 100), rect(100, 100))).toEqual({
      spans: [{ axis: 'x', from: 200, to: 300, at: 150 }],
      leaders: [],
    });
  });

  it('measures to each side of a layer that encloses the other', () => {
    // Frame 50..450 x 50..260 around the rect at 300..400 x 100..200.
    expect(measureBetween(rect(300, 100), rect(50, 50, 400, 210)).spans).toEqual([
      { axis: 'x', from: 50, to: 300, at: 150 },
      { axis: 'x', from: 400, to: 450, at: 150 },
      { axis: 'y', from: 50, to: 100, at: 350 },
      { axis: 'y', from: 200, to: 260, at: 350 },
    ]);
  });

  it('measures from the enclosing layer inward, whichever is the target', () => {
    expect(measureBetween(rect(100, 100, 300, 300), rect(200, 200)).spans.slice(0, 2)).toEqual([
      { axis: 'x', from: 100, to: 200, at: 250 },
      { axis: 'x', from: 300, to: 400, at: 250 },
    ]);
  });

  it.each([
    ['the target extends past the selection', rect(100, 100), rect(150, 150)],
    ['the selection extends past the target', rect(150, 150), rect(100, 100)],
  ])('measures matching edges of layers that partly overlap, where %s', (_name, a, b) => {
    expect(measureBetween(a, b).spans).toEqual([
      { axis: 'x', from: 100, to: 150, at: 175 },
      { axis: 'x', from: 200, to: 250, at: 175 },
      { axis: 'y', from: 100, to: 150, at: 175 },
      { axis: 'y', from: 200, to: 250, at: 175 },
    ]);
  });

  it('leads from each gap to a layer that sits diagonally away', () => {
    expect(measureBetween(rect(300, 100), rect(500, 400, 60, 60))).toEqual({
      spans: [
        { axis: 'x', from: 400, to: 500, at: 150 },
        { axis: 'y', from: 200, to: 400, at: 350 },
      ],
      leaders: [
        { axis: 'y', from: 150, to: 400, at: 500 },
        { axis: 'x', from: 350, to: 500, at: 400 },
      ],
    });
  });
});
