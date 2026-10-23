import { nameKey } from '../model/names';
import { splitStatements } from './splitStatements';
import type {
  ImportedColumn,
  ImportedRelation,
  ImportedSchema,
  ImportedTable,
  ImportWarning,
} from './types';

// node-sql-parser's shipped types omit fields we need (`primary_key`, `array`,
// `index`), so these describe only the AST fields read below, as probed on 5.4.0.
interface ColumnRef {
  column: string | { expr: { value: string } }; // postgres wraps the name, mysql gives a string
}
interface Reference {
  table: { table: string; db?: string | null }[];
  definition: ColumnRef[];
}
interface Literal {
  type: string;
  value?: unknown;
  name?: { name: { value: string }[] };
  args?: unknown;
  expr?: Literal;
}
interface DataType {
  dataType: string;
  length?: number;
  scale?: number | null;
  suffix?: string[] | null;
  array?: { dimension: number };
  expr?: { value: Literal[] };
}
interface ColumnDef {
  resource: 'column';
  column: ColumnRef;
  definition: DataType;
  primary_key?: string;
  nullable?: { type: string } | null;
  unique?: string;
  default_val?: { value: Literal } | null;
  reference_definition?: Reference;
}
interface ConstraintDef {
  resource: 'constraint';
  constraint_type: string;
  constraint?: string | null;
  index?: string | null;
  definition: ColumnRef[];
  reference_definition?: Reference;
}
interface IndexDef {
  resource: 'index';
  index?: string | null;
  definition: ColumnRef[];
}
type TableDef = ColumnDef | ConstraintDef | IndexDef;
interface TableName {
  table: string;
  db?: string | null; // the schema, null when unqualified
}
interface IndexColumn {
  type: string; // 'column_ref' for a plain column; anything else is an expression
  column?: ColumnRef['column'];
}
interface Ast {
  type: string;
  keyword?: string | null;
  // CREATE/ALTER TABLE give a list; CREATE INDEX gives the single table.
  table?: TableName[] | TableName;
  create_definitions?: TableDef[] | null;
  expr?: {
    action: string;
    resource?: string;
    create_definitions?: ConstraintDef;
    // ADD COLUMN carries the column definition on the action itself.
    column?: ColumnRef;
    definition?: DataType;
    primary_key?: string;
    nullable?: { type: string } | null;
    unique?: string;
    default_val?: { value: Literal } | null;
    reference_definition?: Reference;
  }[];
  index?: string | { name: string } | null;
  index_type?: string | null;
  index_columns?: IndexColumn[] | null;
}
interface ParserModule {
  Parser?: new () => SqlParser;
  default?: { Parser: new () => SqlParser };
}
interface SqlParser {
  astify(sql: string, opt: { database: string }): Ast | Ast[];
}

const loaders = {
  postgres: () => import('node-sql-parser/build/postgresql'),
  mysql: () => import('node-sql-parser/build/mysql'),
};

async function loadParser(dialect: 'postgres' | 'mysql'): Promise<SqlParser> {
  // The build is CommonJS: Node's ESM interop exposes the class on `.default`, bundlers may hoist it.
  const mod = (await loaders[dialect]()) as unknown as ParserModule;
  const Parser = mod.Parser ?? mod.default?.Parser;
  if (!Parser) throw new Error('node-sql-parser did not expose a Parser');
  return new Parser();
}

/** The name a table gets in the document; see `parseSql`'s `qualify`. */
type Qualify = (t: TableName) => string;
const tableName = (ast: Ast, qualify: Qualify): string =>
  qualify((Array.isArray(ast.table) ? ast.table[0] : ast.table) ?? { table: '' });
const refTable = (ref: Reference, qualify: Qualify): string => qualify(ref.table[0] ?? { table: '' });

const colName = (ref: ColumnRef): string => (typeof ref.column === 'string' ? ref.column : ref.column.expr.value);

/**
 * Lowercased, parameters before modifiers, array dimensions last:
 * `varchar(255)`, `numeric(10,2)`, `timestamp with time zone`, `int unsigned`,
 * `enum('a','b')`, `text[]`.
 */
function typeText(d: DataType): string {
  let out = d.dataType.toLowerCase();
  if (d.length !== undefined) out += `(${d.length}${d.scale != null ? `,${d.scale}` : ''})`;
  if (d.expr) out += `(${d.expr.value.map((v) => `'${String(v.value)}'`).join(',')})`;
  if (d.suffix?.length) out += ` ${d.suffix.join(' ').toLowerCase()}`;
  if (d.array) out += '[]'.repeat(d.array.dimension);
  return out;
}

