import type { SqlDialect } from '../model/table';
import type { ImportedSchema } from './types';

/*
 * DBML types are free-form, so an imported column is rewritten to the preferred dialect's
 * vocabulary (SQL_DIALECTS in model/table.ts) when the mapping is known; anything else stays as
 * written. Design choices, per target: pg / mysql / sqlite.
 *
 *   int, integer      integer / int / integer     SQLite has one integer affinity, so every
 *   bigint, smallint  as is / as is / integer     integer width collapses to it.
 *   tinyint           smallint / tinyint / integer     Postgres has no 1-byte integer.
 *   mediumint         integer / mediumint / integer    Postgres has no 3-byte integer.
 *   year              smallint / year / integer        MySQL-only type; a year fits a smallint.
 *   X unsigned        X / X unsigned / X          Only MySQL has unsigned; elsewhere the base
 *                     type is mapped and the modifier dropped (the range check is lost).
 *   serial, bigserial as is / int, bigint / integer
 *                     MySQL spells it AUTO_INCREMENT, which a type string cannot carry; the
 *                     width is kept. SQLite's INTEGER PRIMARY KEY auto-numbers on its own.
 *   varchar, string   varchar(n) or varchar / varchar(n) or varchar(255) / text
 *                     Postgres accepts varchar without a length, and the user wrote exactly
 *                     that. MySQL requires a length; 255 is the dialect's own default.
 *   char              char(n) / char(n) / text
 *   bool, boolean     boolean / boolean / integer  SQLite stores booleans as 0 and 1.
 *   float, double     double precision / float, double / real
 *                     Postgres FLOAT without precision is double precision. float(p) is real
 *                     for p <= 24 and double precision above, as Postgres itself reads it.
 *                     Precision is otherwise dropped where it has no meaning (SQLite).
 *   real              real / double / real         MySQL REAL is DOUBLE.
 *   decimal, numeric  numeric(p,s) / decimal(p,s) / numeric  (precision kept where it exists)
 *   date, time        as is / as is / text         SQLite has no date types; ISO-8601 text is
 *   datetime          timestamp / datetime / text  its idiom (NUMERIC affinity would also work,
 *   timestamp         timestamp / timestamp / text but stores strings anyway).
 *   timestamptz       timestamptz / timestamp / text   MySQL TIMESTAMP is stored as UTC, the
 *                                                      closest it has to a zone-aware type.
 *   json, jsonb       as is / json / text          MySQL has no jsonb.
 *   uuid              uuid / char(36) / text
 *   blob, bytea,      bytea / blob, binary(n) / blob
 *   binary
 *
 * Arguments are copied verbatim ("numeric(12, 4)"); MySQL integer display widths are kept.
 * An array suffix ("text[]") is Postgres-only, so other dialects leave such a type as written.
 */

type Dialect = SqlDialect;

/** [type name, what to do with the source's arguments, replacement when it has none]. */
type Target = readonly [name: string, args: 'keep' | 'drop', bare?: string];

const T = (name: string, args: 'keep' | 'drop' = 'drop', bare?: string): Target => [name, args, bare];

