import { describe, expect, it } from 'vitest';
import { typesCompatible, createConnector, bendsMoveWith, dragSegment, repairConnectorData, shapePoints, ROUTE_MARGIN, routeBetween, shiftConnector } from './connector';
import { editorReducer, initialEditorState } from './editorReducer';
import { createGroup, createNode } from './nodes';
import { routeWork, segmentHitsBox } from './orthogonalRoute';
import { createColumn } from './table';
import { byIdOf, cheapestJoinPath, SCAN_JOIN_COST, normalizeTree, relatedToTables } from './tree';
import type { Anchor, Box, ConnectorNode, DesignNode, Point, TableNode } from './types';

const table = (box: Box, others: DesignNode[]) => createNode('table', box, others);
const inflate = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, width: b.width + 2 * m, height: b.height + 2 * m });
const rightAngledRoute = (route: Point[]) => route.slice(1).every((p, i) => (p.x === route[i]!.x) !== (p.y === route[i]!.y));
const hits = (route: Point[], box: Box) => route.slice(1).some((p, i) => segmentHitsBox(route[i]!, p, box));

function scene() {
  const a = table({ x: 0, y: 0, width: 100, height: 100 }, []);
  const b = table({ x: 600, y: 0, width: 100, height: 100 }, [a]);
  const mid = table({ x: 300, y: 0, width: 100, height: 100 }, [a, b]);
  return { a, b, mid };
}
const flat = (a: DesignNode, b: DesignNode): Point[] => [
  { x: a.x + a.width, y: a.y + a.height / 2 },
  { x: b.x, y: b.y + b.height / 2 },
];
const link = (a: DesignNode, b: DesignNode, byId: ReadonlyMap<string, DesignNode>) =>
  createConnector({ kind: 'node', nodeId: a.id }, { kind: 'node', nodeId: b.id }, 'link', byId);

/**
 * Tables on a 330x190 pitch, each nudged by up to +-60/50 px, linked in random far-apart pairs; seeded so runs are
 * comparable. `hubLinks` extra connectors all start at the middle table, as in a hub table with many relations.
 */
function jitteredSchema(tableCount: number, linkCount: number, hubLinks = 0): DesignNode[] {
  let seed = 11;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const cols = Math.ceil(Math.sqrt(tableCount));
  const tables: DesignNode[] = [];
  for (let i = 0; i < tableCount; i++) {
    const x = (i % cols) * 330 + (rand() * 2 - 1) * 60;
    const y = Math.floor(i / cols) * 190 + (rand() * 2 - 1) * 50;
    tables.push(table({ x, y, width: 240, height: 150 }, tables));
  }
  const byId = byIdOf(tables);
  const links: DesignNode[] = [];
  for (let i = 0; i < linkCount + hubLinks; i++) {
    const a = i < linkCount ? Math.floor(rand() * tableCount) : Math.floor(tableCount / 2);
    const b = (a + Math.floor(tableCount / 3) + Math.floor(rand() * (tableCount / 3))) % tableCount;
    links.push(createConnector({ kind: 'node', nodeId: tables[a]!.id }, { kind: 'node', nodeId: tables[b === a ? (a + 1) % tableCount : b]!.id }, `l${i}`, byId));
  }
  return [...tables, ...links];
}

describe('routeBetween around tables', () => {
  it('returns the plain route untouched when nothing is in the way', () => {
    const { a, b } = scene();
    const far = table({ x: 300, y: 500, width: 100, height: 100 }, [a, b]);
    const plain = routeBetween(link(a, b, byIdOf([a, b])).from, link(a, b, byIdOf([a, b])).to, 'orthogonal', byIdOf([a, b]));
    const withFar = byIdOf([a, b, far]);
    expect(routeBetween({ kind: 'node', nodeId: a.id }, { kind: 'node', nodeId: b.id }, 'orthogonal', withFar)).toEqual(plain);
    expect(plain).toEqual(flat(a, b));
  });

  it('keeps a straight connector straight through a table', () => {
    const { a, b, mid } = scene();
    const route = routeBetween({ kind: 'node', nodeId: a.id }, { kind: 'node', nodeId: b.id }, 'straight', byIdOf([a, b, mid]));
    expect(route).toEqual(flat(a, b));
  });
});

describe('live rerouting', () => {
  it('reroutes when a table is moved onto the route', () => {
    const { a, b, mid } = scene();
    const away = { ...mid, y: 500 };
    const c = link(a, b, byIdOf([a, b])) as ConnectorNode;
    let state = initialEditorState([a, b, away, c]);
    const routeOf = () => (state.nodes.find((n) => n.type === 'connector') as ConnectorNode).points;
    expect(routeOf()).toEqual(flat(a, b));
    state = editorReducer(state, { type: 'transformNode', id: mid.id, box: { y: 0 } });
    const moved = state.nodes.find((n) => n.id === mid.id) as DesignNode;
    expect(moved.y).toBe(0);
    expect(hits(routeOf(), inflate(moved, ROUTE_MARGIN))).toBe(false);
    expect(routeOf().length).toBeGreaterThan(2);
  });

  // Irregular positions matter: an aligned grid has few distinct coordinates and hides the cost of routing.
  // Budgets count A* expansions (deterministic: seeded scenes) rather than time, which varies by machine. They are
  // set at about 2-3x the measured count: wide enough to ignore tuning, narrow enough to catch a search that blows up.
  const expansionsOf = (run: () => void) => {
    routeWork.expansions = 0;
    run();
    return routeWork.expansions;
  };
  const drag = (start: DesignNode[], movingId: string, frames: number, step: number) => {
    let nodes = start;
    const perFrame: number[] = [];
    for (let i = 0; i < frames; i++) {
      const moved = nodes.map((n) => (n.id === movingId ? { ...n, x: n.x + step } : n));
      perFrame.push(expansionsOf(() => { nodes = normalizeTree(moved); }));
    }
    return perFrame;
  };

  // Measured: 4640 average at 64 tables, 1410 at 100; the 20-connector hub's worst frame is 41725 (the original slow-frame check).
  it.each([
    { tables: 64, links: 100, hub: 0, mover: 32, frames: 5, step: 1, metric: 'average frame', budget: 12000 },
    { tables: 100, links: 100, hub: 0, mover: 50, frames: 5, step: 1, metric: 'average frame', budget: 4000 },
    { tables: 100, links: 80, hub: 20, mover: 50, frames: 20, step: 12, metric: 'worst frame', budget: 100000 },
  ])('drags a table among $tables tables with $links connectors and a $hub-connector hub keeps the $metric within budget', ({ tables, links, hub, mover, frames, step, metric, budget }) => {
    const nodes = normalizeTree(jitteredSchema(tables, links, hub));
    const perFrame = drag(nodes, nodes[mover]!.id, frames, step);
    const measured = metric === 'worst frame' ? Math.max(...perFrame) : perFrame.reduce((sum, n) => sum + n, 0) / perFrame.length;
    expect(measured).toBeLessThanOrEqual(budget);
  });

  it('routes 100 jittered tables and 100 connectors from scratch without a search blowing up', () => {
    const nodes = jitteredSchema(100, 100);
    const n = expansionsOf(() => { normalizeTree(nodes); });
    // Measured: 194740 expansions.
    expect(n).toBeLessThanOrEqual(500000);
  });

  // The claim is the expansion budget, not speed; under coverage instrumentation CI needs about 7 s, past the 5 s default.
  it('gives up on a connector whose end table overlaps another table, among 300 tables, without a search blowing up', { timeout: 20_000 }, () => {
    const nodes = normalizeTree(jitteredSchema(300, 100));
    const link = nodes.find((n) => n.type === 'connector') as ConnectorNode;
    const target = link.to.kind === 'node' ? link.to.nodeId : '';
    const other = nodes.find((n) => n.type === 'table' && n.id !== target && n.id !== (link.from.kind === 'node' ? link.from.nodeId : ''))!;
    const overlapped = nodes.map((n) => (n.id === target ? { ...n, x: other.x + 30, y: other.y + 20 } : n));
    const n = expansionsOf(() => { normalizeTree(overlapped); });
    // Measured: 210520, with no search reaching the cap. Lowering the cap to 100000 makes failed searches cascade into fallbacks (measured 430941), which this catches.
    expect(n).toBeLessThanOrEqual(400000);
  });
});

