import { describe, expect, it } from 'vitest';
import { createConnector, ROUTE_MARGIN, routeBetween } from './connector';
import { editorReducer, initialEditorState } from './editorReducer';
import { createGroup, createNode } from './nodes';
import { segmentHitsBox } from './orthogonalRoute';
import { byIdOf, normalizeTree } from './tree';
import type { Box, ConnectorNode, DesignNode, Point } from './types';

const table = (box: Box, others: DesignNode[]) => createNode('table', box, others);
const inflate = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, width: b.width + 2 * m, height: b.height + 2 * m });
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
  // The thresholds are wide on purpose: they exist to catch a search that blows up, not to rank machines.
  const drag = (start: DesignNode[], movingId: string, frames: number, step: number) => {
    let nodes = start;
    const times: number[] = [];
    for (let i = 0; i < frames; i++) {
      const moved = nodes.map((n) => (n.id === movingId ? { ...n, x: n.x + step } : n));
      const t0 = performance.now();
      nodes = normalizeTree(moved);
      times.push(performance.now() - t0);
    }
    return times;
  };

  it.each([64, 100])('drags a table among %i jittered tables and 100 far-apart connectors within a frame', (tableCount) => {
    const nodes = normalizeTree(jitteredSchema(tableCount, 100));
    const times = drag(nodes, nodes[Math.floor(tableCount / 2)]!.id, 5, 1);
    expect(times.reduce((sum, t) => sum + t, 0) / times.length).toBeLessThan(16);
  });

  it('routes 100 jittered tables and 100 connectors from scratch in one call', () => {
    const nodes = jitteredSchema(100, 100);
    const t0 = performance.now();
    normalizeTree(nodes);
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it('drags a table with 20 connectors through 100 tables without a slow frame', () => {
    const nodes = normalizeTree(jitteredSchema(100, 80, 20));
    const times = drag(nodes, nodes[50]!.id, 20, 12);
    expect(Math.max(...times)).toBeLessThan(32);
  });

  it('gives up quickly on a connector whose end table overlaps another table, among 300 tables', () => {
    const nodes = normalizeTree(jitteredSchema(300, 100));
    const link = nodes.find((n) => n.type === 'connector') as ConnectorNode;
    const target = link.to.kind === 'node' ? link.to.nodeId : '';
    const other = nodes.find((n) => n.type === 'table' && n.id !== target && n.id !== (link.from.kind === 'node' ? link.from.nodeId : ''))!;
    const overlapped = nodes.map((n) => (n.id === target ? { ...n, x: other.x + 30, y: other.y + 20 } : n));
    const t0 = performance.now();
    normalizeTree(overlapped);
    expect(performance.now() - t0).toBeLessThan(50);
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

  it('terminates on a parent cycle', () => {
    const { a, b, mid } = scene();
    const x = { ...mid, id: 'x', parentId: 'y' };
    const y = { ...mid, id: 'y', x: 800, parentId: 'x' };
    expect(() => routeBetween({ kind: 'node', nodeId: a.id }, { kind: 'node', nodeId: b.id }, 'orthogonal', byIdOf([a, b, x, y]))).not.toThrow();
  });
});