const MAP: Record<string, Record<Dialect, Target>> = {
  int: { postgres: T('integer'), mysql: T('int', 'keep'), sqlite: T('integer') },
  bigint: { postgres: T('bigint'), mysql: T('bigint', 'keep'), sqlite: T('integer') },
  smallint: { postgres: T('smallint'), mysql: T('smallint', 'keep'), sqlite: T('integer') },
  tinyint: { postgres: T('smallint'), mysql: T('tinyint', 'keep'), sqlite: T('integer') },
  mediumint: { postgres: T('integer'), mysql: T('mediumint', 'keep'), sqlite: T('integer') },
  year: { postgres: T('smallint'), mysql: T('year', 'keep'), sqlite: T('integer') },
  serial: { postgres: T('serial'), mysql: T('int'), sqlite: T('integer') },
  bigserial: { postgres: T('bigserial'), mysql: T('bigint'), sqlite: T('integer') },
  varchar: { postgres: T('varchar', 'keep'), mysql: T('varchar', 'keep', 'varchar(255)'), sqlite: T('text') },
  text: { postgres: T('text'), mysql: T('text'), sqlite: T('text') },
  char: { postgres: T('char', 'keep'), mysql: T('char', 'keep'), sqlite: T('text') },
  boolean: { postgres: T('boolean'), mysql: T('boolean'), sqlite: T('integer') },
  float: { postgres: T('double precision'), mysql: T('float', 'keep'), sqlite: T('real') },
  double: { postgres: T('double precision'), mysql: T('double', 'keep'), sqlite: T('real') },
  real: { postgres: T('real'), mysql: T('double', 'keep'), sqlite: T('real') },
  decimal: { postgres: T('numeric', 'keep'), mysql: T('decimal', 'keep'), sqlite: T('numeric') },
  date: { postgres: T('date'), mysql: T('date'), sqlite: T('text') },
  time: { postgres: T('time', 'keep'), mysql: T('time', 'keep'), sqlite: T('text') },
  datetime: { postgres: T('timestamp', 'keep'), mysql: T('datetime', 'keep'), sqlite: T('text') },
  timestamp: { postgres: T('timestamp', 'keep'), mysql: T('timestamp', 'keep'), sqlite: T('text') },
  timestamptz: { postgres: T('timestamptz', 'keep'), mysql: T('timestamp', 'keep'), sqlite: T('text') },
  json: { postgres: T('json'), mysql: T('json'), sqlite: T('text') },
  jsonb: { postgres: T('jsonb'), mysql: T('json'), sqlite: T('text') },
  uuid: { postgres: T('uuid'), mysql: T('char(36)'), sqlite: T('text') },
  blob: { postgres: T('bytea'), mysql: T('blob'), sqlite: T('blob') },
  binary: { postgres: T('bytea'), mysql: T('binary', 'keep'), sqlite: T('blob') },
};

const ALIASES: Record<string, string> = {
  integer: 'int',
  int4: 'int',
  int8: 'bigint',
  int2: 'smallint',
  string: 'varchar',
  'character varying': 'varchar',
  character: 'char',
  bool: 'boolean',
  'double precision': 'double',
  numeric: 'decimal',
  bytea: 'blob',
};

// The base is words separated by single spaces, so the pieces cannot overlap and matching stays linear.
const TYPE_SHAPE = /^([a-z]+(?: [a-z]+)*)\s*(\([^)]*\))?(?:\s+(unsigned))?(\[\])?$/i;

/** `type` in `dialect`'s vocabulary when it is a known generic spelling; otherwise `type` unchanged. */
export function mapDbmlType(type: string, dialect: Dialect): string {
  const m = TYPE_SHAPE.exec(type.trim());
  if (!m) return type;
  // "int unsigned" reads as a two-word base; "int(10) unsigned" arrives as the trailing group.
  const words = (m[1] ?? '').toLowerCase();
  const unsigned = m[3] !== undefined || words.endsWith(' unsigned');
  const base = words.replace(/ unsigned$/, '');
  const args = m[2];
  const isArray = m[4] !== undefined;
  const target = MAP[ALIASES[base] ?? base]?.[dialect];
  if (!target || (isArray && dialect !== 'postgres')) return type;
  const [name, argMode, bare] = target;
  let mapped = args === undefined ? (bare ?? name) : argMode === 'keep' ? `${name}${args}` : name;
  if (dialect === 'postgres' && base === 'float' && args !== undefined) {
    mapped = Number(/^\(\s*(\d+)\s*\)$/.exec(args)?.[1] ?? 53) <= 24 ? 'real' : 'double precision';
  }
  if (unsigned && dialect === 'mysql') mapped += ' unsigned';
  return isArray ? `${mapped}[]` : mapped;
}

/** `schema` with every column's type mapped; the input is not modified. */
export function mapSchemaTypes(schema: ImportedSchema, dialect: Dialect): ImportedSchema {
  return {
    ...schema,
    tables: schema.tables.map((t) => ({
      ...t,
      columns: t.columns.map((c) => ({ ...c, dataType: mapDbmlType(c.dataType, dialect) })),
    })),
  };
}