describe('route stability', () => {
  const detoured = () => {
    const { a, b, mid } = scene();
    const bystander = table({ x: 300, y: 400, width: 100, height: 100 }, [a, b, mid]);
    const c = link(a, b, byIdOf([a, b])) as ConnectorNode;
    const nodes = normalizeTree([a, b, mid, bystander, c]);
    return { nodes, mid, bystander, c };
  };
  const routeOf = (nodes: DesignNode[]) => (nodes.find((n) => n.type === 'connector') as ConnectorNode).points;

  it('keeps a detour as it was while an unrelated table is dragged around near it', () => {
    const { nodes, bystander } = detoured();
    const before = routeOf(nodes);
    expect(before.length).toBeGreaterThan(2);
    for (const [x, y] of [[300, 300], [350, 250], [320, 180], [340, 220], [310, 330]] as const) {
      const moved = nodes.map((n) => (n.id === bystander.id ? { ...n, x, y } : n));
      expect(routeOf(normalizeTree(moved))).toEqual(before);
    }
  });

  it('searches again when the previous points are not a clean right-angled route', () => {
    const { nodes } = detoured();
    const good = routeOf(nodes);
    const clean = (route: Point[]) =>
      route.slice(1).every((p, i) => {
        const q = route[i]!;
        return (p.x === q.x) !== (p.y === q.y);
      });
    expect(clean(good)).toBe(true);
    const diagonal = good.map((p, i) => (i === 2 ? { x: p.x + 7, y: p.y + 7 } : p));
    const repeated = [...good.slice(0, 2), good[1]!, ...good.slice(2)];
    for (const points of [diagonal, repeated]) {
      const tampered = nodes.map((n) => (n.type === 'connector' ? { ...n, points } : n));
      expect(clean(routeOf(normalizeTree(tampered)))).toBe(true);
    }
  });

  it('returns to the plain route the moment the blocker leaves', () => {
    const { nodes, mid } = detoured();
    const [a, b] = nodes;
    const moved = nodes.map((n) => (n.id === mid.id ? { ...n, y: 900 } : n));
    expect(routeOf(normalizeTree(moved))).toEqual(flat(a!, b!));
  });
});

const length = (route: Point[]) => route.slice(1).reduce((sum, p, i) => sum + Math.abs(p.x - route[i]!.x) + Math.abs(p.y - route[i]!.y), 0);
/** createNode makes every table 64px tall, so a wall overrides its height. */
const wall = (x: number, y: number, width: number, height: number, others: DesignNode[]) => ({ ...table({ x, y, width, height }, others), height });

describe('clearance versus length', () => {
  const ends = () => {
    const a = table({ x: 0, y: 0, width: 100, height: 64 }, []);
    const b = table({ x: 700, y: 0, width: 100, height: 64 }, [a]);
    return { a, b, from: { kind: 'node', nodeId: a.id } as const, to: { kind: 'node', nodeId: b.id } as const };
  };

  // The ends' centre line is y 32; the walls leave a 28px gap on it, too tight for the 16px margin but fine for 4px.
  it.each([400, 2000])('goes through a narrow gap rather than round a %ipx wall', (tall) => {
    const { a, b, from, to } = ends();
    const upper = wall(350, 18 - tall, 100, tall, [a, b]);
    const lower = wall(350, 46, 100, tall, [a, b, upper]);
    const route = routeBetween(from, to, 'orthogonal', byIdOf([a, b, upper, lower]));
    expect(hits(route, upper)).toBe(false);
    expect(hits(route, lower)).toBe(false);
    expect(length(route)).toBeLessThan(1.5 * 600);
  });

  it('keeps the full margin when the way round is only a little longer', () => {
    const { a, b, from, to } = ends();
    const block = wall(350, -20, 100, 104, [a, b]);
    const route = routeBetween(from, to, 'orthogonal', byIdOf([a, b, block]));
    expect(hits(route, inflate(block, ROUTE_MARGIN))).toBe(false);
  });

  it('re-routes a long detour once its blocker has moved partly away', () => {
    const { a, b, from, to } = ends();
    const before = wall(350, -200, 100, 600, [a, b]);
    const long = routeBetween(from, to, 'orthogonal', byIdOf([a, b, before]));
    const after = { ...before, y: 10 };
    const shorter = routeBetween(from, to, 'orthogonal', byIdOf([a, b, after]), long);
    expect(hits(long, inflate(after, 4))).toBe(false);
    expect(length(shorter)).toBeLessThan(length(long) - 100);
  });

  it('keeps a long detour while its blocker has not moved', () => {
    const { a, b, from, to } = ends();
    const block = wall(350, -200, 100, 600, [a, b]);
    const bystander = table({ x: 500, y: 700, width: 100, height: 64 }, [a, b, block]);
    const first = routeBetween(from, to, 'orthogonal', byIdOf([a, b, block]));
    expect(routeBetween(from, to, 'orthogonal', byIdOf([a, b, block, bystander]), first)).toEqual(first);
  });

  it('re-routes a detour that a bystander now sits flush against', () => {
    const { a, b, from, to } = ends();
    const block = wall(350, -200, 100, 600, [a, b]);
    const first = routeBetween(from, to, 'orthogonal', byIdOf([a, b, block]));
    const top = Math.min(...first.map((p) => p.y));
    const bystander = table({ x: 350, y: top - 64, width: 100, height: 64 }, [a, b, block]);
    const second = routeBetween(from, to, 'orthogonal', byIdOf([a, b, block, bystander]), first);
    expect(hits(second, inflate(bystander, 4))).toBe(false);
  });
});

