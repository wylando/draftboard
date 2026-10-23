import { describe, expect, it } from 'vitest';
import { splitStatements } from './splitStatements';

describe('splitStatements', () => {
  it('splits on semicolons and records each statement start line', () => {
    expect(splitStatements('CREATE TABLE a (id int);\nCREATE TABLE b (id int);')).toEqual([
      { sql: 'CREATE TABLE a (id int)', line: 1 },
      { sql: 'CREATE TABLE b (id int)', line: 2 },
    ]);
  });

  it('reports the line of the first token, skipping leading blanks and comments', () => {
    const [stmt] = splitStatements('\n\n-- header\n/* multi\nline */\n  CREATE TABLE a (id int);');
    expect(stmt!.line).toBe(6);
    expect(stmt!.sql.endsWith('CREATE TABLE a (id int)')).toBe(true);
  });

  it.each([
    ['single-quoted string with escaped quote', "INSERT INTO t VALUES ('a;b', 'it''s;');", "INSERT INTO t VALUES ('a;b', 'it''s;')", 1],
    ['double-quoted identifier', 'CREATE TABLE "we;ird" (id int);', 'CREATE TABLE "we;ird" (id int)', 1],
    ['backtick identifier', 'CREATE TABLE `we;ird` (id int);', 'CREATE TABLE `we;ird` (id int)', 1],
    ['line comment', '-- note; x\nSELECT 1;', '-- note; x\nSELECT 1', 2],
    ['block comment', '/* a; b */ SELECT 1;', '/* a; b */ SELECT 1', 1],
  ])('does not split on a semicolon inside a %s', (_name, src, sql, line) => {
    expect(splitStatements(src)).toEqual([{ sql, line }]);
  });

  it('keeps counting lines after multi-line strings and dollar-quoted bodies', () => {
    expect(splitStatements("SELECT 'a\nb;\nc';\nSELECT $$x;\ny;\n$$;\nSELECT 3;")).toEqual([
      { sql: "SELECT 'a\nb;\nc'", line: 1 },
      { sql: 'SELECT $$x;\ny;\n$$', line: 4 },
      { sql: 'SELECT 3', line: 7 },
    ]);
  });

  it('does not treat a digit-first tag like $1$ as a dollar quote', () => {
    expect(splitStatements('SELECT $1$ ; SELECT 2; SELECT $1$ ;').map((s) => s.sql)).toEqual([
      'SELECT $1$',
      'SELECT 2',
      'SELECT $1$',
    ]);
  });

  it('does not open a dollar quote right after an identifier character', () => {
    expect(splitStatements('CREATE TABLE t$x$ (id int);\nCREATE TABLE b (id int);')).toEqual([
      { sql: 'CREATE TABLE t$x$ (id int)', line: 1 },
      { sql: 'CREATE TABLE b (id int)', line: 2 },
    ]);
  });

  it('keeps dollar-quoted bodies whole, matching tags exactly', () => {
    const src = 'CREATE FUNCTION f() AS $fn$ BEGIN $$; x; END $fn$ LANGUAGE sql;\nSELECT 1;';
    const out = splitStatements(src);
    expect(out).toHaveLength(2);
    expect(out[0]!.sql).toContain('END $fn$ LANGUAGE sql');
    expect(out[1]).toEqual({ sql: 'SELECT 1', line: 2 });
  });

  it('drops statements that are only whitespace or comments', () => {
    expect(splitStatements('-- nothing\n;\n/* x */ ;  ;\nSELECT 1;')).toEqual([
      { sql: 'SELECT 1', line: 4 },
    ]);
  });

  it('returns a final statement that has no trailing semicolon', () => {
    expect(splitStatements('SELECT 1;\nSELECT 2')).toEqual([
      { sql: 'SELECT 1', line: 1 },
      { sql: 'SELECT 2', line: 2 },
    ]);
  });

  it('counts CRLF line breaks as one line each', () => {
    const out = splitStatements('SELECT 1;\r\n\r\nSELECT 2;\r\n');
    expect(out.map((s) => s.line)).toEqual([1, 3]);
  });

  it('skips COPY ... FROM stdin data rows, apostrophes included, up to the \\. line', () => {
    const src = "CREATE TABLE a (id int);\nCOPY a (id, n) FROM stdin;\n1\tx\n2\tO'Brien\n\\.\n\nALTER TABLE a ADD PRIMARY KEY (id);";
    expect(splitStatements(src)).toEqual([
      { sql: 'CREATE TABLE a (id int)', line: 1 },
      { sql: 'COPY a (id, n) FROM stdin', line: 2 },
      { sql: 'ALTER TABLE a ADD PRIMARY KEY (id)', line: 7 },
    ]);
  });

  it('skips to the end of input when COPY data has no terminator', () => {
    expect(splitStatements("COPY a (id) FROM stdin;\n1\nSELECT 'x;")).toEqual([
      { sql: 'COPY a (id) FROM stdin', line: 1 },
    ]);
  });
});
