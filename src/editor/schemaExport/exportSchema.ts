import { isMany } from '../model/connector';
import { nameKey } from '../model/names';
import { SQL_DIALECTS, sqlIdentifier, uniqueIdentifier, type SqlDialect } from '../model/table';
import { descendantIds, isEffectivelyVisible } from '../model/tree';
import type { Anchor, Cardinality, Column, DesignNode, TableNode } from '../model/types';

/** `from.fromColumn` references `to.toColumn`. */
export interface ExportForeignKey {
  from: TableNode;
  fromColumn: Column;
  to: TableNode;
  toColumn: Column;
  /** Neither end is many, so the referencing column is unique too. */
  oneToOne: boolean;
}

/** Both tables have a primary key, which is what the link refers to. */
export interface ExportManyToMany {
  a: TableNode;
  b: TableNode;
}

/** What both formats are written from: the tables in scope and the relationships the formats can express. */
export interface ExportSchema {
  /** Whether the tables came from the selection or, with none selected, the whole board. */
  scope: 'selection' | 'board';
  tables: TableNode[];
  foreignKeys: ExportForeignKey[];
  manyToMany: ExportManyToMany[];
  /** Problems with tables themselves. */
  warnings: string[];
  /** Relationships the export can't express, named by their ends. */
  skippedLinks: SkippedLink[];
}

export interface SkippedLink {
  /** "users.id → teams.owner_id", or "users → teams" for a link between whole tables. */
  ends: string;
  reason: string;
  /** Set when the link was dropped only because this table isn't in scope. */
  missingTableId?: string;
}

export interface ExportText {
  text: string;
  warnings: string[];
}

const single = (c: Cardinality) => c === 'one' || c === 'zeroOrOne';
const primaryKey = (t: TableNode) => t.columns.filter((c) => c.primaryKey);

/**
 * The selected tables (a selected frame or group brings its tables), or every visible table when the
 * selection holds none. Hidden tables count only when selected, since then the user asked for them.
 */