describe('tight gaps and odd trees', () => {
  it('still threads a gap too narrow for the full margin', () => {
    const a = table({ x: 0, y: 0, width: 100, height: 100 }, []);
    const b = table({ x: 600, y: 100, width: 100, height: 100 }, [a]);
    // Two walls closing the way to b except for a 20px slot around b's centre line (createNode makes every table 64px tall, so the walls override their height).
    const upper = { ...table({ x: 330, y: -5000, width: 270, height: 5122 }, [a, b]), height: 5122 };
    const lower = { ...table({ x: 330, y: 142, width: 270, height: 5000 }, [a, b, upper]), height: 5000 };
    const route = routeBetween({ kind: 'node', nodeId: a.id }, { kind: 'node', nodeId: b.id }, 'orthogonal', byIdOf([a, b, upper, lower]));
    expect(hits(route, upper)).toBe(false);
    expect(hits(route, lower)).toBe(false);
  });

  it('ignores hidden tables, and tables whose ancestor is hidden', () => {
    const { a, b, mid } = scene();
    const group = { ...createGroup(null, [a, b, mid]), visible: false };
    const inside = { ...mid, parentId: group.id };
    const from = { kind: 'node', nodeId: a.id } as const;
    const to = { kind: 'node', nodeId: b.id } as const;
    expect(routeBetween(from, to, 'orthogonal', byIdOf([a, b, { ...mid, visible: false }]))).toEqual(flat(a, b));
    expect(routeBetween(from, to, 'orthogonal', byIdOf([a, b, group, inside]))).toEqual(flat(a, b));
  });

  describe('a table pushed up against an end', () => {
    // A column link from A's right edge to C's left edge, with B moved to 10 px right of A, across the `id` row.
    const columns = () => {
      const a = table({ x: 30, y: 100, width: 240, height: 64 }, []);
      const c = table({ x: 690, y: 300, width: 240, height: 64 }, [a]);
      const b = table({ x: 280, y: 120, width: 240, height: 64 }, [a, c]);
      const column = (t: DesignNode) => ({ kind: 'column', tableId: t.id, columnId: (t as TableNode).columns[0]!.id }) as const;
      return { a, b, c, from: column(a), to: column(c) };
    };

    it('leaves from the other side of its table instead of running through it', () => {
      const { a, b, c, from, to } = columns();
      const route = routeBetween(from, to, 'orthogonal', byIdOf([a, c, b]));
      expect(route[0]).toEqual({ x: 30, y: 150 });
      expect(hits(route, b)).toBe(false);
    });

    it('does so for a shaped route too, keeping the shape beyond it', () => {
      const { a, b, c, from, to } = columns();
      const route = routeBetween(from, to, 'orthogonal', byIdOf([a, c, b]), undefined, undefined, [{ x: 540, y: 150 }, { x: 540, y: 350 }]);
      expect(route[0]).toEqual({ x: 30, y: 150 });
      expect(hits(route, b)).toBe(false);
      expect(route.slice(-2)).toEqual([{ x: 540, y: 350 }, { x: 690, y: 350 }]);
    });

    it('keeps its side when the other side is blocked too, even by a table lying over that side', () => {
      const { a, b, c, from, to } = columns();
      const left = table({ x: -230, y: 120, width: 240, height: 64 }, [a, b, c]);
      expect(routeBetween(from, to, 'orthogonal', byIdOf([a, c, b, left]))[0]).toEqual({ x: 270, y: 150 });
      const overLeft = { ...left, x: -100 };
      expect(routeBetween(from, to, 'orthogonal', byIdOf([a, c, b, overLeft]))[0]).toEqual({ x: 270, y: 150 });
    });

    it('keeps its side when the table in the way is the other end, or lies over this end', () => {
      const { a, b, c, from, to } = columns();
      const near = { ...c, x: 280, y: 120 };
      expect(routeBetween(from, to, 'orthogonal', byIdOf([a, near]))[0]).toEqual({ x: 270, y: 150 });
      // Stacked over A's edge, as a duplicate 10 px on would be: the end is under it, not merely up against it.
      const over = { ...b, x: 260 };
      expect(routeBetween(from, to, 'orthogonal', byIdOf([a, c, over]))[0]).toEqual({ x: 270, y: 150 });
    });
  });

  it('keeps a connector visible, since no panel can unhide it', () => {
    const { a, b } = scene();
    const link = createConnector({ kind: 'node', nodeId: a.id }, { kind: 'node', nodeId: b.id }, 'a_b', byIdOf([a, b]));
    const connectors = normalizeTree([a, b, { ...link, visible: false }]).filter((n) => n.type === 'connector');
    expect(connectors.map((n) => n.visible)).toEqual([true]);
  });

  it('terminates on a parent cycle', () => {
    const { a, b, mid } = scene();
    const x = { ...mid, id: 'x', parentId: 'y' };
    const y = { ...mid, id: 'y', x: 800, parentId: 'x' };
    expect(() => routeBetween({ kind: 'node', nodeId: a.id }, { kind: 'node', nodeId: b.id }, 'orthogonal', byIdOf([a, b, x, y]))).not.toThrow();
  });
});

describe('column links between tables that crowd each other', () => {
  // normalizeTree derives a table's height from its columns, so the 64 below is a placeholder; the `id` row of a table at (x, y) is centred at y + 50.
  const idLink = (from: TableNode, to: TableNode) => {
    const column = (t: TableNode) => ({ kind: 'column', tableId: t.id, columnId: t.columns[0]!.id }) as const;
    const byId = byIdOf([from, to]);
    const c = createConnector(column(from), column(to), 'link', byId);
    return normalizeTree([from, to, c]).find((n) => n.type === 'connector') as ConnectorNode;
  };
  const tableAt = (x: number, y: number, others: DesignNode[]) => table({ x, y, width: 240, height: 64 }, others) as TableNode;

  it('routes stacked tables round one side instead of back through them', () => {
    const upper = tableAt(100, 100, []);
    // One pixel left of the upper table, so their centres differ but they still overlap sideways.
    const lower = tableAt(99, 300, [upper]);
    const { points } = idLink(lower, upper);
    expect(rightAngledRoute(points)).toBe(true);
    expect(points.every((p) => p.x >= 339) || points.every((p) => p.x <= 100)).toBe(true);
  });

  it('links tables a 10 px gap apart with a plain line, since the gap is closer than both stubs together', () => {
    const left = tableAt(100, 100, []);
    const right = tableAt(350, 100, [left]);
    expect(idLink(right, left).points).toEqual([{ x: 350, y: 150 }, { x: 340, y: 150 }]);
  });

  it('keeps a route between overlapping tables short and local', () => {
    const left = tableAt(100, 100, []);
    // Overlaps the left table's right edge, sideways and in height.
    const right = tableAt(330, 110, [left]);
    const { points } = idLink(right, left);
    expect(points.every((p) => p.x >= 300 && p.x <= 370)).toBe(true);
  });
});

