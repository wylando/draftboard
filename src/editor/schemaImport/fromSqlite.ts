import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { nameKey } from '../model/names';
import { classifyStatement, couldntParse } from './fromSql';
import { splitStatements } from './splitStatements';
import type { ImportedColumn, ImportedIndex, ImportedRelation, ImportedSchema, ImportedTable, ImportWarning } from './types';

// Vitest runs in Node, where sql.js finds its wasm next to its JS; the browser needs the bundled asset URL.
const loadSql = () => initSqlJs(import.meta.env.VITEST ? undefined : { locateFile: () => wasmUrl });

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

function rows(db: Database, sql: string): SqlValue[][] {
  return db.exec(sql)[0]?.values ?? [];
}

const str = (v: SqlValue | undefined) => (v == null ? '' : String(v));
const num = (v: SqlValue | undefined) => Number(v ?? 0);

interface Column extends ImportedColumn {
  pkPosition: number;
}

function readColumns(db: Database, table: string): Column[] {
  // table_xinfo (not table_info) lists generated columns too. They import as plain columns; their expression is dropped.
  return rows(db, `PRAGMA table_xinfo(${quote(table)})`).map((r) => {
    const pkPosition = num(r[5]);
    const column: Column = {
      name: str(r[1]),
      dataType: str(r[2]),
      pkPosition,
      primaryKey: pkPosition > 0,
      // SQLite reports INTEGER PRIMARY KEY as nullable, but it can never hold NULL.
      nullable: num(r[3]) === 0 && pkPosition === 0,
      unique: false,
    };
    if (r[4] != null) column.default = str(r[4]);
    return column;
  });
}

function withoutPkPosition(column: Column): ImportedColumn {
  const { name, dataType, primaryKey, nullable, unique } = column;
  return column.default === undefined ? { name, dataType, primaryKey, nullable, unique } : { name, dataType, primaryKey, nullable, unique, default: column.default };
}

function readIndexes(db: Database, table: string, columns: Column[], warnings: ImportWarning[]): ImportedIndex[] {
  const indexes: ImportedIndex[] = [];
  const list = rows(db, `PRAGMA index_list(${quote(table)})`).map((r) => ({
    name: str(r[1]),
    unique: num(r[2]) === 1,
    origin: str(r[3]),
    partial: num(r[4]) === 1,
  }));
  // Observed with sql.js 1.15.1: index_list returns newest first, so reverse it to get creation order.
  for (const index of list.reverse()) {
    if (index.origin === 'pk') continue;
    const keys = rows(db, `PRAGMA index_xinfo(${quote(index.name)})`).filter((r) => num(r[5]) === 1);
    if (keys.some((r) => num(r[1]) === -2)) {
      warnings.push({ message: `Index "${index.name}" uses an expression; skipped` });
      continue;
    }
    const names = keys.map((r) => str(r[2]));
    // The model has no index predicate, so the index would otherwise look total.
    if (index.partial) warnings.push({ message: `Index "${index.name}" is partial; its WHERE clause was dropped` });
    if (index.origin === 'u' && names.length === 1) {
      const column = columns.find((c) => c.name === names[0]);
      if (column) column.unique = true;
      continue;
    }
    indexes.push({ name: index.origin === 'u' ? '' : index.name, columns: names, unique: index.unique });
  }
  return indexes;
}

interface Parent {
  name: string;
  columns: Column[];
  pk: string[];
}

const findColumn = (columns: Column[], name: string) => columns.find((c) => nameKey(c.name) === nameKey(name));

function readRelations(db: Database, table: string, own: Column[], parents: Map<string, Parent>, warnings: ImportWarning[]) {
  const groups = new Map<number, { parent: string; pairs: { seq: number; from: string; to: string | null }[] }>();
  for (const r of rows(db, `PRAGMA foreign_key_list(${quote(table)})`)) {
    const id = num(r[0]);
    const group = groups.get(id) ?? { parent: str(r[2]), pairs: [] };
    group.pairs.push({ seq: num(r[1]), from: str(r[3]), to: r[4] == null ? null : str(r[4]) });
    groups.set(id, group);
  }
  const relations: ImportedRelation[] = [];
  // Observed with sql.js 1.15.1: foreign_key_list lists the newest constraint first, so reverse it to get declaration order.
  for (const group of [...groups.values()].reverse()) {
    const parent = parents.get(nameKey(group.parent));
    if (!parent) {
      warnings.push({ message: `Foreign key from "${table}" references unknown table "${group.parent}"; skipped` });
      continue;
    }
    group.pairs.sort((a, b) => a.seq - b.seq);
    const resolved = group.pairs.map((p) => {
      const to = p.to ?? parent.pk[p.seq];
      return { from: findColumn(own, p.from), to: to === undefined ? undefined : findColumn(parent.columns, to) };
    });
    if (resolved.some((p) => !p.from || !p.to)) {
      warnings.push({ message: `Foreign key from "${table}" to "${parent.name}" names a missing column or has no primary key to match; skipped` });
      continue;
    }
    for (const p of resolved) {
      relations.push({ fromTable: table, fromColumn: p.from?.name ?? '', toTable: parent.name, toColumn: p.to?.name ?? '', declared: true });
    }
  }
  return relations;
}