/** Literals and argument-less calls only; expressions, `NULL` and anything else yield undefined. */
function defaultText(e: Literal): string | undefined {
  switch (e.type) {
    case 'number':
    case 'bool':
      return String(e.value);
    case 'single_quote_string':
      // The parser keeps the source's own quote escaping, so re-escaping would double it.
      return `'${String(e.value)}'`;
    case 'function': {
      const name = e.name?.name.map((n) => n.value).join('.');
      if (!name) return undefined;
      // Bare keywords like CURRENT_TIMESTAMP carry no `args`; `now()` carries an empty list.
      if (e.args === undefined) return name;
      const empty = (e.args as { value?: unknown[] }).value?.length === 0;
      return empty ? `${name}()` : undefined;
    }
    case 'cast':
      return e.expr ? defaultText(e.expr) : undefined;
    default:
      return undefined;
  }
}

function applyConstraint(table: ImportedTable, def: ConstraintDef, relations: ImportedRelation[], qualify: Qualify) {
  const type = def.constraint_type.toLowerCase();
  const find = (name: string) => table.columns.find((c) => c.name === name);
  if (type === 'primary key') {
    for (const c of def.definition.map(colName)) {
      const col = find(c);
      if (col) Object.assign(col, { primaryKey: true, nullable: false });
    }
  } else if (type.startsWith('unique')) {
    const cols = def.definition.map(colName);
    const only = cols[0];
    const col = cols.length === 1 && only !== undefined ? find(only) : undefined;
    if (col) col.unique = true;
    else table.indexes.push({ name: def.constraint ?? def.index ?? '', columns: cols, unique: true });
  } else if (type === 'foreign key' && def.reference_definition) {
    const ref = def.reference_definition;
    def.definition.map(colName).forEach((fromColumn, i) => {
      const target = ref.definition[i];
      if (target) {
        relations.push({
          fromTable: table.name,
          fromColumn,
          toTable: refTable(ref, qualify),
          toColumn: colName(target),
          declared: true,
        });
      }
    });
  }
}

function addColumn(table: ImportedTable, def: ColumnDef, relations: ImportedRelation[], qualify: Qualify) {
  const column: ImportedColumn = {
    name: colName(def.column),
    dataType: typeText(def.definition),
    primaryKey: def.primary_key !== undefined,
    nullable:
      def.nullable?.type !== 'not null' &&
      def.primary_key === undefined &&
      !/^(small|big)?serial$/i.test(def.definition.dataType),
    unique: def.unique !== undefined,
  };
  const dflt = def.default_val ? defaultText(def.default_val.value) : undefined;
  if (dflt !== undefined) column.default = dflt;
  table.columns.push(column);
  if (def.reference_definition) {
    const fk: ConstraintDef = {
      resource: 'constraint',
      constraint_type: 'foreign key',
      definition: [def.column],
      reference_definition: def.reference_definition,
    };
    applyConstraint(table, fk, relations, qualify);
  }
}

function tableFrom(ast: Ast, qualify: Qualify): { table: ImportedTable; relations: ImportedRelation[] } {
  const table: ImportedTable = { name: tableName(ast, qualify), columns: [], indexes: [] };
  const relations: ImportedRelation[] = [];
  const defs = ast.create_definitions ?? [];

  for (const def of defs) if (def.resource === 'column') addColumn(table, def, relations, qualify);

  for (const def of defs) {
    if (def.resource === 'index') {
      // FULLTEXT and SPATIAL land here too: the model has no index kinds.
      table.indexes.push({ name: def.index ?? '', columns: def.definition.map(colName), unique: false });
    } else if (def.resource === 'constraint') {
      applyConstraint(table, def, relations, qualify);
    }
  }

  return { table, relations };
}