describe('shaped routes', () => {
  const ends = () => {
    const a = table({ x: 0, y: 0, width: 100, height: 64 }, []);
    const b = table({ x: 700, y: 0, width: 100, height: 64 }, [a]);
    return { a, b, from: { kind: 'node', nodeId: a.id } as const, to: { kind: 'node', nodeId: b.id } as const };
  };
  const bends: Point[] = [{ x: 300, y: 32 }, { x: 300, y: -100 }, { x: 500, y: -100 }, { x: 500, y: 32 }];
  const shaped = [{ x: 100, y: 32 }, ...bends, { x: 700, y: 32 }];
  const rightAngled = (route: Point[]) => route.slice(1).every((p, i) => (p.x === route[i]!.x) !== (p.y === route[i]!.y));

  it('runs through every bend in order', () => {
    const { a, b, from, to } = ends();
    expect(routeBetween(from, to, 'orthogonal', byIdOf([a, b]), undefined, undefined, bends)).toEqual(shaped);
  });

  it('joins bends that are not in line with right-angled corners', () => {
    const { a, b, from, to } = ends();
    const route = routeBetween(from, to, 'orthogonal', byIdOf([a, b]), undefined, undefined, [{ x: 300, y: -100 }]);
    expect(rightAngled(route)).toBe(true);
    expect(route).toContainEqual({ x: 300, y: -100 });
  });

  it('follows the tables at its ends while keeping the bends', () => {
    const { a, b, from, to } = ends();
    const lower = { ...b, y: 200 };
    const route = routeBetween(from, to, 'orthogonal', byIdOf([a, lower]), undefined, undefined, bends);
    expect(route[route.length - 1]).toEqual({ x: 700, y: 232 });
    // A bend that ends up in line with its neighbours is no corner any more, but the route still passes through it.
    for (const bend of bends) expect(route.slice(1).some((p, i) => segmentHitsBox(route[i]!, p, { x: bend.x - 0.5, y: bend.y - 0.5, width: 1, height: 1 }))).toBe(true);
    expect(rightAngled(route)).toBe(true);
  });

  it('ignores bends for a straight connector', () => {
    const { a, b, from, to } = ends();
    expect(routeBetween(from, to, 'straight', byIdOf([a, b]), undefined, undefined, bends)).toEqual(flat(a, b));
  });

  describe('dragSegment', () => {
    it('moves exactly the dragged segment sideways', () => {
      const { a, b, from, to } = ends();
      const next = dragSegment(shaped, 2, -40, 0);
      const route = routeBetween(from, to, 'orthogonal', byIdOf([a, b]), undefined, undefined, next);
      expect(route).toEqual([{ x: 100, y: 32 }, { x: 300, y: 32 }, { x: 300, y: -140 }, { x: 500, y: -140 }, { x: 500, y: 32 }, { x: 700, y: 32 }]);
    });

    it('moves a vertical segment along x', () => {
      expect(dragSegment(shaped, 1, 60, 0)).toEqual([{ x: 360, y: 32 }, { x: 360, y: -100 }, { x: 500, y: -100 }, { x: 500, y: 32 }]);
    });

    it('leaves the bends as they are for the first and last segments, which are attached to the tables', () => {
      expect(dragSegment(shaped, 0, 20, 0)).toEqual(bends);
      expect(dragSegment(shaped, shaped.length - 2, 20, 0)).toEqual(bends);
    });

    it('will not drag a segment back past its end stub', () => {
      expect(dragSegment(shaped, 1, -250, 0)[0]).toEqual({ x: 124, y: 32 });
    });

    it('moves past the parallel runs beside it', () => {
      const stairs = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 150 }, { x: 400, y: 150 }];
      expect(dragSegment(stairs, 3, 150, 0)).toEqual([{ x: 100, y: 0 }, { x: 100, y: 50 }, { x: 350, y: 50 }, { x: 350, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 150 }]);
      expect(dragSegment(stairs, 3, -150, 0)).toEqual([{ x: 100, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 150 }]);
    });

    it('merges a jog into one segment when dragged onto the run beside it, snapping within the distance given', () => {
      const stairs = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 150 }, { x: 400, y: 150 }];
      const merged = [{ x: 100, y: 0 }, { x: 100, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 150 }];
      expect(dragSegment(stairs, 2, 50, 0)).toEqual([{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 150 }]);
      expect(dragSegment(stairs, 3, 100, 0)).toEqual(merged);
      expect(dragSegment(stairs, 3, 95, 6)).toEqual(merged);
      expect(dragSegment(stairs, 3, 90, 6)).not.toEqual(merged);
    });

    it('drops the spike left when a jog merges into a run going back the other way', () => {
      const hook = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 200 }, { x: 300, y: 200 }];
      expect(dragSegment(hook, 4, 50, 0)).toEqual([{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 150, y: 100 }, { x: 150, y: 200 }]);
    });

    it('folds a loop flat into one run when its far side is dragged onto the near one', () => {
      // Segment 2 runs along y -100 between two runs at y 32: dragged down onto them, the loop is gone.
      expect(dragSegment(shaped, 2, 130, 6)).toEqual([]);
      const { a, b, from, to } = ends();
      expect(routeBetween(from, to, 'orthogonal', byIdOf([a, b]), undefined, undefined, dragSegment(shaped, 2, 132, 0))).toEqual(flat(a, b));
    });
  });

  describe('after a segment drag, an end table moves', () => {
    // A right of B's left side: the drag moved the middle segment from x 250 to x 350.
    const setup = () => {
      const a = table({ x: 0, y: 0, width: 100, height: 64 }, []);
      const b = table({ x: 400, y: 200, width: 100, height: 64 }, [a]);
      const from = { kind: 'node', nodeId: a.id } as const;
      const to = { kind: 'node', nodeId: b.id } as const;
      const bends = dragSegment(routeBetween(from, to, 'orthogonal', byIdOf([a, b])), 1, 100, 0);
      return { a, b, from, to, bends, route: (moved: DesignNode, shape = bends) => routeBetween(from, to, 'orthogonal', byIdOf([a, moved]), undefined, undefined, shape) };
    };
    const reversesInside = (route: Point[]) =>
      route.slice(2, -2).some((q, k) => {
        const p = route[k + 1]!;
        const r = route[k + 3]!;
        const inLine = (p.x === q.x && q.x === r.x) || (p.y === q.y && q.y === r.y);
        return inLine && (Math.sign(q.x - p.x) === -Math.sign(r.x - q.x) && Math.sign(q.y - p.y) === -Math.sign(r.y - q.y));
      });

    it('shortens the dragged segment to meet the table where it is now', () => {
      const { b, bends, route } = setup();
      expect(bends).toEqual([{ x: 350, y: 32 }, { x: 350, y: 232 }]);
      expect(route({ ...b, y: 100 })).toEqual([{ x: 100, y: 32 }, { x: 350, y: 32 }, { x: 350, y: 132 }, { x: 400, y: 132 }]);
      expect(route({ ...b, y: -100 })).toEqual([{ x: 100, y: 32 }, { x: 350, y: 32 }, { x: 350, y: -68 }, { x: 400, y: -68 }]);
    });

    it('never runs back over itself, wherever either table goes', () => {
      const { a, b, from, to, bends, route } = setup();
      const startMoved = (moved: DesignNode) => routeBetween(from, to, 'orthogonal', byIdOf([moved, b]), undefined, undefined, bends);
      for (let x = 150; x <= 700; x += 25)
        for (let y = -200; y <= 400; y += 25)
          for (const r of [route({ ...b, x, y }), startMoved({ ...a, x: x - 400, y: y - 200 })]) {
            expect(rightAngledRoute(r), `${x},${y}`).toBe(true);
            expect(reversesInside(r), `${x},${y} ${JSON.stringify(r)}`).toBe(false);
          }
    });

    it('arrives along its stub when a sliding bend lands on the stub tip', () => {
      const a = table({ x: 0, y: 0, width: 100, height: 64 }, []);
      const b = table({ x: 131, y: 44, width: 100, height: 64 }, [a]);
      // The last bend slides to B's stub tip (107, 76) and repeats it; the route must still turn out rather than run back over the stub.
      const route = routeBetween({ kind: 'node', nodeId: a.id }, { kind: 'node', nodeId: b.id }, 'orthogonal', byIdOf([a, b]), undefined, undefined, [{ x: 50, y: 76 }, { x: 92, y: 76 }]);
      expect(route).toEqual([{ x: 100, y: 32 }, { x: 124, y: 32 }, { x: 124, y: 100 }, { x: 107, y: 100 }, { x: 107, y: 76 }, { x: 131, y: 76 }]);
    });

    it('moves a segment left on an end stub out to the stub tip instead of stepping round it', () => {
      const a = table({ x: 60, y: 40, width: 100, height: 64 }, []);
      const b = table({ x: 20, y: 250, width: 100, height: 64 }, [a]);
      const from = { kind: 'node', nodeId: a.id } as const;
      const to = { kind: 'node', nodeId: b.id } as const;
      // As far toward B as the stub allows: 24 px above B's top.
      const bends = dragSegment(routeBetween(from, to, 'orthogonal', byIdOf([a, b])), 1, 60, 0);
      expect(bends).toEqual([{ x: 110, y: 226 }, { x: 70, y: 226 }]);
      const route = routeBetween(from, to, 'orthogonal', byIdOf([a, { ...b, y: 245 }]), undefined, undefined, bends);
      expect(route).toEqual([{ x: 110, y: 104 }, { x: 110, y: 221 }, { x: 70, y: 221 }, { x: 70, y: 245 }]);
    });

    it('returns to the same route when the table moves back after a second drag', () => {
      const { b, route } = setup();
      const away = { ...b, y: 100 };
      const again = dragSegment(route(away), 1, 20, 0);
      expect(route(b, again)).toEqual([{ x: 100, y: 32 }, { x: 370, y: 32 }, { x: 370, y: 232 }, { x: 400, y: 232 }]);
    });
  });

  it('keeps at most 64 bends on load', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ x: i, y: 0 }));
    const good = { routing: 'orthogonal', points: [], from: { kind: 'point', x: 0, y: 0 }, to: { kind: 'point', x: 1, y: 1 } };
    expect(repairConnectorData({ ...good, bends: many }).bends).toEqual(many.slice(0, 64));
  });

  it('bendsMoveWith: only when everything the connector is attached to moves', () => {
    const { a, b } = ends();
    const c: ConnectorNode = { ...link(a, b, byIdOf([a, b])), bends };
    expect(bendsMoveWith(c, new Set([a.id, b.id]))).toBe(true);
    expect(bendsMoveWith(c, new Set([c.id, a.id, b.id]))).toBe(true);
    expect(bendsMoveWith(c, new Set([a.id]))).toBe(false);
    expect(bendsMoveWith(c, new Set([c.id, a.id]))).toBe(false);
    expect(bendsMoveWith(c, new Set([c.id]))).toBe(false);
    const half: ConnectorNode = { ...c, to: { kind: 'point', x: 1, y: 1 } };
    expect(bendsMoveWith(half, new Set([a.id]))).toBe(true);
    const loose: ConnectorNode = { ...c, from: { kind: 'point', x: 0, y: 0 }, to: { kind: 'point', x: 1, y: 1 } };
    expect(bendsMoveWith(loose, new Set([loose.id]))).toBe(true);
    expect(bendsMoveWith(loose, new Set([a.id, b.id]))).toBe(false);
  });

  it('shiftConnector shifts loose ends always and bends only when asked', () => {
    const { a, b } = ends();
    const c: ConnectorNode = { ...link(a, b, byIdOf([a, b])), to: { kind: 'point', x: 5, y: 6 }, bends };
    const moved = bends.map((p) => ({ x: p.x + 1, y: p.y + 2 }));
    expect(shiftConnector(c, 1, 2, true)).toEqual({ from: c.from, to: { kind: 'point', x: 6, y: 8 }, bends: moved });
    expect(shiftConnector(c, 1, 2, false)).not.toHaveProperty('bends');
    expect(shiftConnector({ ...c, bends: undefined }, 1, 2, true)).not.toHaveProperty('bends');
  });

  it('drops bends that are not points on load', () => {
    const good = { routing: 'orthogonal', points: [], from: { kind: 'point', x: 0, y: 0 }, to: { kind: 'point', x: 1, y: 1 } };
    expect(repairConnectorData({ ...good, bends }).bends).toEqual(bends);
    for (const bad of ['x', 7, [{ x: 1, y: Number.NaN }], [{ x: 1 }], [null], []]) {
      expect(repairConnectorData({ ...good, bends: bad }).bends).toBeUndefined();
    }
  });
});

