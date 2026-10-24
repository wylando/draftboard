import { describe, expect, it } from 'vitest';
import { splitStatements } from './splitStatements';
import { growth, MAX_LINEAR_GROWTH } from './testGrowth';

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

  describe('mysql dialect', () => {
    it('treats a backslash as an escape inside strings only for mysql', () => {
      expect(splitStatements("SELECT 'it\\'s; ok'; SELECT 2", 'mysql')).toEqual([
        { sql: "SELECT 'it\\'s; ok'", line: 1 },
        { sql: 'SELECT 2', line: 1 },
      ]);
      expect(splitStatements("SELECT 'C:\\'; SELECT 2").map((s) => s.sql)).toEqual([
        "SELECT 'C:\\'",
        'SELECT 2',
      ]);
    });

    it('treats # as a line comment only for mysql', () => {
      const src = 'SELECT 1 # 2;\nSELECT 3;';
      expect(splitStatements(src, 'mysql')).toEqual([{ sql: 'SELECT 1 # 2;\nSELECT 3', line: 1 }]);
      expect(splitStatements(src)).toHaveLength(2);
    });

    it('needs whitespace after -- to start a comment only for mysql', () => {
      const src = 'SELECT 1 --1;\nSELECT 2;';
      expect(splitStatements(src, 'mysql').map((s) => s.sql)).toEqual(['SELECT 1 --1', 'SELECT 2']);
      expect(splitStatements(src)).toHaveLength(1);
    });

    it('switches the delimiter with DELIMITER lines and drops the directives', () => {
      const src =
        'DELIMITER ;;\nCREATE TRIGGER t BEFORE INSERT ON a FOR EACH ROW BEGIN SET x=1; END;;\ndelimiter ;\nSELECT 2;';
      expect(splitStatements(src, 'mysql')).toEqual([
        { sql: 'CREATE TRIGGER t BEFORE INSERT ON a FOR EACH ROW BEGIN SET x=1; END', line: 2 },
        { sql: 'SELECT 2', line: 4 },
      ]);
    });

    it('honors DELIMITER only between statements', () => {
      const src = 'CREATE TABLE t (\n  id int,\n  delimiter varchar(5),\n  x int\n);';
      expect(splitStatements(src, 'mysql')).toEqual([
        { sql: 'CREATE TABLE t (\n  id int,\n  delimiter varchar(5),\n  x int\n)', line: 1 },
      ]);
    });

    it('does not open dollar quotes, so a $$ delimiter works', () => {
      const src = 'DELIMITER $$\nCREATE PROCEDURE p() BEGIN SELECT 1;\nEND\n$$\nDELIMITER ;\nSELECT 2;';
      expect(splitStatements(src, 'mysql')).toEqual([
        { sql: 'CREATE PROCEDURE p() BEGIN SELECT 1;\nEND', line: 2 },
        { sql: 'SELECT 2', line: 6 },
      ]);
    });

    it('unwraps versioned comments into code and keeps plain comments as comments', () => {
      const src = '/*!40101 SET NAMES utf8 */;\n/*!50001 CREATE VIEW v AS SELECT 1 */;\n/* plain; */ SELECT 3;';
      expect(splitStatements(src, 'mysql')).toEqual([
        { sql: 'SET NAMES utf8', line: 1 },
        { sql: 'CREATE VIEW v AS SELECT 1', line: 2 },
        { sql: '/* plain; */ SELECT 3', line: 3 },
      ]);
      expect(splitStatements('/*!40101 SET NAMES utf8 */;\nSELECT 3;')).toEqual([
        { sql: 'SELECT 3', line: 2 },
      ]);
    });
  });

  it.each(['postgres', 'mysql'] as const)('scans a long dash comment line in linear time (%s)', async (dialect) => {
    expect(splitStatements(`-- ${'-'.repeat(200)}\nSELECT 1;`, dialect)).toEqual([{ sql: `-- ${'-'.repeat(200)}\nSELECT 1`, line: 2 }]);
    const sqlAt = (scale: number) => `-- ${'-'.repeat(8_000_000 * scale)}\nSELECT 1;`;
    expect(await growth((scale) => { const sql = sqlAt(scale); return () => splitStatements(sql, dialect); })).toBeLessThan(MAX_LINEAR_GROWTH);
  });

  it('skips COPY data when the column list is very long', () => {
    const cols = Array.from({ length: 40 }, (_, n) => `column_number_${n}`).join(', ');
    const src = `COPY public.a (${cols}) FROM stdin;\n1\tO'Brien\n\\.\nCREATE TABLE b (id int);`;
    expect(splitStatements(src).map((s) => s.sql.slice(0, 12))).toEqual(['COPY public.', 'CREATE TABLE']);
  });

  it('reports where a string that runs to the end of input began', () => {
    const ok = splitStatements("SELECT 'a';\nSELECT 2;");
    expect(ok.some((s) => 'unterminatedAt' in s)).toBe(false);
    expect(splitStatements("SELECT 1;\nSELECT 'a\\'; SELECT 2;", 'mysql')).toEqual([
      { sql: 'SELECT 1', line: 1 },
      { sql: "SELECT 'a\\'; SELECT 2;", line: 2, unterminatedAt: 2 },
    ]);
  });

  it.each([
    ['block comment after a complete statement', 'postgres', 'SELECT 1;\n/* never closed; x', [
      { sql: 'SELECT 1', line: 1 },
      { sql: '', line: 2, unterminatedAt: 2 },
    ]],
    ['block comment inside a statement', 'postgres', 'SELECT 1;\nSELECT 2\n/* x\ny', [
      { sql: 'SELECT 1', line: 1 },
      { sql: 'SELECT 2\n/* x\ny', line: 2, unterminatedAt: 3 },
    ]],
    ['dollar-quoted body', 'postgres', 'SELECT 1;\nSELECT $$ never; closed', [
      { sql: 'SELECT 1', line: 1 },
      { sql: 'SELECT $$ never; closed', line: 2, unterminatedAt: 2 },
    ]],
    ['versioned comment', 'mysql', 'SELECT 1;\n/*!40101 SET x=1;', [
      { sql: 'SELECT 1', line: 1 },
      { sql: 'SET x=1', line: 2, unterminatedAt: 2 },
    ]],
    ['block comment with no statements', 'postgres', '/* only', [{ sql: '', line: 1, unterminatedAt: 1 }]],
  ] as const)('reports an unterminated %s', (_name, dialect, src, expected) => {
    const out = splitStatements(src, dialect);
    expect(out).toEqual(expected);
    expect(out.map((s) => 'unterminatedAt' in s)).toEqual(expected.map((s) => 'unterminatedAt' in s));
  });


  describe('sqlite dialect', () => {
    it('keeps a trigger body with several statements in one statement', () => {
      const trigger = 'CREATE TRIGGER t AFTER INSERT ON a BEGIN\n  UPDATE b SET x = 1;\n  INSERT INTO c VALUES (1);\nEND';
      expect(splitStatements(`${trigger};\nSELECT 2;`, 'sqlite')).toEqual([
        { sql: trigger, line: 1 },
        { sql: 'SELECT 2', line: 5 },
      ]);
    });

    it('matches TEMPORARY triggers case-insensitively', () => {
      const src = 'create temporary trigger u after delete on a begin select 1; select 2; end; select 3;';
      expect(splitStatements(src, 'sqlite').map((s) => s.sql)).toEqual([
        'create temporary trigger u after delete on a begin select 1; select 2; end',
        'select 3',
      ]);
    });

    it('does not end a trigger at the END of a CASE expression', () => {
      const trigger =
        'CREATE TRIGGER t AFTER INSERT ON a BEGIN\n  UPDATE b SET x = CASE WHEN 1 THEN 2 END;\n  DELETE FROM c;\nEND';
      expect(splitStatements(`${trigger};\nSELECT 2;`, 'sqlite').map((s) => s.sql)).toEqual([trigger, 'SELECT 2']);
    });

    it('counts only the first BEGIN, so a column named begin does not keep the trigger open', () => {
      const trigger = 'CREATE TRIGGER t AFTER INSERT ON a BEGIN\n  UPDATE e SET begin = 1;\nEND';
      expect(splitStatements(`${trigger};\nCREATE TABLE b (id int);`, 'sqlite')).toEqual([
        { sql: trigger, line: 1 },
        { sql: 'CREATE TABLE b (id int)', line: 4 },
      ]);
    });

    it('reports a trigger body still open at the end of input', () => {
      const rest = 'CREATE TRIGGER t AFTER INSERT ON a BEGIN\n  SELECT 1;\nCREATE TABLE b (id int);';
      expect(splitStatements(`CREATE TABLE a (id int);\n${rest}`, 'sqlite')).toEqual([
        { sql: 'CREATE TABLE a (id int)', line: 1 },
        { sql: rest, line: 2, unterminatedAt: 2 },
      ]);
    });

    it('leaves BEGIN/COMMIT transaction statements alone', () => {
      expect(splitStatements('BEGIN; SELECT 1; COMMIT;', 'sqlite').map((s) => s.sql)).toEqual([
        'BEGIN',
        'SELECT 1',
        'COMMIT',
      ]);
    });

    it('treats [bracketed] names as quoted identifiers only for sqlite', () => {
      const src = 'CREATE TABLE [a;b] (id int);\nSELECT 2;';
      expect(splitStatements(src, 'sqlite').map((s) => s.sql)).toEqual(['CREATE TABLE [a;b] (id int)', 'SELECT 2']);
      expect(splitStatements(src)).toHaveLength(3);
    });

    it('does not open dollar quotes', () => {
      const src = 'SELECT $a$, 1; SELECT 2; SELECT $a$;';
      expect(splitStatements(src, 'sqlite')).toHaveLength(3);
      expect(splitStatements(src)).toHaveLength(1);
    });
  });
});
