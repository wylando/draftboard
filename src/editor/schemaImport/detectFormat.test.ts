import { describe, expect, it } from 'vitest';
import { detectFormat, type DetectedFormat } from './detectFormat';

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
    ['dash', '-- ' + '-'.repeat(200)],
    ['slash', '/'.repeat(200)],
  ])('skips a long %s comment line before content quickly', (_kind, line) => {
    const text = `${line}\nTable users {\n id int\n}`;
    const start = performance.now();
    const format = detectFormat({ name: '', text }, 'sqlite');
    expect(performance.now() - start).toBeLessThan(100);
    // The dash line is a SQL comment, so DBML is not recognized behind it.
    expect(format).toBe(line.startsWith('/') ? 'dbml' : 'sqlite');
  });

  it.each(rows)('$why', ({ input, fallback, expected }) => {
    expect(detectFormat(input, fallback)).toBe(expected);
  });

  it('scans 1 MB of a near-miss marker in linear time', () => {
    const text = 'GENERATED '.repeat(100_000);
    const start = performance.now();
    expect(detectFormat({ name: '', text }, 'sqlite')).toBe('sqlite');
    expect(performance.now() - start).toBeLessThan(200);
  });
});
