import { createId, nameKey } from './names';
import type { Column, TableIndex, TableNode } from './types';

/**
 * Table defaults are document data, like the shape defaults in `nodes.ts`;
 * they live here so `nodes.ts` can import them without a cycle.
 * Header colors offered as swatches: muted, so dark text reads on each.
 */
export const TABLE_ACCENTS = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#ede9fe', '#ccfbf1', '#ffedd5', '#e5e7eb'] as const;

/** What a table draws with besides its own fill, stroke and accent; `onDark*` for dark fills and accents. */
export const TABLE_COLORS = {
  text: '#1e1e1e',
  muted: '#757575',
  onDark: '#ffffff',
  onDarkMuted: '#b3b3b3',
  divider: '#ececec',
  badge: '#0a6dc2',
  onDarkBadge: '#80caff',
} as const;

/** Design choice: table layout in world px. */
export const TABLE_HEADER_HEIGHT = 36;
export const TABLE_ROW_HEIGHT = 28;

/** Design choice: narrower than this, a row can't show a badge, a short name and a type. */
export const MIN_TABLE_WIDTH = 120;

export const tableHeight = (columnCount: number) => TABLE_HEADER_HEIGHT + TABLE_ROW_HEIGHT * columnCount;

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite';

/**
 * Suggestions only: column types stay free text, so switching dialects never
 * invalidates a document. `idType` types the `id` column of a new table, and
 * `defaultType` a newly added column.
 */
export const SQL_DIALECTS: Record<SqlDialect, { label: string; idType: string; defaultType: string; types: string[] }> = {
  postgres: {
    label: 'PostgreSQL',
    idType: 'uuid',
    defaultType: 'text',
    types: ['uuid', 'text', 'varchar(255)', 'integer', 'bigint', 'smallint', 'serial', 'bigserial', 'boolean', 'numeric', 'real', 'double precision', 'date', 'time', 'timestamp', 'timestamptz', 'interval', 'json', 'jsonb', 'bytea'],
  },
  mysql: {
    label: 'MySQL',
    idType: 'bigint',
    defaultType: 'varchar(255)',
    types: ['bigint', 'int', 'smallint', 'tinyint', 'varchar(255)', 'char(36)', 'text', 'boolean', 'decimal(10,2)', 'float', 'double', 'date', 'time', 'datetime', 'timestamp', 'json', 'blob'],
  },
  sqlite: {
    label: 'SQLite',
    idType: 'integer',
    defaultType: 'text',
    types: ['integer', 'text', 'real', 'numeric', 'blob'],
  },
};

export const SQL_DIALECT_IDS = Object.keys(SQL_DIALECTS) as SqlDialect[];

export const isSqlDialect = (v: unknown): v is SqlDialect => typeof v === 'string' && Object.hasOwn(SQL_DIALECTS, v);

export function createColumn(name: string, dataType: string, primaryKey = false): Column {
  return { id: createId(), name, dataType, primaryKey, nullable: false, unique: false };
}

/** Whether a column other than `id` in `table` already has `name`, ignoring case. */
export const columnNameTaken = (table: TableNode, name: string, id: string) =>
  table.columns.some((c) => c.id !== id && nameKey(c.name) === nameKey(name));

/** The first free "column_n" in `table`. */
export function nextColumnName(table: TableNode): string {
  const taken = new Set(table.columns.map((c) => nameKey(c.name)));
  let n = 1;
  while (taken.has(`column_${n}`)) n += 1;
  return `column_${n}`;
}

/** `name` as a lowercase SQL identifier: "Order Items" → "order_items". */
export const sqlIdentifier = (name: string) => name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'table';

/** `desired`, or the first free `desired_n`: unique names that stay SQL identifiers. */
export function uniqueIdentifier(desired: string, taken: Set<string>): string {
  if (!taken.has(nameKey(desired))) return desired;
  let n = 2;
  while (taken.has(nameKey(`${desired}_${n}`))) n += 1;
  return `${desired}_${n}`;
}

export const indexNameTaken = (table: TableNode, name: string, id: string) =>
  table.indexes.some((i) => i.id !== id && nameKey(i.name) === nameKey(name));

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

export type TableEdit =
  | { kind: 'addColumn'; column: Column }
  | { kind: 'updateColumn'; columnId: string; patch: Partial<Omit<Column, 'id'>> }
  | { kind: 'deleteColumn'; columnId: string }
  | { kind: 'setAccent'; accent: string }
  | { kind: 'addIndex'; index: TableIndex }
  | { kind: 'updateIndex'; indexId: string; patch: Partial<Omit<TableIndex, 'id'>> }
  | { kind: 'deleteIndex'; indexId: string };

/**
 * `table` with `edit` applied, or null when the edit is refused or changes
 * nothing: an empty or taken column or index name, an unknown column or
 * index, or an index naming a column the table doesn't have (or one twice).
 */