describe('shaped routes avoiding tables', () => {
  const ends = () => {
    const a = table({ x: 0, y: 0, width: 100, height: 64 }, []);
    const b = table({ x: 700, y: 0, width: 100, height: 64 }, [a]);
    return { a, b, from: { kind: 'node', nodeId: a.id } as const, to: { kind: 'node', nodeId: b.id } as const };
  };
  const bends: Point[] = [{ x: 300, y: 32 }, { x: 300, y: -100 }, { x: 500, y: -100 }, { x: 500, y: 32 }];
  const shapedRoute = [{ x: 100, y: 32 }, ...bends, { x: 700, y: 32 }];
  const route = (tables: DesignNode[]) => {
    const [a, b] = [tables[0]!, tables[1]!];
    return routeBetween({ kind: 'node', nodeId: a.id }, { kind: 'node', nodeId: b.id }, 'orthogonal', byIdOf(tables), undefined, undefined, bends);
  };
  const doublesBack = (r: Point[]) =>
    r.slice(2).some((p, i) => {
      const a = r[i]!;
      const b = r[i + 1]!;
      return (a.y === b.y && b.y === p.y && (b.x - a.x) * (p.x - b.x) < 0) || (a.x === b.x && b.x === p.x && (b.y - a.y) * (p.y - b.y) < 0);
    });

  it('goes round a table that now sits on one of its segments, keeping its other bends', () => {
    const { a, b } = ends();
    const blocker = wall(350, -130, 100, 60, [a, b]);
    const r = route([a, b, blocker]);
    expect(hits(r, blocker)).toBe(false);
    expect(r).toContainEqual({ x: 300, y: 32 });
    expect(r).toContainEqual({ x: 500, y: 32 });
    expect(r).not.toEqual(shapedRoute);
  });

  it('returns to exactly the shape once the table has moved away', () => {
    const { a, b } = ends();
    const blocker = wall(350, -130, 100, 60, [a, b]);
    expect(route([a, b, { ...blocker, y: 400 }])).toEqual(shapedRoute);
  });

  it('turns out along its stub when the end table has moved past the first bend', () => {
    const { a, b } = ends();
    const moved = { ...a, x: 400 };
    const r = route([moved, b]);
    expect(hits(r, moved)).toBe(false);
    expect(doublesBack(r)).toBe(false);
    expect(r[0]).toEqual({ x: 500, y: 32 });
  });

  it('keeps the shaped leg when no way round is found', () => {
    const { a, b } = ends();
    // A closed ring round A, beyond its stubs: the first leg must cross it, and nothing gets out.
    const ring = [wall(-60, -60, 220, 10, [a, b]), wall(-60, 114, 220, 10, [a, b]), wall(-60, -60, 10, 184, [a, b]), wall(150, -60, 10, 184, [a, b])];
    expect(route([a, b, ...ring])).toEqual(shapedRoute);
  });

  it('drags 30 shaped connectors across 100 jittered tables without a search blowing up', () => {
    const nodes = normalizeTree(jitteredSchema(100, 100));
    const routed = nodes.filter((n): n is ConnectorNode => n.type === 'connector').slice(0, 30);
    const shaped = new Map(routed.map((c) => [c.id, c.points.slice(1, -1)]));
    let state = normalizeTree(nodes.map((n) => (shaped.has(n.id) ? { ...n, bends: shaped.get(n.id)! } : n)));
    const hub = state[50]!.id;
    const frames: number[] = [];
    for (let i = 0; i < 20; i++) {
      const moved = state.map((n) => (n.id === hub ? { ...n, x: n.x + 40, y: n.y + 15 } : n));
      routeWork.expansions = 0;
      state = normalizeTree(moved);
      frames.push(routeWork.expansions);
    }
    // Measured average per frame: 3590 (worst 13447).
    expect(frames.reduce((sum, n) => sum + n, 0) / frames.length).toBeLessThanOrEqual(10000);
  });

  it('hands the shape, not the detour, to a segment drag', () => {
    const { a, b } = ends();
    const blocker = wall(350, -130, 100, 60, [a, b]);
    const byId = byIdOf([a, b, blocker]);
    const shaped: ConnectorNode = { ...link(a, b, byId), routing: 'orthogonal', bends };
    const detour = route([a, b, blocker]);
    expect(detour).not.toEqual(shapedRoute);
    expect(shapePoints(shaped, byId)).toEqual(shapedRoute);
    expect(dragSegment(shapePoints(shaped, byId), 2, -40, 0)).toEqual(dragSegment(shapedRoute, 2, -40, 0));
    expect(dragSegment(detour, 2, -40, 0)).not.toEqual(dragSegment(shapedRoute, 2, -40, 0));
    const plain = link(a, b, byIdOf([a, b]));
    expect(shapePoints({ ...plain, points: shapedRoute }, byId)).toEqual(shapedRoute);
  });

  it('searches again from the neighbouring points when a bend is hemmed in by its own table', () => {
    const { a, b } = ends();
    const moved = { ...a, x: 225, y: 50 };
    const r = routeBetween({ kind: 'node', nodeId: a.id }, { kind: 'node', nodeId: b.id }, 'orthogonal', byIdOf([moved, b]), undefined, undefined, [{ x: 300, y: 32 }, { x: 300, y: 232 }]);
    expect(hits(r, moved)).toBe(false);
  });

  it('sidesteps its stub on the side that crosses the tables least', () => {
    const { a, b } = ends();
    const across = wall(-90, 46, 300, 20, [a, b]);
    const r = routeBetween({ kind: 'node', nodeId: a.id }, { kind: 'node', nodeId: b.id }, 'orthogonal', byIdOf([a, b, across]), undefined, undefined, [{ x: -81, y: 32 }]);
    expect(r).toContainEqual({ x: 124, y: 8 });
    expect(doublesBack(r)).toBe(false);
  });

  it('gives up on shaped legs it cannot get round without searching every table', () => {
    // A closed ring of tables with two bends inside it, among a hundred other tables: the legs in from outside have no way round,
    // and a search over every table to find that out is what this must not do.
    const tables: DesignNode[] = jitteredSchema(100, 0);
    const place = (x: number, y: number) => tables.push(table({ x: x + 4000, y, width: 240, height: 64 }, tables));
    place(-600, 968);
    place(2000, 968);
    const [p, q] = tables.slice(-2);
    for (const x of [760, 1000, 1240]) for (const y of [850, 1086]) place(x, y);
    for (const x of [760, 1240]) for (const y of [914, 970, 1022]) place(x, y);
    const byId = byIdOf(tables);
    const links = Array.from({ length: 10 }, (_, i) => ({
      ...createConnector({ kind: 'node', nodeId: p!.id }, { kind: 'node', nodeId: q!.id }, `l${i}`, byId),
      bends: [{ x: 5120, y: 1000 }, { x: 5120, y: 1040 }],
    }));
    const nodes = [...tables, ...links];
    normalizeTree(nodes);
    routeWork.expansions = 0;
    normalizeTree(nodes);
    // Measured: 1380 for all ten connectors.
    expect(routeWork.expansions).toBeLessThanOrEqual(4000);
  });
});

