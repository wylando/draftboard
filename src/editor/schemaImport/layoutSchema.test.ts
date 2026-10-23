import { describe, expect, it } from 'vitest';
import { layoutSchema } from './layoutSchema';

const tables = [
  { name: 'users', width: 240, height: 160 },
  { name: 'posts', width: 240, height: 200 },
  { name: 'comments', width: 260, height: 120 },
  { name: 'audit_log', width: 200, height: 100 },
];
const links = [
  { fromTable: 'posts', toTable: 'users' },
  { fromTable: 'comments', toTable: 'posts' },
  { fromTable: 'comments', toTable: 'users' },
];

describe('layoutSchema', () => {
  it('positions every table, including unconnected ones', async () => {
    const layout = await layoutSchema(tables, links);
    expect([...layout.keys()].sort()).toEqual(tables.map((t) => t.name).sort());
  });

  it('never overlaps two table boxes', async () => {
    const layout = await layoutSchema(tables, links);
    for (const a of tables) {
      for (const b of tables) {
        if (a.name >= b.name) continue;
        const pa = layout.get(a.name)!;
        const pb = layout.get(b.name)!;
        const apart =
          pa.x + a.width <= pb.x ||
          pb.x + b.width <= pa.x ||
          pa.y + a.height <= pb.y ||
          pb.y + b.height <= pa.y;
        expect(apart, `${a.name} overlaps ${b.name}`).toBe(true);
      }
    }
  });

  it('places a referenced table left of the table that references it', async () => {
    const layout = await layoutSchema(tables, links);
    const width = new Map(tables.map((t) => [t.name, t.width]));
    for (const l of links) {
      const referenced = layout.get(l.toTable)!;
      const referencing = layout.get(l.fromTable)!;
      expect(referenced.x + width.get(l.toTable)!).toBeLessThanOrEqual(referencing.x);
    }
  });

  it('starts the block at the origin', async () => {
    const layout = await layoutSchema(tables, links);
    const points = [...layout.values()];
    expect(Math.min(...points.map((p) => p.x))).toBe(0);
    expect(Math.min(...points.map((p) => p.y))).toBe(0);
  });

  it('ignores unknown-table and self links', async () => {
    const noisy = await layoutSchema(tables, [
      ...links,
      { fromTable: 'users', toTable: 'users' },
      { fromTable: 'ghost', toTable: 'users' },
      { fromTable: 'posts', toTable: 'ghost' },
    ]);
    expect(noisy).toEqual(await layoutSchema(tables, links));
  });

  it('packs unconnected tables into a grid, not a strip', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `t${i}`, width: 240, height: 120 }));
    const layout = await layoutSchema(many, []);
    const xs = many.map((t) => layout.get(t.name)!.x);
    const ys = many.map((t) => layout.get(t.name)!.y);
    const width = Math.max(...xs) + 240 - Math.min(...xs);
    const height = Math.max(...ys) + 120 - Math.min(...ys);
    expect(width).toBeGreaterThanOrEqual(height / 3);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.min(...ys)).toBe(0);
    for (let i = 0; i < many.length; i++) {
      for (let j = i + 1; j < many.length; j++) {
        expect(
          xs[i]! + 240 <= xs[j]! || xs[j]! + 240 <= xs[i]! || ys[i]! + 120 <= ys[j]! || ys[j]! + 120 <= ys[i]!,
          `t${i} overlaps t${j}`,
        ).toBe(true);
      }
    }
  });

  it('returns an empty layout for no tables', async () => {
    expect((await layoutSchema([], [])).size).toBe(0);
  });
});