export function collectSchema(nodes: readonly DesignNode[], selectedIds: readonly string[]): ExportSchema {
  const warnings: string[] = [];
  const skippedLinks: SkippedLink[] = [];
  const picked = new Set([...selectedIds, ...descendantIds(nodes, selectedIds)]);
  const allTables = nodes.filter((n): n is TableNode => n.type === 'table');
  let inScope = allTables.filter((t) => picked.has(t.id));
  const scope = inScope.length > 0 ? 'selection' : 'board';
  if (scope === 'board') {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    inScope = allTables.filter((t) => isEffectivelyVisible(byId, t));
  }
  const tables = inScope.filter((t) => {
    if (t.columns.length > 0) return true;
    warnings.push(`Table "${t.name}" has no columns; skipped`);
    return false;
  });

  const exported = new Map(tables.map((t) => [t.id, t]));
  const anyTable = new Map(allTables.map((t) => [t.id, t]));
  const foreignKeys: ExportForeignKey[] = [];
  const manyToMany: ExportManyToMany[] = [];
  const endName = (a: Anchor) => {
    if (a.kind === 'column') {
      const t = anyTable.get(a.tableId);
      return `${t?.name ?? '?'}.${t?.columns.find((c) => c.id === a.columnId)?.name ?? '?'}`;
    }
    return a.kind === 'node' ? (anyTable.get(a.nodeId)?.name ?? '?') : '?';
  };
  for (const n of nodes) {
    if (n.type !== 'connector') continue;
    const ends = `${endName(n.from)} → ${endName(n.to)}`;
    const fromId = n.from.kind === 'column' ? n.from.tableId : n.from.kind === 'node' ? n.from.nodeId : null;
    const toId = n.to.kind === 'column' ? n.to.tableId : n.to.kind === 'node' ? n.to.nodeId : null;
    const from = fromId === null ? undefined : exported.get(fromId);
    const to = toId === null ? undefined : exported.get(toId);
    if (!from || !to) {
      // Only links that leave the export are worth a word; lines between other shapes aren't relationships.
      const missing = from ? anyTable.get(toId ?? '') : to ? anyTable.get(fromId ?? '') : undefined;
      if (missing && n.isForeignKey) skippedLinks.push({ ends, reason: `"${missing.name}" isn't included`, missingTableId: missing.id });
      continue;
    }
    if (n.from.kind === 'column' && n.to.kind === 'column') {
      const { columnId: fromColumnId } = n.from;
      const { columnId: toColumnId } = n.to;
      const fromColumn = from.columns.find((c) => c.id === fromColumnId);
      const toColumn = to.columns.find((c) => c.id === toColumnId);
      if (!fromColumn || !toColumn) continue;
      if (!n.isForeignKey) {
        skippedLinks.push({ ends, reason: "isn't a foreign key" });
        continue;
      }
      // Databases only let a foreign key reference a key: PostgreSQL rejects anything else outright.
      if (!toColumn.unique && !(toColumn.primaryKey && primaryKey(to).length === 1)) {
        skippedLinks.push({ ends, reason: `"${to.name}"."${toColumn.name}" isn't unique or the primary key` });
        continue;
      }
      if (foreignKeys.some((f) => f.fromColumn === fromColumn && f.toColumn === toColumn)) continue;
      foreignKeys.push({ from, fromColumn, to, toColumn, oneToOne: single(n.fromCardinality) && single(n.toCardinality) });
    } else if (n.from.kind === 'node' && n.to.kind === 'node') {
      if (!isMany(n.fromCardinality) || !isMany(n.toCardinality)) {
        skippedLinks.push({ ends, reason: "links whole tables but isn't many-to-many; link columns to export a foreign key" });
        continue;
      }
      const unkeyed = [from, to].find((t) => primaryKey(t).length === 0);
      if (unkeyed) {
        skippedLinks.push({ ends, reason: `"${unkeyed.name}" has no primary key` });
        continue;
      }
      if (manyToMany.some((m) => (m.a === from && m.b === to) || (m.a === to && m.b === from))) continue;
      manyToMany.push({ a: from, b: to });
    }
  }
  return { scope, tables, foreignKeys, manyToMany, warnings, skippedLinks };
}

const quoteChar: Record<SqlDialect, string> = { postgres: '"', mysql: '`', sqlite: '"' };

/** A column's type, or the dialect's default type (with a warning) when the user left it blank. */
function typeOf(table: TableNode, column: Column, dialect: SqlDialect, warnings: string[]): string {
  const type = column.dataType.trim();
  if (type) return type;
  const fallback = SQL_DIALECTS[dialect].defaultType;
  warnings.push(`Table "${table.name}": column "${column.name}" has no type; exported as ${fallback}`);
  return fallback;
}

/** A column that refers to an auto-numbered key stores the plain number, not another sequence. */
const referenceType = (type: string) =>
  type
    .replace(/^smallserial$/i, 'smallint')
    .replace(/^serial$/i, 'integer')
    .replace(/^bigserial$/i, 'bigint')
    .replace(/\s+(?:auto_increment|autoincrement)\b/i, '')
    .replace(/\s+generated\s+(?:always|by\s+default)\s+as\s+identity\b.*$/i, '');

const STRING_DEFAULT = /^'(?:[^']|'')*'$/s;
const LITERAL_DEFAULT = /^(?:[-+]?\d+(?:\.\d+)?|true|false|null|\(.*\))$/is;
/** SQLite takes all three bare; MySQL only CURRENT_TIMESTAMP and its synonyms, which is how mysqldump writes them. */
const SQLITE_TIME_DEFAULT = /^current_(?:time|date|timestamp)$/i;
const MYSQL_TIME_DEFAULT = /^(?:current_timestamp|now|localtime|localtimestamp)(?:\(\d*\))?$/i;