const isVirtual = (sql: string) => /^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(sql);

// Per-module shadow table suffixes; an unknown module excludes nothing, so a real table is never dropped on a guess.
const SHADOW_SUFFIXES: Record<string, string[]> = {
  fts3: ['content', 'segments', 'segdir', 'docsize', 'stat'],
  fts4: ['content', 'segments', 'segdir', 'docsize', 'stat'],
  fts5: ['data', 'idx', 'content', 'docsize', 'config'],
  rtree: ['node', 'parent', 'rowid'],
  rtree_i32: ['node', 'parent', 'rowid'],
};

function shadowNames(virtualName: string, sql: string): string[] {
  const module = /\bUSING\s+["'`[]?(\w+)/i.exec(sql)?.[1]?.toLowerCase() ?? '';
  return (SHADOW_SUFFIXES[module] ?? []).map((suffix) => nameKey(`${virtualName}_${suffix}`));
}

function readSchema(db: Database, format: 'sqlite' | 'sqlite-db'): ImportedSchema {
  const warnings: ImportWarning[] = [];
  // SQLite reserves the prefix "sqlite_" (any case); a LIKE pattern would also eat names such as sqlite3_data, since _ is a wildcard.
  const master = rows(db, `SELECT name, sql FROM sqlite_master WHERE type='table' AND lower(substr(name, 1, 7)) <> 'sqlite_'`).map((r) => ({
    name: str(r[0]),
    virtual: isVirtual(str(r[1])),
    sql: str(r[1]),
  }));
  const virtuals = master.filter((t) => t.virtual);
  for (const v of virtuals) warnings.push({ message: `Skipped virtual table "${v.name}"` });
  // Virtual tables are never read (their module may be missing).
  const shadows = new Set(virtuals.flatMap((v) => shadowNames(v.name, v.sql)));
  const names = master.filter((t) => !t.virtual && !shadows.has(nameKey(t.name))).map((t) => t.name);

  const columnsByTable = new Map<string, Column[]>();
  for (const name of names) {
    try {
      columnsByTable.set(name, readColumns(db, name));
    } catch {
      warnings.push({ message: `Couldn't read table "${name}"; skipped` });
    }
  }
  const parents = new Map<string, Parent>();
  for (const [name, columns] of columnsByTable) {
    const pk = columns.filter((c) => c.pkPosition > 0).sort((a, b) => a.pkPosition - b.pkPosition).map((c) => c.name);
    parents.set(nameKey(name), { name, columns, pk });
  }

  const tables: ImportedTable[] = [];
  const relations: ImportedRelation[] = [];
  for (const [name, columns] of columnsByTable) {
    const tableWarnings: ImportWarning[] = [];
    try {
      const indexes = readIndexes(db, name, columns, tableWarnings);
      relations.push(...readRelations(db, name, columns, parents, tableWarnings));
      tables.push({ name, columns: columns.map(withoutPkPosition), indexes });
      warnings.push(...tableWarnings);
    } catch {
      warnings.push({ message: `Couldn't read table "${name}"; skipped` });
    }
  }

  for (const r of rows(db, `SELECT type FROM sqlite_master WHERE type IN ('view','trigger')`)) {
    warnings.push({ message: `Skipped CREATE ${str(r[0]).toUpperCase()}` });
  }
  return { format, tables, relations, warnings };
}

const noReader = (format: 'sqlite' | 'sqlite-db'): ImportedSchema => ({
  format,
  tables: [],
  relations: [],
  warnings: [{ message: "Couldn't load the SQLite reader." }],
});

async function openDatabase(bytes?: Uint8Array): Promise<Database | undefined> {
  try {
    const SQL = await loadSql();
    return new SQL.Database(bytes);
  } catch {
    return undefined;
  }
}

const unreadable = (reason: string): ImportedSchema => ({
  format: 'sqlite-db',
  tables: [],
  relations: [],
  warnings: [{ message: `This isn't a readable SQLite database (${reason}).` }],
});

export async function parseSqliteDb(bytes: Uint8Array): Promise<ImportedSchema> {
  // sql.js treats empty bytes as a new empty database, which would import "successfully" with nothing in it.
  if (bytes.length === 0) return unreadable('the file is empty');
  const db = await openDatabase(bytes);
  if (!db) return noReader('sqlite-db');
  try {
    return readSchema(db, 'sqlite-db');
  } catch (error) {
    // A bad file only fails on the first query, not on open.
    return unreadable(error instanceof Error ? error.message : String(error));
  } finally {
    db.close();
  }
}

const LEADING_COMMENTS = /^(?:\s|--[^\n]*|\/\*[\s\S]*?\*\/)*/;
const CREATE_TABLE = /^create\s+(?:(?:temp|temporary)\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|'(?:[^']|'')*'|[\w$.]+)(?:\s*\.\s*(?:"(?:[^"]|"")*"|\w+))?\s*/i;
const SCHEMA_DDL = /^(?:create\s+(?:unique\s+)?index|alter\s+table|drop\s+(?:table|index))\b/i;

