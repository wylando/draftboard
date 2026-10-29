import { describe, expect, it } from 'vitest';
import { detectFormat, type DetectedFormat } from './detectFormat';
import { growth, MAX_LINEAR_GROWTH } from './testGrowth';

const sqliteHeader = new TextEncoder().encode('SQLite format 3\0' + 'x'.repeat(20));

type Row = {
  why: string;
  input: { name: string; text: string; bytes?: Uint8Array };
  fallback: 'postgres' | 'mysql' | 'sqlite';
  expected: DetectedFormat;
};

const rows: Row[] = [
  {
    why: 'SQLite file header beats everything, even a .sql name',
    input: { name: 'app.sql', text: '', bytes: sqliteHeader },
    fallback: 'postgres',
    expected: 'sqlite-db',
  },
  {
    why: '.dbml extension alone',
    input: { name: 'schema.DBML', text: 'garbage' },
    fallback: 'mysql',
    expected: 'dbml',
  },
  {
    why: 'DBML text after a // and a /* */ comment',
    input: { name: '', text: '// users\n/* note */\n  Table users {\n  id int [pk]\n}' },
    fallback: 'sqlite',
    expected: 'dbml',
  },
  {
    why: 'mysqldump markers',
    input: {
      name: 'dump.sql',
      text: '/*!40101 SET NAMES utf8 */;\nCREATE TABLE `t` (\n `id` int unsigned NOT NULL AUTO_INCREMENT\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
    },
    fallback: 'postgres',
    expected: 'mysql',
  },
  {
    why: 'pg_dump markers',
    input: {
      name: '',
      text: 'CREATE TABLE public.t (id bigserial, doc jsonb, at timestamptz DEFAULT now()::timestamptz);\nALTER TABLE public.t OWNER TO app;',
    },
    fallback: 'mysql',
    expected: 'postgres',
  },
  {
    why: 'sqlite .schema markers',
    input: {
      name: '',
      text: 'PRAGMA foreign_keys=ON;\nCREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT) WITHOUT ROWID;',
    },
    fallback: 'postgres',
    expected: 'sqlite',
  },
  ...[
    ['a -- comment', '-- ENGINE=InnoDB AUTO_INCREMENT\nSELECT 1;'],
    ['a # comment', '# ENGINE=InnoDB AUTO_INCREMENT\nSELECT 1;'],
    ['a block comment', '/* ENGINE=InnoDB AUTO_INCREMENT */ SELECT 1;'],
    ['a single-quoted string', "SELECT 'ENGINE=InnoDB AUTO_INCREMENT';"],
    ['a double-quoted string', 'SELECT "ENGINE=InnoDB AUTO_INCREMENT";'],
  ].map(([where, text]): Row => ({
    why: `mysql markers only inside ${where} are ignored`,
    input: { name: '', text: text ?? '' },
    fallback: 'sqlite',
    expected: 'sqlite',
  })),
  {
    why: 'a versioned comment is the only mysql marker',
    input: { name: '', text: '/*!40101 SET NAMES utf8 */;' },
    fallback: 'postgres',
    expected: 'mysql',
  },
  {
    why: 'a backslash does not escape the quote in postgres/sqlite strings',
    input: {
      name: '',
      text: "INSERT INTO a VALUES ('C:\\'); CREATE TABLE b (id bigserial, j jsonb);",
    },
    fallback: 'sqlite',
    expected: 'postgres',
  },
  {
    why: 'a markdown fence of backticks is not an identifier',
    input: { name: '', text: '```sql\nCREATE TABLE t (id int);\n```' },
    fallback: 'postgres',
    expected: 'postgres',
  },
  {
    why: 'a quote inside a backtick identifier does not open a string',
    input: { name: '', text: "CREATE TABLE `it's` (id bigserial, j jsonb);" },
    fallback: 'sqlite',
    expected: 'postgres',
  },
  {
    why: 'DELIMITER $$ and END$$ are mysql, not postgres dollar quoting',
    input: {
      name: '',
      text: 'DELIMITER $$\nCREATE PROCEDURE p() BEGIN SELECT 1; END$$\nDELIMITER ;',
    },
    fallback: 'sqlite',
    expected: 'sqlite',
  },
  {
    why: 'AS $$ ... $$ LANGUAGE is a postgres function body',
    input: { name: '', text: 'CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;' },
    fallback: 'mysql',
    expected: 'postgres',
  },
  {
    why: 'serial after a backticked column name is not the postgres type',
    input: { name: '', text: 'CREATE TABLE `t` (`id` SERIAL);' },
    fallback: 'postgres',
    expected: 'mysql',
  },
  {
    why: 'a lone weak hint never decides',
    input: { name: '', text: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);' },
    fallback: 'postgres',
    expected: 'postgres',
  },
  {
    why: 'postgres type markers: uuid, bytea, array',
    input: { name: '', text: 'CREATE TABLE t (id uuid, tags text[], b bytea);' },
    fallback: 'mysql',
    expected: 'postgres',
  },
  {
    why: 'postgres DDL markers: character varying, without time zone, CREATE EXTENSION',
    input: {
      name: '',
      text: 'CREATE EXTENSION pgcrypto; CREATE TABLE t (n character varying(10), at timestamp without time zone);',
    },
    fallback: 'sqlite',
    expected: 'postgres',
  },
  {
    why: 'prisma postgres migration: double-quoted identifiers and TIMESTAMP(3)',
    input: {
      name: 'migration.sql',
      text: 'CREATE TABLE "User" (\n  "id" TEXT NOT NULL,\n  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  CONSTRAINT "User_pkey" PRIMARY KEY ("id")\n);',
    },
    fallback: 'mysql',
    expected: 'postgres',
  },
  ...['TablePartial base {\n id int\n}', 'Records users(id) {\n 1\n}', 'Note readme {\n \'hi\'\n}', 'Ref r {\n a.b > c.d\n}'].map(
    (text): Row => ({
      why: `DBML block starting ${text.split(/[ {]/)[0] ?? ''}`,
      input: { name: '', text },
      fallback: 'sqlite',
      expected: 'dbml',
    }),
  ),
  {
    why: 'empty input',
    input: { name: '', text: '' },
    fallback: 'mysql',
    expected: 'mysql',
  },
  {
    why: 'equal mysql and postgres scores tie',
    input: { name: 'x.sql', text: 'CREATE TABLE `a` (b jsonb);' },
    fallback: 'sqlite',
    expected: 'sqlite',
  },
];

