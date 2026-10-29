import { describe, expect, it } from 'vitest';
import { createConnector } from './connector';
import { createGroup, createNode } from './nodes';
import { normalizeTree, renderedIds } from './tree';
import type { Box, DesignNode } from './types';

const window: Box = { x: 0, y: 0, width: 1000, height: 1000 };
const at = (x: number, y: number, size = 100): Box => ({ x, y, width: size, height: size });
const child = (n: DesignNode, parent: DesignNode): DesignNode => ({ ...n, parentId: parent.id });

describe('renderedIds', () => {
  it('skips a layer outside the window with its whole subtree', () => {
    const frame = createNode('frame', at(5000, 5000, 500), []);
    const inner = child(createNode('rect', at(5100, 5100), [frame]), frame);
    const near = createNode('rect', at(10, 10), [frame, inner]);
    expect(renderedIds([frame, inner, near], window, [])).toEqual(new Set([near.id]));
  });

  it('keeps only the in-window children of a frame that straddles the window', () => {
    const frame = createNode('frame', at(800, 0, 2000), []);
    const inside = child(createNode('rect', at(900, 100), [frame]), frame);
    const outside = child(createNode('rect', at(2000, 100), [frame, inside]), frame);
    expect(renderedIds([frame, inside, outside], window, [])).toEqual(new Set([frame.id, inside.id]));
  });

  it('mounts a pinned child of an out-of-window frame together with its frame', () => {
    const frame = createNode('frame', at(5000, 5000, 500), []);
    const a = child(createNode('rect', at(5100, 5100), [frame]), frame);
    const b = child(createNode('rect', at(5300, 5300), [frame, a]), frame);
    expect(renderedIds([frame, a, b], window, [b.id, 'gone'])).toEqual(new Set([frame.id, b.id]));
  });

  it('counts a perfectly horizontal connector that crosses the window', () => {
    const connector = { ...createConnector({ kind: 'point', x: -500, y: 400 }, { kind: 'point', x: 1500, y: 400 }, 'c', new Map()), x: -500, y: 400, width: 2000, height: 0 };
    expect(connector.height).toBe(0);
    expect(renderedIds([connector], window, [])).toEqual(new Set([connector.id]));
  });

  it('leaves out hidden layers and their subtrees unless pinned', () => {
    const group = { ...createGroup(null, []), ...at(100, 100), visible: false };
    const inner = child(createNode('rect', at(100, 100), [group]), group);
    expect(renderedIds([group, inner], window, [])).toEqual(new Set());
    expect(renderedIds([group, inner], window, [inner.id])).toEqual(new Set([group.id, inner.id]));
  });

  it('mounts about the window, not the whole board, for 1,000 tables', () => {
    const tables: DesignNode[] = [];
    for (let i = 0; i < 1000; i++) tables.push(createNode('table', { x: (i % 40) * 300, y: Math.floor(i / 40) * 300, width: 240, height: 100 }, []));
    // 300 px pitch on 40 columns: the window reaches rows 0-3 and columns 0-4 (4 x 5), not their neighbours.
    const ids = renderedIds(tables, { x: 0, y: 0, width: 1240, height: 1000 }, []);
    expect(ids.size).toBe(20);
  });
});

describe('normalizeTree: damaged parents', () => {
  it('breaks a parent cycle without losing either layer', () => {
    const a = createNode('frame', at(100, 100, 50), []);
    const b = createNode('frame', at(200, 100, 50), [a]);
    const nodes = normalizeTree([{ ...a, parentId: b.id }, { ...b, parentId: a.id }]);
    expect(nodes.map((n) => n.id).sort()).toEqual([a.id, b.id].sort());
    const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]));
    for (const n of nodes) {
      let p = n.parentId;
      for (let steps = 0; p !== null; steps += 1) {
        expect(steps).toBeLessThan(nodes.length);
        p = parentOf.get(p) ?? null;
      }
    }
  });

  it('loads a layer saved without parentId at the top level', () => {
    const old: Partial<DesignNode> = createNode('rect', at(10, 10, 50), []);
    delete old.parentId;
    expect(normalizeTree([old as DesignNode])[0]!.parentId).toBeNull();
  });
});