/**
 * MySQL and SQLite read only a literal as a bare default; an expression such as `uuid()` needs parentheses.
 * Line breaks outside a string become spaces, so each column stays on its own line.
 */
function sqlDefault(value: string, dialect: SqlDialect): string {
  if (STRING_DEFAULT.test(value)) return value;
  const oneLine = value.replace(/\s*[\r\n]+\s*/g, ' ');
  const bare = dialect === 'postgres' || LITERAL_DEFAULT.test(oneLine) || (dialect === 'mysql' ? MYSQL_TIME_DEFAULT : SQLITE_TIME_DEFAULT).test(oneLine);
  return bare ? oneLine : `(${oneLine})`;
}

// PostgreSQL ends a `--` comment at a lone carriage return too.
const comment = (text: string) => text.split(/\r\n|\r|\n/).map((line) => `-- ${line}`.trimEnd());

interface SqlTable {
  name: string;
  /** For warnings: the layer name, or the junction it was made for. */
  label: string;
  columns: Array<{ name: string; type: string; primaryKey: boolean; nullable: boolean; unique: boolean; default?: string; note?: string }>;
  indexes: Array<{ name: string; columns: string[]; unique: boolean }>;
  note?: string;
}

interface SqlForeignKey {
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
}

/**
 * CREATE TABLE statements, then indexes, then foreign keys. PostgreSQL and MySQL add foreign keys with ALTER
 * TABLE after every table exists, so the order of tables and reference cycles don't matter; SQLite can't
 * ALTER TABLE ADD a constraint but doesn't check references when a table is created, so its keys go inline.
 * Every identifier is quoted: layer names are free text, and quoting keeps their case and spaces exactly.
 * A many-to-many becomes a junction table holding both primary keys.
 */