describe('relatedToTables', () => {
  const col = (t: DesignNode): Anchor => ({ kind: 'column', tableId: t.id, columnId: (t as TableNode).columns[0]!.id });
  const node = (n: DesignNode): Anchor => ({ kind: 'node', nodeId: n.id });
  const loose: Anchor = { kind: 'point', x: 900, y: 900 };
  const sets = (r: { connectors: Set<string>; tables: Set<string> }) => ({ connectors: [...r.connectors].sort(), tables: [...r.tables].sort() });
  const hide = (n: DesignNode): DesignNode => ({ ...n, visible: false });

  it('relates a connector by a column end or a node end, and the table at its other end', () => {
    const { a, b, mid } = scene();
    const byId = byIdOf([a, b, mid]);
    const viaColumn = createConnector(col(a), col(b), 'c1', byId);
    const viaNode = createConnector(node(mid), node(a), 'c2', byId);
    const all = byIdOf([a, b, mid, viaColumn, viaNode]);
    expect(sets(relatedToTables([a.id], all))).toEqual({ connectors: [viaColumn.id, viaNode.id].sort(), tables: [b.id, mid.id].sort() });
  });

  it('ignores loose and broken point ends', () => {
    const { a, b } = scene();
    const byId = byIdOf([a, b]);
    const looseEnd = createConnector(col(a), loose, 'c1', byId);
    const brokenEnd = createConnector({ kind: 'point', x: 5, y: 5, broken: true }, node(b), 'c2', byId);
    const all = byIdOf([a, b, looseEnd, brokenEnd]);
    expect(sets(relatedToTables([a.id], all))).toEqual({ connectors: [looseEnd.id], tables: [] });
  });

  it('relates a connector whose other end is not a table, without adding that layer', () => {
    const { a } = scene();
    const rect = createNode('rect', { x: 300, y: 300, width: 50, height: 50 }, [a]);
    const c = createConnector(node(a), node(rect), 'c1', byIdOf([a, rect]));
    expect(sets(relatedToTables([a.id], byIdOf([a, rect, c])))).toEqual({ connectors: [c.id], tables: [] });
  });

  it('excludes hidden connectors and hidden neighbour tables', () => {
    const { a, b, mid } = scene();
    const byId = byIdOf([a, b, mid]);
    const toB = createConnector(node(a), node(b), 'c1', byId);
    const toMid = createConnector(node(a), node(mid), 'c2', byId);
    const all = byIdOf([a, hide(b), mid, toB, hide(toMid)]);
    expect(sets(relatedToTables([a.id], all))).toEqual({ connectors: [toB.id], tables: [] });
  });

  it('unions a three-table selection, listing only tables outside it as neighbours', () => {
    const { a, b, mid } = scene();
    const d = table({ x: 900, y: 0, width: 100, height: 100 }, [a, b, mid]);
    const byId = byIdOf([a, b, mid, d]);
    const ab = createConnector(node(a), node(b), 'c1', byId);
    const bm = createConnector(node(b), node(mid), 'c2', byId);
    const md = createConnector(node(mid), node(d), 'c3', byId);
    const all = byIdOf([a, b, mid, d, ab, bm, md]);
    expect(sets(relatedToTables([a.id, b.id, mid.id], all))).toEqual({ connectors: [ab.id, bm.id, md.id].sort(), tables: [d.id] });
  });

  it('gives nothing for an empty selection, a connector or a group', () => {
    const { a, b } = scene();
    const g = createGroup(null, [a, b]);
    const c = createConnector(node(a), node(b), 'c1', byIdOf([a, b]));
    const all = byIdOf([a, b, g, c]);
    const none = { connectors: [], tables: [] };
    expect(sets(relatedToTables([], all))).toEqual(none);
    expect(sets(relatedToTables([c.id], all))).toEqual(none);
    expect(sets(relatedToTables([g.id], all))).toEqual(none);
  });
});