/**
 * What to execute for a statement, or the warning for why not. Only schema definitions run: sql.js has no
 * progress handler, so a recursive `CREATE TABLE … AS` query would hang the page, and data statements are
 * not wanted anyway.
 */
function runnable(sql: string): { run: string } | { skipped: string } {
  const body = sql.replace(LEADING_COMMENTS, '');
  const create = CREATE_TABLE.exec(body);
  if (create) {
    if (/^as\b/i.test(body.slice(create[0].length))) {
      return { skipped: 'Skipped CREATE TABLE … AS SELECT (its columns come from a query)' };
    }
    // TEMP tables live in sqlite_temp_master, which the reader doesn't look at; import them as normal tables.
    return { run: body.replace(/^create\s+(?:temp|temporary)\s+table/i, 'CREATE TABLE') };
  }
  if (SCHEMA_DDL.test(body)) return { run: body };
  return { skipped: `Skipped ${(/^\w+/.exec(body)?.[0] ?? 'statement').toUpperCase()}` };
}

/** Runs the DDL in a scratch in-memory database, so SQLite itself decides what the schema is. */
export async function parseSqliteSql(source: string): Promise<ImportedSchema> {
  const db = await openDatabase();
  if (!db) return noReader('sqlite');
  try {
    const warnings: ImportWarning[] = [];
    const summaries = new Map<string, { warning: ImportWarning; count: number }>();
    let unterminatedLine = 0;
    for (const { sql, line, unterminatedAt } of splitStatements(source, 'sqlite')) {
      if (unterminatedAt) unterminatedLine = unterminatedAt;
      if (sql === '') continue; // Only marks where an open quote or comment began.
      const kind = classifyStatement(sql, 'sqlite');
      // Only 'table' statements run, so data, PRAGMA and ATTACH never touch the scratch database.
      if (kind.kind === 'noise') continue;
      if (kind.kind === 'dropped') {
        warnings.push({ line, message: kind.message });
      } else if (kind.kind === 'data') {
        const seen = summaries.get(kind.statement);
        if (seen) seen.count++;
        else {
          const warning = { line, message: `Skipped ${kind.statement}` };
          warnings.push(warning);
          summaries.set(kind.statement, { warning, count: 1 });
        }
      } else {
        const plan = runnable(sql);
        if ('skipped' in plan) {
          warnings.push({ line, message: plan.skipped });
          continue;
        }
        try {
          db.run(plan.run);
        } catch {
          warnings.push({ line, message: couldntParse(sql) });
        }
      }
    }
    if (unterminatedLine) {
      warnings.push({ line: unterminatedLine, message: 'Unterminated quote or comment starts here; the rest of the file was ignored' });
    }
    for (const [kind, { warning, count }] of summaries) {
      if (count > 1) warning.message = `Skipped ${count.toLocaleString('en-US')} ${kind} statements`;
    }
    const schema = readSchema(db, 'sqlite');
    return { ...schema, warnings: [...warnings, ...schema.warnings] };
  } finally {
    db.close();
  }
}