export function toSql(schema: ExportSchema, dialect: SqlDialect): ExportText {
  const warnings: string[] = [];
  const q = quoteChar[dialect];
  const id = (name: string) => `${q}${name.replaceAll(q, q + q)}${q}`;
  const list = (names: string[]) => names.map(id).join(', ');

  // A column that is the whole primary key is unique already; one that is part of it mustn't be unique alone.
  const uniqueColumns = new Set(schema.foreignKeys.filter((f) => f.oneToOne && !f.fromColumn.primaryKey).map((f) => f.fromColumn));
  const tables: SqlTable[] = schema.tables.map((t) => ({
    name: t.name,
    label: t.name,
    note: t.note,
    columns: t.columns.map((c) => ({
      name: c.name,
      type: typeOf(t, c, dialect, warnings),
      primaryKey: c.primaryKey,
      nullable: c.nullable,
      unique: c.unique || uniqueColumns.has(c),
      default: c.default,
      note: c.note,
    })),
    indexes: t.indexes.flatMap((i) => {
      if (i.columnIds.length === 0) {
        warnings.push(`Table "${t.name}": index "${i.name}" has no columns; skipped`);
        return [];
      }
      const columns = i.columnIds.map((cid) => t.columns.find((c) => c.id === cid)?.name);
      if (columns.some((c) => c === undefined)) {
        warnings.push(`Table "${t.name}": index "${i.name}" names a column the table doesn't have; skipped`);
        return [];
      }
      return [{ name: i.name, columns: columns as string[], unique: i.unique }];
    }),
  }));
  const foreignKeys: SqlForeignKey[] = schema.foreignKeys.map((f) => ({
    table: f.from.name,
    columns: [f.fromColumn.name],
    refTable: f.to.name,
    refColumns: [f.toColumn.name],
  }));

  const tableNames = new Set(tables.map((t) => nameKey(t.name)));
  for (const { a, b } of schema.manyToMany) {
    const name = uniqueIdentifier(`${sqlIdentifier(a.name)}_${sqlIdentifier(b.name)}`, tableNames);
    tableNames.add(nameKey(name));
    const taken = new Set<string>();
    const side = (t: TableNode) =>
      primaryKey(t).map((c) => {
        const column = uniqueIdentifier(`${sqlIdentifier(t.name)}_${sqlIdentifier(c.name)}`, taken);
        taken.add(nameKey(column));
        return { name: column, type: referenceType(typeOf(t, c, dialect, [])), ref: c.name };
      });
    const left = side(a);
    const right = side(b);
    tables.push({
      name,
      label: name,
      note: `Junction table for the many-to-many between "${a.name}" and "${b.name}"`,
      columns: [...left, ...right].map((c) => ({ name: c.name, type: c.type, primaryKey: true, nullable: false, unique: false })),
      indexes: [],
    });
    foreignKeys.push(
      { table: name, columns: left.map((c) => c.name), refTable: a.name, refColumns: left.map((c) => c.ref) },
      { table: name, columns: right.map((c) => c.name), refTable: b.name, refColumns: right.map((c) => c.ref) },
    );
  }

  // PostgreSQL and SQLite keep tables and indexes in one namespace; MySQL's index names are per table.
  if (dialect !== 'mysql') {
    const taken = new Set(tableNames);
    for (const t of tables) {
      for (const i of t.indexes) {
        const name = uniqueIdentifier(i.name, taken);
        if (name !== i.name) warnings.push(`Table "${t.label}": index "${i.name}" is also used by another table; exported as "${name}"`);
        i.name = name;
        taken.add(nameKey(name));
      }
    }
  }

  const reference = (f: SqlForeignKey) => `FOREIGN KEY (${list(f.columns)}) REFERENCES ${id(f.refTable)} (${list(f.refColumns)})`;
  const statements: string[] = [];
  for (const t of tables) {
    const keys = t.columns.filter((c) => c.primaryKey);
    const lines: Array<{ sql: string; note?: string }> = t.columns.map((c) => {
      const inlineKey = c.primaryKey && keys.length === 1;
      let sql = `${id(c.name)} ${c.type}`;
      if (inlineKey) sql += ' PRIMARY KEY';
      else if (!c.nullable) sql += ' NOT NULL';
      if (c.unique && !inlineKey) sql += ' UNIQUE';
      if (c.default !== undefined && c.default.trim() !== '') sql += ` DEFAULT ${sqlDefault(c.default.trim(), dialect)}`;
      return { sql, note: c.note };
    });
    if (keys.length > 1) lines.push({ sql: `PRIMARY KEY (${list(keys.map((c) => c.name))})` });
    if (dialect === 'sqlite') for (const f of foreignKeys.filter((f) => f.table === t.name)) lines.push({ sql: reference(f) });
    const body = lines.map((l, i) => {
      const comma = i < lines.length - 1 ? ',' : '';
      // A trailing comment ends at the line break, so a note's own breaks become spaces.
      return `  ${l.sql}${comma}${l.note ? ` -- ${l.note.replace(/\s*[\r\n]+\s*/g, ' ')}` : ''}`;
    });
    statements.push([...(t.note ? comment(t.note) : []), `CREATE TABLE ${id(t.name)} (`, ...body, ');'].join('\n'));
  }
  const indexes = tables.flatMap((t) =>
    t.indexes.map((i) => `CREATE ${i.unique ? 'UNIQUE ' : ''}INDEX ${id(i.name)} ON ${id(t.name)} (${list(i.columns)});`),
  );
  if (indexes.length > 0) statements.push(indexes.join('\n'));
  if (dialect !== 'sqlite' && foreignKeys.length > 0) {
    statements.push(foreignKeys.map((f) => `ALTER TABLE ${id(f.table)} ADD ${reference(f)};`).join('\n'));
  }
  return { text: statements.length > 0 ? `${statements.join('\n\n')}\n` : '', warnings };
}