describe('cheapestJoinPath', () => {
  // Column 0 is the primary key (indexed); column 1 is a plain column, such as a foreign key.
  const tbl = (x: number, others: DesignNode[], patch: Partial<TableNode> = {}): TableNode => {
    const t = table({ x, y: 0, width: 100, height: 100 }, others) as TableNode;
    return { ...t, columns: [createColumn('first', 'int'), createColumn('second', 'int')], indexes: [], ...patch };
  };
  const pk = (t: TableNode): TableNode => ({ ...t, columns: t.columns.map((c, i) => (i === 0 ? { ...c, primaryKey: true } : c)) });
  const colOf = (t: TableNode, i = 0): Anchor => ({ kind: 'column', tableId: t.id, columnId: t.columns[i]!.id });
  const whole = (t: DesignNode): Anchor => ({ kind: 'node', nodeId: t.id });
  const join = (from: Anchor, to: Anchor, name: string, all: DesignNode[]) => createConnector(from, to, name, byIdOf(all));
  const sets = (r: { connectors: Set<string>; tables: Set<string> } | null) => r && { connectors: [...r.connectors].sort(), tables: [...r.tables].sort() };
  const none = { connectors: [], tables: [] };
  const routeOf = (r: ReturnType<typeof cheapestJoinPath>) => r?.route.map((s) => (s.via ? [s.table, s.via.indexed] : [s.table]));
  const hide = (n: DesignNode): DesignNode => ({ ...n, visible: false });

  // b.fk (a plain column) references a's key directly; c is an indexed stepping stone linked by key to both.
  function scene() {
    const a = pk(tbl(0, []));
    const b = pk(tbl(600, [a]));
    const c = pk(tbl(300, [a, b]));
    const base = [a, b, c];
    const direct = join(colOf(b, 1), colOf(a), 'direct', base);
    const ac = join(colOf(a), colOf(c), 'ac', base);
    const cb = join(colOf(c), colOf(b), 'cb', base);
    return { a, b, c, base, direct, ac, cb };
  }

  it('prefers an indexed two-hop route over a direct join into an unindexed foreign key column', () => {
    const { a, b, c, base, direct, ac, cb } = scene();
    const r = cheapestJoinPath([a.id, b.id], byIdOf([...base, direct, ac, cb]));
    expect(sets(r)).toEqual({ connectors: [ac.id, cb.id].sort(), tables: [c.id] });
    expect(routeOf(r)).toEqual([[a.id], [c.id, true], [b.id, true]]);
    expect(r?.route[1]?.via?.connector).toBe(ac.id);
  });

  it('costs a step by the column it enters, so the direction of the selection matters', () => {
    const { a, b, base, direct, ac, cb } = scene();
    const r = cheapestJoinPath([b.id, a.id], byIdOf([...base, direct, ac, cb]));
    expect(sets(r)).toEqual({ connectors: [direct.id], tables: [] });
    expect(routeOf(r)).toEqual([[b.id], [a.id, true]]);
  });

  describe('which columns count as indexed', () => {
    // A direct join from a into b's `columnIndex` column, against a two-hop route through indexed m that enters a
    // third column of b that is both unique and indexed, so no single rule under test can unindex it: the two-hop route
    // always costs 2, and the direct join wins only when b's column is indexed.
    function directWins(patchB: (b: TableNode) => TableNode, columnIndex: number) {
      const a = tbl(0, []);
      const patched = patchB(tbl(600, [a]));
      const key = { ...createColumn('key', 'int'), unique: true };
      const b = { ...patched, columns: [...patched.columns, key], indexes: [...patched.indexes, { id: 'kx', name: 'kx', unique: true, columnIds: [key.id] }] };
      const m = pk(tbl(300, [a, b]));
      const base = [a, b, m];
      const ab = join(colOf(a), colOf(b, columnIndex), 'ab', base);
      const am = join(colOf(a), colOf(m), 'am', base);
      const mb = join(colOf(m), colOf(b, 2), 'mb', base);
      return cheapestJoinPath([a.id, b.id], byIdOf([...base, ab, am, mb]))!.connectors.has(ab.id);
    }
    const unique = (b: TableNode) => ({ ...b, columns: b.columns.map((c, i) => (i === 1 ? { ...c, unique: true } : c)) });
    const indexOn = (...ixs: number[]) => (b: TableNode): TableNode => ({
      ...b,
      indexes: [{ id: 'ix', name: 'ix', unique: false, columnIds: ixs.map((i) => b.columns[i]!.id) }],
    });
    const compositeKey = (b: TableNode): TableNode => ({
      ...b,
      columns: b.columns.map((c) => ({ ...c, primaryKey: true })),
    });

    it('counts a unique column, and the leading column of an index or primary key', () => {
      expect(directWins(unique, 1)).toBe(true);
      expect(directWins(indexOn(1, 0), 1)).toBe(true);
      expect(directWins(compositeKey, 0)).toBe(true);
    });

    it('does not count a later column of a composite index or primary key', () => {
      expect(directWins(indexOn(0, 1), 1)).toBe(false);
      expect(directWins(compositeKey, 1)).toBe(false);
    });
  });

  it('costs entering a whole-table end as a scan, yet uses it when it is the only route', () => {
    const { a, b, c, base } = scene();
    const direct = join(whole(a), whole(b), 'direct', base);
    const ac = join(whole(a), colOf(c), 'ac', base);
    const cb = join(colOf(c), colOf(b), 'cb', base);
    expect(sets(cheapestJoinPath([a.id, b.id], byIdOf([...base, direct, ac, cb])))).toEqual({ connectors: [ac.id, cb.id].sort(), tables: [c.id] });
    const only = cheapestJoinPath([a.id, b.id], byIdOf([...base, direct]));
    expect(sets(only)).toEqual({ connectors: [direct.id], tables: [] });
    expect(routeOf(only)).toEqual([[a.id], [b.id, false]]);
  });

  it('breaks a cost tie with fewer hops, even when the longer path reaches the goal first', () => {
    // Long: 11 indexed hops, then a scan = (21, 12). Short: two scans, then an indexed hop = (21, 3). The long path's
    // tail node settles first (cost 11 < 20), so only the hop comparison on a tie lets the short path replace it.
    const all: TableNode[] = [];
    const mk = (): TableNode => {
      const t = pk(tbl(all.length * 150, all));
      all.push(t);
      return t;
    };
    const start = mk();
    let tail = start;
    const links: ConnectorNode[] = [];
    for (let i = 0; i <= SCAN_JOIN_COST; i++) {
      const next = mk();
      links.push(join(colOf(tail), colOf(next), `long${i}`, all));
      tail = next;
    }
    const x = mk();
    const p2 = mk();
    const goal = mk();
    links.push(join(whole(tail), whole(goal), 'tailGoal', all));
    const sx = join(whole(start), whole(x), 'sx', all);
    const xp = join(whole(x), whole(p2), 'xp', all);
    const pg = join(colOf(p2), colOf(goal), 'pg', all);
    const r = cheapestJoinPath([start.id, goal.id], byIdOf([...all, ...links, sx, xp, pg]));
    expect(sets(r)).toEqual({ connectors: [sx.id, xp.id, pg.id].sort(), tables: [x.id, p2.id].sort() });
  });

  it('uses the cheapest of several parallel connectors', () => {
    const a = tbl(0, []);
    const b = pk(tbl(600, [a]));
    const slow = join(whole(a), whole(b), 'slow', [a, b]);
    const fast = join(colOf(a), colOf(b), 'fast', [a, b]);
    expect(sets(cheapestJoinPath([a.id, b.id], byIdOf([a, b, slow, fast])))?.connectors).toEqual([fast.id]);
  });

  it('skips hidden connectors, hidden tables and non-table layers', () => {
    const { a, b, c, base, direct, ac, cb } = scene();
    const rect = createNode('rect', { x: 300, y: 300, width: 50, height: 50 }, base);
    const viaRect = [join(whole(a), whole(rect), 'ar', [a, rect]), join(whole(rect), whole(b), 'rb', [rect, b])];
    const path = (nodes: DesignNode[]) => sets(cheapestJoinPath([a.id, b.id], byIdOf(nodes)));
    expect(path([a, b, c, direct, ac, hide(cb)])?.tables).toEqual([]);
    expect(path([a, b, hide(c), direct, ac, cb])?.connectors).toEqual([direct.id]);
    expect(path([a, b, rect, ...viaRect])).toEqual(none);
    expect(path([a, b, c, ac])).toEqual(none);
    expect(cheapestJoinPath([a.id, b.id], byIdOf([a, b, c, ac]))?.route).toEqual([]);
  });

  describe('guaranteedOnly', () => {
    const card = (c: ConnectorNode, fromCardinality: ConnectorNode['fromCardinality'], toCardinality: ConnectorNode['toCardinality']): ConnectorNode => ({ ...c, fromCardinality, toCardinality });
    const guaranteed = (nodes: DesignNode[], from: string, to: string) => sets(cheapestJoinPath([from, to], byIdOf(nodes), true));

    it('skips a cheaper step that may find no row and takes the costlier route that always does', () => {
      const { a, b, base, direct, ac, cb } = scene();
      // Entering c through ac may find nothing, so the two-hop indexed route is out; direct enters b through its `from` end.
      const nodes = [...base, card(direct, 'one', 'one'), card(ac, 'one', 'zeroOrOne'), card(cb, 'one', 'one')];
      expect(sets(cheapestJoinPath([a.id, b.id], byIdOf(nodes)))?.connectors).toEqual([ac.id, cb.id].sort());
      expect(guaranteed(nodes, a.id, b.id)).toEqual({ connectors: [direct.id], tables: [] });
    });

    it('checks the end of the table being entered, so one connector can be guaranteed in one direction only', () => {
      const { a, b, base, direct } = scene();
      const nodes = [...base, card(direct, 'many', 'one')];
      expect(guaranteed(nodes, b.id, a.id)?.connectors).toEqual([direct.id]);
      expect(cheapestJoinPath([a.id, b.id], byIdOf(nodes), true)).toEqual({ connectors: new Set(), tables: new Set(), route: [] });
    });

    it('marks each step of the fastest route as guaranteed or not, so callers need not compare two searches', () => {
      const { a, b, base, ac, cb } = scene();
      const flags = (nodes: DesignNode[]) => cheapestJoinPath([a.id, b.id], byIdOf(nodes))?.route.map((s) => s.via?.guaranteed);
      expect(flags([...base, card(ac, 'one', 'one'), card(cb, 'one', 'oneOrMany')])).toEqual([undefined, true, true]);
      expect(flags([...base, card(ac, 'one', 'one'), card(cb, 'one', 'many')])).toEqual([undefined, true, false]);
    });

    it('guarantees only one and oneOrMany', () => {
      const { a, b, base, direct } = scene();
      const entersB = (end: ConnectorNode['toCardinality']) => guaranteed([...base, card(direct, end, 'many')], a.id, b.id)?.connectors.length;
      expect((['one', 'oneOrMany'] as const).map(entersB)).toEqual([1, 1]);
      expect((['zeroOrOne', 'many', 'none'] as const).map(entersB)).toEqual([0, 0, 0]);
    });
  });

  it('returns null unless exactly two visible tables are selected, ignoring other selected layers', () => {
    const { a, b, c, base, direct, ac, cb } = scene();
    const rect = createNode('rect', { x: 300, y: 300, width: 50, height: 50 }, base);
    const byId = byIdOf([...base, direct, ac, cb, rect, hide(tbl(900, base))]);
    expect(cheapestJoinPath([], byId)).toBeNull();
    expect(cheapestJoinPath([a.id], byId)).toBeNull();
    expect(cheapestJoinPath([a.id, b.id, c.id], byId)).toBeNull();
    expect(cheapestJoinPath([a.id, rect.id], byId)).toBeNull();
    expect(cheapestJoinPath([a.id, b.id, rect.id], byId)).not.toBeNull();
  });
});