// Clauses the parser rejects but the diagram doesn't need. Sticky, so each is tested at one position.
const IDENTITY = /generated\s+(?:always|by\s+default)\s+as\s+identity\b/iy;
const GENERATED_EXPR = /generated\s+always\s+as\s*(?=\()/iy;
const STORED = /\s*(?:stored|virtual)\b/iy;
const DEFERRAL = /(?:not\s+valid|(?:not\s+)?deferrable|initially\s+(?:deferred|immediate))\b/iy;

function matchAt(re: RegExp, text: string, at: number): RegExpExecArray | null {
  re.lastIndex = at;
  return re.exec(text);
}

/** Index after the parenthesised group starting at `from` (after whitespace), or `from` if there is none. */
function skipParens(sql: string, from: number): number {
  let i = from;
  while (/\s/.test(sql.charAt(i))) i++;
  if (sql.charAt(i) !== '(') return from;
  let depth = 0;
  do {
    const ch = sql.charAt(i);
    if (ch === "'" || ch === '"') {
      const close = sql.indexOf(ch, i + 1);
      i = close === -1 ? sql.length : close + 1;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    i++;
  } while (depth > 0 && i < sql.length);
  return i;
}

/**
 * Removes what the parser rejects and the diagram never shows: `GENERATED … AS IDENTITY [(options)]`
 * (replaced by NOT NULL, which identity implies), `GENERATED ALWAYS AS (expr) STORED`, and the
 * DEFERRABLE / INITIALLY / NOT VALID tails of constraints. Quoted text is copied untouched.
 */
function stripUnsupported(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql.charAt(i);
    if (ch === "'" || ch === '"' || ch === '`') {
      // A doubled quote re-opens the string on the next pass, so no special case.
      const close = sql.indexOf(ch, i + 1);
      const end = close === -1 ? sql.length : close + 1;
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (/[a-z]/i.test(ch) && !/[\w$]/.test(sql.charAt(i - 1))) {
      const identity = matchAt(IDENTITY, sql, i);
      if (identity) {
        i = skipParens(sql, i + identity[0].length);
        out += ' NOT NULL ';
        continue;
      }
      const generated = matchAt(GENERATED_EXPR, sql, i);
      if (generated) {
        i = skipParens(sql, i + generated[0].length);
        i += matchAt(STORED, sql, i)?.[0].length ?? 0;
        out += ' ';
        continue;
      }
      const deferral = matchAt(DEFERRAL, sql, i);
      if (deferral) {
        i += deferral[0].length;
        out += ' ';
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

// pg_dump puts a comment header before every object.
const LEADING_COMMENTS = /^(?:\s|--[^\n]*|\/\*[\s\S]*?\*\/)*/;
const DROPPED =
  /^create (?:or replace )?(?:(?:temp|temporary|recursive|definer ?= ?\S+|algorithm ?= ?\w+|sql security \w+) )*(materialized |constraint )?(view|function|procedure|trigger|type|domain|aggregate)\b/;
// Session, ownership and permission statements: nothing in them reaches the diagram.
const NOISE =
  /^(?:set|select|grant|revoke|comment|begin|commit|rollback|start transaction|lock|unlock|drop|truncate|use|create (?:extension|schema|sequence|role|user)|alter (?:sequence|schema|type|function|view|extension|database|default privileges|role|user))\b/;
// ALTER TABLE forms the parser can't read and that don't change the diagram.
const ALTER_NOISE =
  /\badd\s+generated\b|\bowner\s+to\b|\b(?:enable|disable)\s+row\s+level\s+security\b|\bset\s*\(|\breplica\s+identity\b|\bcluster\s+on\b|\balter\s+column\s+\S+\s+set\s+(?:default|statistics|storage)\b/i;

/** Judged from the leading keywords alone, so it also works for statements the parser can't read. */
function classify(body: string): { skip: true; warning?: string } | undefined {
  const head = body.slice(0, 200).replace(/\s+/g, ' ').trim().toLowerCase();
  const dropped = DROPPED.exec(head);
  if (dropped) {
    return { skip: true, warning: `Skipped CREATE ${(dropped[1] ?? '').toUpperCase()}${(dropped[2] ?? '').toUpperCase()}` };
  }
  if (/^insert\b/.test(head)) return { skip: true, warning: 'Skipped INSERT' };
  if (/^copy\b/.test(head)) return { skip: true, warning: 'Skipped COPY' };
  return NOISE.test(head) ? { skip: true } : undefined;
}

/** The tables in a `DROP TABLE [IF EXISTS] a, s.b [CASCADE]` statement, unquoted. */
function droppedTables(body: string): TableName[] | undefined {
  const m = /^drop\s+table\s+(?:if\s+exists\s+)?([^;]*?)(?:\s+(?:cascade|restrict))?\s*$/i.exec(body);
  if (!m) return undefined;
  return (m[1] ?? '').split(',').map((n) => {
    const parts = n.trim().replace(/["`]/g, '').split('.');
    return { table: parts.pop() ?? '', db: parts.pop() ?? null };
  });
}

/** The ALTER TABLE actions that change columns but that we don't replay, named for the warning. */
function skippedAlter(e: NonNullable<Ast['expr']>[number]): string[] {
  if (e.action === 'drop' && e.resource === 'column') return ['DROP COLUMN'];
  if (e.action === 'rename') return ['RENAME'];
  if (e.action === 'modify') return ['MODIFY COLUMN'];
  if (e.action === 'change') return ['CHANGE COLUMN'];
  // Only the TYPE form carries a new data type; SET DEFAULT / SET NOT NULL don't.
  if (e.action === 'alter' && e.resource === 'column' && e.definition) return ['ALTER COLUMN TYPE'];
  return [];
}

export async function parseSql(source: string, dialect: 'postgres' | 'mysql'): Promise<ImportedSchema> {
  const parser = await loadParser(dialect);
  const tables: ImportedTable[] = [];
  const relations: ImportedRelation[] = [];
  // Design choice: in Postgres the default schema (public, or unqualified) keeps the bare name and any other
  // schema is part of it ("auth.users"), so same-named tables from different schemas stay apart. A MySQL
  // qualifier is a database, which a diagram doesn't separate.
  const qualify: Qualify = ({ table, db }) =>
    dialect === 'postgres' && db && nameKey(db) !== 'public' ? `${db}.${table}` : table;
  const tableByName = (name: string) => tables.find((t) => nameKey(t.name) === nameKey(name));
  const warnings: ImportWarning[] = [];

  for (const { sql, line } of splitStatements(source)) {
    const body = sql.replace(LEADING_COMMENTS, '');
    const dropping = droppedTables(body);
    if (dropping) {
      if (dropping.some((n) => tableByName(qualify(n)))) warnings.push({ line, message: 'Skipped DROP TABLE' });
      continue;
    }
    const skipped = classify(body);
    if (skipped) {
      if (skipped.warning) warnings.push({ line, message: skipped.warning });
      continue;
    }
    try {
      const parsed = parser.astify(stripUnsupported(sql), { database: dialect === 'postgres' ? 'postgresql' : 'mysql' });
      for (const ast of Array.isArray(parsed) ? parsed : [parsed]) {
        if (ast.type === 'create' && ast.keyword === 'table') {
          if (!ast.create_definitions?.some((d) => d.resource === 'column')) {
            warnings.push({ line, message: `Table "${tableName(ast, qualify)}" has no column list; skipped` });
            continue;
          }
          const { table, relations: pending } = tableFrom(ast, qualify);
          // Compared ignoring case, like layer names (model/names.ts).
          if (tableByName(table.name)) {
            warnings.push({ line, message: `Table "${table.name}" is defined twice; kept the first` });
            continue;
          }
          tables.push(table);
          relations.push(...pending);
        } else if (ast.type === 'alter') {
          // Not gated on `keyword`: MySQL's ALTER TABLE AST doesn't carry one.
          const actions = ast.expr ?? [];
          const dropped = actions.flatMap((e) => skippedAlter(e));
          for (const action of new Set(dropped)) warnings.push({ line, message: `Skipped ALTER TABLE … ${action}` });
          const adds = actions.filter((e) => e.action === 'add' && (e.create_definitions || e.resource === 'column'));
          if (adds.length === 0) continue;
          const target = tableByName(tableName(ast, qualify));
          if (!target) {
            warnings.push({ line, message: `ALTER TABLE "${tableName(ast, qualify)}": table not defined; skipped` });
            continue;
          }
          for (const add of adds) {
            const { column, definition } = add;
            if (add.create_definitions) {
              applyConstraint(target, add.create_definitions, relations, qualify);
            } else if (column && definition) {
              // ADD COLUMN IF NOT EXISTS on a column we already have is a no-op.
              const exists = target.columns.some((c) => nameKey(c.name) === nameKey(colName(column)));
              if (!exists) addColumn(target, { ...add, resource: 'column', column, definition }, relations, qualify);
            }
          }
        } else if (ast.type === 'create' && ast.keyword === 'index') {
          const indexName = typeof ast.index === 'string' ? ast.index : (ast.index?.name ?? '');
          const target = tableByName(tableName(ast, qualify));
          if (!target) {
            warnings.push({ line, message: `Index "${indexName}": table "${tableName(ast, qualify)}" not defined; skipped` });
            continue;
          }
          const refs = ast.index_columns ?? [];
          if (refs.some((c) => c.type !== 'column_ref' || c.column === undefined)) {
            warnings.push({ line, message: `Index "${indexName}" uses an expression; skipped` });
            continue;
          }
          target.indexes.push({
            name: indexName,
            columns: refs.map((c) => colName({ column: c.column as ColumnRef['column'] })),
            unique: ast.index_type === 'unique',
          });
        }
      }
    } catch {
      if (/^alter\s+table\b/i.test(body)) {
        // A rename the parser can't read would silently desync names, so it is reported, not hidden.
        if (/\brename\b/i.test(body)) {
          warnings.push({ line, message: 'Skipped ALTER TABLE … RENAME' });
          continue;
        }
        if (ALTER_NOISE.test(body)) continue;
      }
      // The parser's own message is a raw PEG expectation list, which doesn't help the user fix the SQL.
      const oneLine = body.replace(/\s+/g, ' ');
      warnings.push({ line, message: `Couldn't parse: ${oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine}` });
    }
  }

  // References are matched case-insensitively, but the document keeps the declared spelling. A target that
  // was never defined keeps its written name, so it can't silently resolve to another table.
  for (const r of relations) r.toTable = tableByName(r.toTable)?.name ?? r.toTable;

  return { format: dialect, tables, relations, warnings };
}
