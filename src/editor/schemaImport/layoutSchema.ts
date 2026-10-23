import type { SchemaLayout } from './types';

// Design choices: wide rank gaps leave room for connector routes and cardinality markers between columns.
const RANK_SEP = 120;
const NODE_SEP = 60;

export async function layoutSchema(
  tables: readonly { name: string; width: number; height: number }[],
  links: readonly { fromTable: string; toTable: string }[],
): Promise<SchemaLayout> {
  // Dynamic import keeps dagre out of the startup bundle.
  const { default: dagre } = await import('@dagrejs/dagre');

  const known = new Set(tables.map((t) => t.name));
  const valid = links.filter(
    (l) => l.fromTable !== l.toTable && known.has(l.fromTable) && known.has(l.toTable),
  );
  const linked = new Set(valid.flatMap((l) => [l.fromTable, l.toTable]));

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', ranksep: RANK_SEP, nodesep: NODE_SEP });
  g.setDefaultEdgeLabel(() => ({}));
  for (const t of tables) if (linked.has(t.name)) g.setNode(t.name, { width: t.width, height: t.height });
  // Referenced table first, so it ranks left of its referrers.
  for (const l of valid) g.setEdge(l.toTable, l.fromTable);
  dagre.layout(g);

  // dagre reports centers.
  const layout: SchemaLayout = new Map();
  let minX = Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of tables) {
    if (!linked.has(t.name)) continue;
    const n = g.node(t.name);
    const x = n.x - t.width / 2;
    const y = n.y - t.height / 2;
    layout.set(t.name, { x, y });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + t.height);
  }
  for (const p of layout.values()) {
    p.x -= minX;
    p.y -= minY;
  }

  // Without links dagre would stack everything in one rank, a strip thousands of px tall.
  const loose = tables.filter((t) => !linked.has(t.name));
  const cols = Math.ceil(Math.sqrt(loose.length));
  const colWidth: number[] = [];
  const rowHeight: number[] = [];
  loose.forEach((t, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    colWidth[c] = Math.max(colWidth[c] ?? 0, t.width);
    rowHeight[r] = Math.max(rowHeight[r] ?? 0, t.height);
  });
  const top = layout.size > 0 ? maxY - minY + RANK_SEP : 0;
  loose.forEach((t, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = colWidth.slice(0, c).reduce((sum, w) => sum + w + NODE_SEP, 0);
    const y = top + rowHeight.slice(0, r).reduce((sum, h) => sum + h + NODE_SEP, 0);
    layout.set(t.name, { x, y });
  });
  return layout;
}
