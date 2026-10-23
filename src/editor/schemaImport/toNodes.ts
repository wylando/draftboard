import { createConnector, linksToItself, sameAnchor } from '../model/connector';
import { createNode, DEFAULT_SIZE, nextName } from '../model/nodes';
import { createId, nameKey, uniqueName } from '../model/names';
import { createColumn, sqlIdentifier, tableHeight, uniqueIdentifier } from '../model/table';
import type { Anchor, Column, ConnectorNode, DesignNode, Point, TableIndex, TableNode } from '../model/types';
import type { ImportedSchema, ImportedTable, ImportWarning } from './types';

// repairTableData is not reused: it repairs silently, but the preview needs a warning per repair.
function buildTable(source: ImportedTable, node: TableNode, warnings: ImportWarning[]): Pick<TableNode, 'columns' | 'indexes'> & { columnBySourceName: ReadonlyMap<string, string> } {
  const warn = (message: string) => warnings.push({ message });
  // Every real source name is reserved up front, so a duplicate's rename never takes a name a later column owns.
  const taken = new Set(source.columns.map((c) => nameKey(c.name.trim())).filter((k) => k !== ''));
  const seen = new Set<string>();
  const columns: Column[] = [];
  // Index columns resolve against the names as written, to the first column that had them.
  const firstByName = new Map<string, string>();
  for (const c of source.columns) {
    let name = c.name.trim();
    const column = createColumn(name, c.dataType, c.primaryKey);
    if (!name) {
      let n = 1;
      while (taken.has(`column_${n}`)) n += 1;
      name = `column_${n}`;
      taken.add(name);
      warn(`Table "${node.name}": a column has no name; imported as "${name}"`);
    } else if (seen.has(nameKey(name))) {
      const renamed = uniqueIdentifier(name, taken);
      warn(`Table "${node.name}": column "${name}" is repeated; imported as "${renamed}"`);
      taken.add(nameKey(renamed));
      name = renamed;
    } else {
      firstByName.set(nameKey(name), column.id);
    }
    seen.add(nameKey(name));
    if (c.primaryKey && c.nullable) warn(`Table "${node.name}": primary key "${name}" can't be nullable; imported as NOT NULL`);
    columns.push({
      ...column,
      name,
      nullable: c.nullable && !c.primaryKey,
      unique: c.unique,
      ...(c.default !== undefined ? { default: c.default } : {}),
    });
  }

  const indexes: TableIndex[] = [];
  const indexNames = new Set<string>();
  for (const i of source.indexes) {
    const label = i.name.trim() || '(unnamed)';
    const wanted = i.columns.map((n) => n.trim());
    const ids = wanted.map((n) => firstByName.get(nameKey(n)));
    const unknown = wanted.find((_, k) => ids[k] === undefined);
    if (wanted.length === 0 || unknown !== undefined || new Set(ids).size !== ids.length) {
      const why = wanted.length === 0 ? 'has no columns' : unknown !== undefined ? `names unknown column "${unknown}"` : 'repeats a column';
      warn(`Table "${node.name}": index ${label} ${why}; skipped`);
      continue;
    }
    const columnIds = ids as string[];
    const columnNames = columnIds.map((id) => columns.find((c) => c.id === id)?.name ?? '');
    const desired = i.name.trim() || `${sqlIdentifier(node.name)}_${columnNames.map(sqlIdentifier).join('_')}_idx`;
    const name = uniqueIdentifier(desired, indexNames);
    if (i.name.trim() && name !== desired) warn(`Table "${node.name}": index "${desired}" is repeated; imported as "${name}"`);
    indexNames.add(nameKey(name));
    indexes.push({ id: createId(), name, columnIds, unique: i.unique });
  }
  return { columns, indexes, columnBySourceName: firstByName };
}

type ImportedTableRefs = Map<string, { table: TableNode; columnBySourceName: ReadonlyMap<string, string> }>;

function columnAnchor(tables: ImportedTableRefs, tableName: string, columnName: string): Anchor | null {
  const ref = tables.get(nameKey(tableName.trim()));
  const columnId = ref?.columnBySourceName.get(nameKey(columnName.trim()));
  return ref && columnId ? { kind: 'column', tableId: ref.table.id, columnId } : null;
}

export function schemaToNodes(
  schema: ImportedSchema,
  layout: ReadonlyMap<string, Point>,
  origin: Point,
  existing: readonly DesignNode[],
): { nodes: DesignNode[]; warnings: ImportWarning[] } {
  const warnings: ImportWarning[] = [];
  const taken = new Set(existing.map((n) => nameKey(n.name)));
  const nodes: DesignNode[] = [];
  const bySourceName: ImportedTableRefs = new Map();
  for (const source of schema.tables) {
    const at = layout.get(source.name);
    const box = {
      x: origin.x + (at?.x ?? 0),
      y: origin.y + (at?.y ?? 0),
      width: DEFAULT_SIZE.table.width,
      height: tableHeight(source.columns.length),
    };
    const base = createNode('table', box, [...existing, ...nodes]) as TableNode;
    const written = source.name.trim();
    if (!written) warnings.push({ message: 'A table has no name; imported as "table"' });
    const wanted = written || 'table';
    const name = uniqueName(wanted, taken);
    if (name !== wanted) warnings.push({ message: `"${wanted}" already exists; imported as "${name}"` });
    taken.add(nameKey(name));
    // createNode sizes a table for its single starter column, so the height is set again here.
    const named = { ...base, name, height: box.height };
    const { columnBySourceName, ...built } = buildTable(source, named, warnings);
    const table: TableNode = { ...named, ...built, ...(source.note !== undefined ? { note: source.note } : {}) };
    nodes.push(table);
    // Looked up by the name as written: the layer may have been renamed above.
    bySourceName.set(nameKey(written), { table, columnBySourceName });
  }

  const connectors: ConnectorNode[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // Declared first, so when a guess repeats a declared relation the declared one is the one kept.
  const relations = [...schema.relations].sort((a, b) => Number(b.declared) - Number(a.declared));
  for (const r of relations) {
    const label = `Relationship ${r.fromTable}.${r.fromColumn} → ${r.toTable}.${r.toColumn}`;
    const from = columnAnchor(bySourceName, r.fromTable, r.fromColumn);
    const to = columnAnchor(bySourceName, r.toTable, r.toColumn);
    if (!from || !to) {
      warnings.push({ message: `${label} points at a missing table or column; skipped` });
    } else if (linksToItself(from, to)) {
      warnings.push({ message: `${label} links a column to itself; skipped` });
    } else if (!connectors.some((c) => sameAnchor(c.from, from) && sameAnchor(c.to, to))) {
      const connector = createConnector(from, to, nextName('connector', [...existing, ...nodes, ...connectors]), byId);
      // An inferred relation is only a guess, so it doesn't claim a foreign key.
      connectors.push(r.declared ? connector : { ...connector, isForeignKey: false });
    }
  }
  nodes.push(...connectors);
  return { nodes, warnings };
}