describe('detectFormat', () => {
  it.each([
    ['dash', (n: number) => '-- ' + '-'.repeat(n)],
    ['slash', (n: number) => '/'.repeat(n)],
  ])('skips a long %s comment line before content in linear time', { timeout: 1000 }, (_kind, lineOf) => {
    // No ratio: the scan is one native indexOf, too fast for a stable one on CI. A scan that went back over
    // the line per character is quadratic: about 1M x 500k byte reads, far past the timeout (a sync test that
    // finishes late still fails), where the linear scan takes about a millisecond.
    const text = `${lineOf(1_000_000)}\nTable users {\n id int\n}`;
    // The dash line is a SQL comment, so DBML is not recognized behind it.
    expect(detectFormat({ name: '', text }, 'sqlite')).toBe(_kind === 'slash' ? 'dbml' : 'sqlite');
  });

  it.each(rows)('$why', ({ input, fallback, expected }) => {
    expect(detectFormat(input, fallback)).toBe(expected);
  });

  it('scans a near-miss marker in linear time', async () => {
    const textAt = (scale: number) => 'GENERATED '.repeat(50_000 * scale);
    expect(detectFormat({ name: '', text: textAt(1) }, 'sqlite')).toBe('sqlite');
    expect(await growth((scale) => { const text = textAt(scale); return () => detectFormat({ name: '', text }, 'sqlite'); })).toBeLessThan(MAX_LINEAR_GROWTH);
  });
});