const dbmlName = (name: string) => (/^\w+$/.test(name) ? name : `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
const dbmlString = (text: string) =>
  // Every quote is escaped in the triple-quoted form too, so one at the end can't run into the closing quotes.
  text.includes('\n') ? `'''${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'''` : `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const dbmlType = (type: string) => (/^[\w]+(\([\d\s,]*\))?$/.test(type) ? type : `"${type.replace(/"/g, '\\"')}"`);

/** A default as DBML reads it: strings, numbers and keywords as themselves, anything else as an expression. */
function dbmlDefault(value: string): string {
  const quoted = /^'((?:[^']|'')*)'$/.exec(value);
  if (quoted) return dbmlString((quoted[1] as string).replaceAll("''", "'"));
  if (/^-?\d+(\.\d+)?$/.test(value) || /^(true|false|null)$/i.test(value)) return value.toLowerCase();
  return `\`${value.replaceAll('`', "'")}\``;
}

/**
 * DBML for dbdiagram.io and the schema importer. A one-to-one is `-` and a many-to-many `<>` between the
 * primary keys: DBML expresses that natively, so no junction table is written. Types aren't translated;
 * `dialect` only fills in a missing one.
 */
export function toDbml(schema: ExportSchema, dialect: SqlDialect): ExportText {
  const warnings: string[] = [];
  const blocks = schema.tables.map((t) => {
    const keys = primaryKey(t);
    const lines = t.columns.map((c) => {
      const settings: string[] = [];
      if (c.primaryKey && keys.length === 1) settings.push('pk');
      else if (!c.nullable) settings.push('not null');
      if (c.unique) settings.push('unique');
      if (c.default !== undefined && c.default.trim() !== '') settings.push(`default: ${dbmlDefault(c.default.trim())}`);
      if (c.note) settings.push(`note: ${dbmlString(c.note)}`);
      const type = dbmlType(typeOf(t, c, dialect, warnings));
      return `  ${dbmlName(c.name)} ${type}${settings.length > 0 ? ` [${settings.join(', ')}]` : ''}`;
    });
    const name = (cid: string) => dbmlName(t.columns.find((c) => c.id === cid)?.name ?? '');
    const indexes = t.indexes.flatMap((i) => {
      if (i.columnIds.length === 0) {
        warnings.push(`Table "${t.name}": index "${i.name}" has no columns; skipped`);
        return [];
      }
      if (!i.columnIds.every((cid) => t.columns.some((c) => c.id === cid))) {
        warnings.push(`Table "${t.name}": index "${i.name}" names a column the table doesn't have; skipped`);
        return [];
      }
      const settings = [...(i.unique ? ['unique'] : []), `name: ${dbmlString(i.name)}`];
      return [`    (${i.columnIds.map(name).join(', ')}) [${settings.join(', ')}]`];
    });
    if (keys.length > 1) indexes.unshift(`    (${keys.map((c) => dbmlName(c.name)).join(', ')}) [pk]`);
    if (t.note) lines.push(`  Note: ${dbmlString(t.note)}`);
    if (indexes.length > 0) lines.push('', '  indexes {', ...indexes, '  }');
    return [`Table ${dbmlName(t.name)} {`, ...lines, '}'].join('\n');
  });
  const ends = (t: TableNode, columns: Column[]) =>
    columns.length === 1 ? `${dbmlName(t.name)}.${dbmlName((columns[0] as Column).name)}` : `${dbmlName(t.name)}.(${columns.map((c) => dbmlName(c.name)).join(', ')})`;
  const refs = [
    ...schema.foreignKeys.map((f) => `Ref: ${ends(f.from, [f.fromColumn])} ${f.oneToOne ? '-' : '>'} ${ends(f.to, [f.toColumn])}`),
    ...schema.manyToMany.map((m) => `Ref: ${ends(m.a, primaryKey(m.a))} <> ${ends(m.b, primaryKey(m.b))}`),
  ];
  if (refs.length > 0) blocks.push(refs.join('\n'));
  return { text: blocks.length > 0 ? `${blocks.join('\n\n')}\n` : '', warnings };
}