export function applyTableEdit(table: TableNode, edit: TableEdit): TableNode | null {
  const hasColumn = (id: string) => table.columns.some((c) => c.id === id);
  switch (edit.kind) {
    case 'addColumn': {
      const name = edit.column.name.trim();
      if (!name || columnNameTaken(table, name, edit.column.id)) return null;
      return { ...table, columns: [...table.columns, { ...edit.column, name }] };
    }
    case 'updateColumn': {
      const column = table.columns.find((c) => c.id === edit.columnId);
      if (!column) return null;
      const patch = { ...edit.patch };
      if (patch.name !== undefined) {
        patch.name = patch.name.trim();
        if (!patch.name || columnNameTaken(table, patch.name, column.id)) return null;
      }
      const next = { ...column, ...patch };
      // A primary key is never nullable: whichever flag was just turned on wins.
      if (next.primaryKey && next.nullable) {
        if (patch.nullable && !column.nullable) next.primaryKey = false;
        else next.nullable = false;
      }
      if ((Object.keys(next) as Array<keyof Column>).every((k) => next[k] === column[k])) return null;
      return { ...table, columns: table.columns.map((c) => (c.id === column.id ? next : c)) };
    }
    case 'deleteColumn': {
      if (!hasColumn(edit.columnId)) return null;
      // An index loses the column, and goes if that was its only column. An index
      // still being set up (no columns yet) is left alone.
      const indexes = table.indexes.flatMap((i) => {
        if (!i.columnIds.includes(edit.columnId)) return [i];
        const columnIds = i.columnIds.filter((id) => id !== edit.columnId);
        return columnIds.length > 0 ? [{ ...i, columnIds }] : [];
      });
      return { ...table, columns: table.columns.filter((c) => c.id !== edit.columnId), indexes };
    }
    case 'setAccent':
      return edit.accent === table.accent ? null : { ...table, accent: edit.accent };
    case 'addIndex': {
      const name = edit.index.name.trim();
      const { columnIds } = edit.index;
      if (!name || indexNameTaken(table, name, edit.index.id) || table.indexes.some((i) => i.id === edit.index.id)) return null;
      if (!columnIds.every(hasColumn) || new Set(columnIds).size !== columnIds.length) return null;
      return { ...table, indexes: [...table.indexes, { ...edit.index, name }] };
    }
    case 'updateIndex': {
      const index = table.indexes.find((i) => i.id === edit.indexId);
      if (!index) return null;
      const next = { ...index, ...edit.patch, name: (edit.patch.name ?? index.name).trim() };
      if (!next.name || indexNameTaken(table, next.name, index.id)) return null;
      if (!next.columnIds.every(hasColumn) || new Set(next.columnIds).size !== next.columnIds.length) return null;
      if (next.name === index.name && next.unique === index.unique && sameIds(next.columnIds, index.columnIds)) return null;
      return { ...table, indexes: table.indexes.map((i) => (i.id === index.id ? next : i)) };
    }
    case 'deleteIndex':
      if (!table.indexes.some((i) => i.id === edit.indexId)) return null;
      return { ...table, indexes: table.indexes.filter((i) => i.id !== edit.indexId) };
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

/**
 * A saved table's columns and indexes, repaired into the shape `editTable`
 * keeps, so one damaged table never costs the rest of a document: entries
 * that aren't objects are dropped, repeated or missing ids get new ones,
 * repeated names (ignoring case) get the next free `name_n`, a primary key loses
 * `nullable`, and index columns that don't exist (or repeat) are dropped.
 */
export function repairTableData(data: Record<string, unknown>): Pick<TableNode, 'columns' | 'indexes' | 'accent' | 'note'> {
  const ids = new Set<string>();
  const freshId = (id: unknown) => {
    const next = typeof id === 'string' && id !== '' && !ids.has(id) ? id : createId();
    ids.add(next);
    return next;
  };
  const names = new Set<string>();
  const columns: Column[] = (Array.isArray(data.columns) ? data.columns : []).filter(isRecord).map((c, i) => {
    const name = uniqueIdentifier(str(c.name, '').trim() || `column_${i + 1}`, names);
    names.add(nameKey(name));
    const primaryKey = c.primaryKey === true;
    return {
      id: freshId(c.id),
      name,
      dataType: str(c.dataType, ''),
      primaryKey,
      nullable: c.nullable === true && !primaryKey,
      unique: c.unique === true,
      ...(typeof c.default === 'string' ? { default: c.default } : {}),
      ...(typeof c.note === 'string' ? { note: c.note } : {}),
    };
  });
  const columnIds = new Set(columns.map((c) => c.id));
  ids.clear();
  const indexNames = new Set<string>();
  const indexes: TableIndex[] = (Array.isArray(data.indexes) ? data.indexes : []).filter(isRecord).map((i) => {
    const name = uniqueIdentifier(str(i.name, '').trim() || 'index', indexNames);
    indexNames.add(nameKey(name));
    const refs = Array.isArray(i.columnIds) ? i.columnIds.filter((id): id is string => typeof id === 'string' && columnIds.has(id)) : [];
    return { id: freshId(i.id), name, columnIds: [...new Set(refs)], unique: i.unique === true };
  });
  return {
    columns,
    indexes,
    accent: str(data.accent, TABLE_ACCENTS[0]),
    ...(typeof data.note === 'string' ? { note: data.note } : {}),
  };
}