describe('typesCompatible', () => {
  const compatible = [
    ['serial', 'int'],
    ['integer', 'int4'],
    ['mediumint', 'INT'],
    ['bigserial', 'bigint'],
    ['int8', 'serial8'],
    ['smallserial', 'int2'],
    ['varchar(255)', 'text'],
    ['character varying(40)', 'char(3)'],
    ['nvarchar(10)', 'string'],
    ['timestamp', 'timestamp without time zone'],
    ['datetime', 'timestamp'],
    ['timestamptz', 'timestamp with time zone'],
    ['numeric(10, 2)', 'decimal'],
    ['real', 'float4'],
    ['double precision', 'float8'],
    ['float', 'double'],
    ['bool', 'boolean'],
    ['json', 'jsonb'],
    ['uuid', ' UUID '],
    ['citext', 'CITEXT'],
    ['int unsigned', 'integer unsigned'],
    ['int(10) unsigned', 'mediumint unsigned'],
    ['tinyint(1)', 'boolean'],
    ['tinyint(4)', 'tinyint'],
  ] as const;
  it.each(compatible)('%s fits %s', (a, b) => {
    expect(typesCompatible(a, b)).toBe(true);
    expect(typesCompatible(b, a)).toBe(true);
  });

  const incompatible = [
    ['int', 'bigint'],
    ['smallint', 'int'],
    ['int', 'uuid'],
    ['text', 'uuid'],
    ['timestamp', 'timestamptz'],
    ['date', 'timestamp'],
    ['numeric', 'float'],
    ['boolean', 'int'],
    ['citext', 'text'],
    // MySQL rejects a foreign key between signed and unsigned columns.
    ['int unsigned', 'int'],
    ['bigint(20) unsigned', 'bigint'],
    ['tinyint', 'tinyint(1)'],
    ['tinyint(1)', 'int'],
  ] as const;
  it.each(incompatible)('%s does not fit %s', (a, b) => {
    expect(typesCompatible(a, b)).toBe(false);
  });
});
