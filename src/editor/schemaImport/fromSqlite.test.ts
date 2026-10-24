import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { parseSqliteDb, parseSqliteSql } from './fromSqlite';
import { growth, MAX_LINEAR_GROWTH } from './testGrowth';

async function dbFrom(ddl: string): Promise<Uint8Array> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  try {
    db.run(ddl);
    return db.export();
  } finally {
    db.close();
  }
}

const parse = async (ddl: string) => parseSqliteDb(await dbFrom(ddl));

describe('parseSqliteDb', () => {
  it('reads declared types, defaults and nullability', async () => {
    const s = await parse(`CREATE TABLE t (id INTEGER PRIMARY KEY, name VARCHAR(20) NOT NULL DEFAULT 'x', raw, n INT DEFAULT (1+2));`);
    expect(s.format).toBe('sqlite-db');
    expect(s.tables[0]?.columns).toEqual([
      { name: 'id', dataType: 'INTEGER', primaryKey: true, nullable: false, unique: false },
      { name: 'name', dataType: 'VARCHAR(20)', primaryKey: false, nullable: false, unique: false, default: "'x'" },
      { name: 'raw', dataType: '', primaryKey: false, nullable: true, unique: false },
      { name: 'n', dataType: 'INT', primaryKey: false, nullable: true, unique: false, default: '1+2' },
    ]);
  });

  it('keeps tables in declaration order and ignores sqlite_ internals', async () => {
    const s = await parse(`CREATE TABLE b (id INTEGER PRIMARY KEY AUTOINCREMENT); CREATE TABLE a (id INT);`);
    expect(s.tables.map((t) => t.name)).toEqual(['b', 'a']);
  });

  it('marks composite primary key columns', async () => {
    const s = await parse(`CREATE TABLE t (a INT, b INT, c INT, PRIMARY KEY (b, a));`);
    expect(s.tables[0]?.columns.map((c) => [c.name, c.primaryKey, c.nullable])).toEqual([
      ['a', true, false],
      ['b', true, false],
      ['c', false, true],
    ]);
  });

  it('maps inline UNIQUE to the column and multi-column UNIQUE to an unnamed index', async () => {
    const s = await parse(`CREATE TABLE t (a INT UNIQUE, b INT, c INT, UNIQUE (b, c));`);
    const t = s.tables[0];
    expect(t?.columns.map((c) => c.unique)).toEqual([true, false, false]);
    expect(t?.indexes).toEqual([{ name: '', columns: ['b', 'c'], unique: true }]);
  });

  it('imports CREATE INDEX in creation order and skips expression indexes with a warning', async () => {
    const s = await parse(`CREATE TABLE t (a INT, b INT);
      CREATE INDEX i_a ON t (a);
      CREATE UNIQUE INDEX i_ab ON t (a, b);
      CREATE INDEX i_expr ON t (lower(a));`);
    expect(s.tables[0]?.indexes).toEqual([
      { name: 'i_a', columns: ['a'], unique: false },
      { name: 'i_ab', columns: ['a', 'b'], unique: true },
    ]);
    expect(s.warnings).toEqual([{ message: 'Index "i_expr" uses an expression; skipped' }]);
  });

  it('imports a partial index but warns that its WHERE was dropped', async () => {
    const s = await parse(`CREATE TABLE t (a INT); CREATE UNIQUE INDEX i_p ON t (a) WHERE a > 0;`);
    expect(s.tables[0]?.indexes).toEqual([{ name: 'i_p', columns: ['a'], unique: true }]);
    expect(s.warnings).toEqual([{ message: 'Index "i_p" is partial; its WHERE clause was dropped' }]);
  });

  it('reads an inline foreign key and resolves REFERENCES without columns to the parent PK', async () => {
    const s = await parse(`
      CREATE TABLE p (id INT PRIMARY KEY);
      CREATE TABLE c (a INT REFERENCES p(id), b INT REFERENCES P);`);
    expect(s.relations).toEqual([
      { fromTable: 'c', fromColumn: 'a', toTable: 'p', toColumn: 'id', declared: true },
      { fromTable: 'c', fromColumn: 'b', toTable: 'p', toColumn: 'id', declared: true },
    ]);
  });

  it('reads a composite foreign key as one relation per column pair, in key order', async () => {
    const s = await parse(`
      CREATE TABLE q (x INT, y INT, PRIMARY KEY (x, y));
      CREATE TABLE c (qy INT, qx INT, FOREIGN KEY (qx, qy) REFERENCES q (x, y));`);
    expect(s.relations).toEqual([
      { fromTable: 'c', fromColumn: 'qx', toTable: 'q', toColumn: 'x', declared: true },
      { fromTable: 'c', fromColumn: 'qy', toTable: 'q', toColumn: 'y', declared: true },
    ]);
  });

  it('keeps foreign keys in declaration order', async () => {
    const s = await parse(`
      CREATE TABLE p1 (id INT PRIMARY KEY); CREATE TABLE p2 (id INT PRIMARY KEY); CREATE TABLE p3 (id INT PRIMARY KEY);
      CREATE TABLE c (a INT REFERENCES p1, b INT REFERENCES p2, c INT REFERENCES p3);`);
    expect(s.relations.map((r) => r.toTable)).toEqual(['p1', 'p2', 'p3']);
  });

  it('resolves foreign key columns to their declared spelling', async () => {
    const s = await parse(`CREATE TABLE p (id INT PRIMARY KEY); CREATE TABLE c (Pid INT REFERENCES P(ID));`);
    expect(s.relations).toEqual([{ fromTable: 'c', fromColumn: 'Pid', toTable: 'p', toColumn: 'id', declared: true }]);
  });

  it('skips a foreign key naming a missing column', async () => {
    const s = await parse(`CREATE TABLE p (id INT PRIMARY KEY); CREATE TABLE c (a INT REFERENCES p(nope));`);
    expect(s.relations).toEqual([]);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]?.message).toMatch(/"c".*"p"/);
  });

  it('skips a foreign key to a parent without a primary key', async () => {
    const s = await parse(`CREATE TABLE p (id INT); CREATE TABLE c (pid INT REFERENCES p);`);
    expect(s.relations).toEqual([]);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]?.message).toMatch(/"c".*"p"/);
  });

  it('handles names with spaces and quotes', async () => {
    const s = await parse(`
      CREATE TABLE "my ""t""" (id INTEGER PRIMARY KEY, "a b" INT UNIQUE);
      CREATE TABLE "c d" ("ref x" INT REFERENCES "my ""t""" (id));
      CREATE INDEX "i x" ON "my ""t""" ("a b");`);
    expect(s.tables.map((t) => t.name)).toEqual(['my "t"', 'c d']);
    expect(s.tables[0]?.indexes[0]).toEqual({ name: 'i x', columns: ['a b'], unique: false });
    expect(s.relations).toEqual([
      { fromTable: 'c d', fromColumn: 'ref x', toTable: 'my "t"', toColumn: 'id', declared: true },
    ]);
  });

  it('reports each skipped view and trigger', async () => {
    const s = await parse(`CREATE TABLE t (a INT);
      CREATE VIEW v AS SELECT a FROM t;
      CREATE TRIGGER trg AFTER INSERT ON t BEGIN SELECT 1; END;`);
    expect(s.warnings).toEqual([{ message: 'Skipped CREATE VIEW' }, { message: 'Skipped CREATE TRIGGER' }]);
  });

  it('does not mistake user tables for SQLite internals', async () => {
    const s = await parse(`CREATE TABLE sqlite3_data (a INT); CREATE TABLE SQLiteDemo (a INT);`);
    expect(s.tables.map((t) => t.name)).toEqual(['sqlite3_data', 'SQLiteDemo']);
  });

  it('skips virtual tables and their shadow tables with a warning', async () => {
    const s = await parse(`CREATE TABLE a (x INT); CREATE VIRTUAL TABLE docs USING fts4(body);`);
    expect(s.tables.map((t) => t.name)).toEqual(['a']);
    expect(s.warnings).toEqual([{ message: 'Skipped virtual table "docs"' }]);
  });

  it('keeps a real table whose name merely starts with a virtual table name', async () => {
    const s = await parse(`CREATE VIRTUAL TABLE docs USING fts4(body); CREATE TABLE docs_archive (id INT);`);
    expect(s.tables.map((t) => t.name)).toEqual(['docs_archive']);
  });

  it('skips a virtual table whose module sql.js lacks without losing the rest', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(`CREATE TABLE a (x INT); CREATE VIRTUAL TABLE docs USING fts4(body);`);
    // fts5 isn't compiled into sql.js, so rewrite the stored SQL to get a module the reader can't load.
    db.run(`PRAGMA writable_schema = 1; UPDATE sqlite_master SET sql = replace(sql, 'fts4', 'fts5') WHERE name = 'docs';`);
    const bytes = db.export();
    db.close();
    const s = await parseSqliteDb(bytes);
    expect(s.tables.map((t) => t.name)).toContain('a');
    expect(s.tables.map((t) => t.name)).not.toContain('docs');
    expect(s.warnings).toContainEqual({ message: 'Skipped virtual table "docs"' });
  });

  it('imports a WITHOUT ROWID table', async () => {
    const s = await parse(`CREATE TABLE t (k TEXT, v TEXT, PRIMARY KEY (k)) WITHOUT ROWID;`);
    expect(s.tables[0]?.columns.map((c) => [c.name, c.primaryKey, c.nullable])).toEqual([
      ['k', true, false],
      ['v', false, true],
    ]);
  });

  it('keeps generated columns as plain columns', async () => {
    const s = await parse(`CREATE TABLE t (a INT, b INT GENERATED ALWAYS AS (a * 2) VIRTUAL, c INT AS (a + 1) STORED);`);
    expect(s.tables[0]?.columns.map((c) => c.name)).toEqual(['a', 'b', 'c']);
  });

  it('treats empty bytes as unreadable', async () => {
    const s = await parseSqliteDb(new Uint8Array(0));
    expect(s.tables).toEqual([]);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]?.message).toMatch(/^This isn't a readable SQLite database \(.+\)\.$/);
  });

  it('turns a truncated file into a warning', async () => {
    const bytes = await dbFrom(`CREATE TABLE t (a TEXT); INSERT INTO t VALUES ('x');`);
    const s = await parseSqliteDb(bytes.slice(0, 100));
    expect(s.tables).toEqual([]);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]?.message).toMatch(/^This isn't a readable SQLite database \(.+\)\.$/);
  });

  it('turns an unreadable file into a warning instead of throwing', async () => {
    const s = await parseSqliteDb(new TextEncoder().encode('this is definitely not a sqlite database file, just text'.repeat(10)));
    expect(s.tables).toEqual([]);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]?.message).toMatch(/^This isn't a readable SQLite database \(.+\)\.$/);
  });
});

describe('parseSqliteSql', () => {
  it('imports a sqlite3 .schema dump and reports what it skipped, with lines', async () => {
    const s = await parseSqliteSql(`PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "user accounts" (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE);
CREATE TABLE post (
  id INTEGER PRIMARY KEY,
  author INTEGER REFERENCES "user accounts"(id),
  editor INTEGER,
  FOREIGN KEY (editor) REFERENCES "user accounts" (id)
);
CREATE INDEX post_author ON post (author);
CREATE VIEW v AS SELECT id FROM post;
CREATE TRIGGER trg AFTER INSERT ON post BEGIN SELECT 1; END;
INSERT INTO post VALUES (1, 1, 1);
COMMIT;`);
    expect(s.format).toBe('sqlite');
    expect(s.tables.map((t) => [t.name, t.columns.map((c) => c.name), t.indexes])).toEqual([
      ['user accounts', ['id', 'email'], []],
      ['post', ['id', 'author', 'editor'], [{ name: 'post_author', columns: ['author'], unique: false }]],
    ]);
    expect(s.relations).toEqual([
      { fromTable: 'post', fromColumn: 'author', toTable: 'user accounts', toColumn: 'id', declared: true },
      { fromTable: 'post', fromColumn: 'editor', toTable: 'user accounts', toColumn: 'id', declared: true },
    ]);
    expect(s.warnings).toEqual([
      { line: 11, message: 'Skipped CREATE VIEW' },
      { line: 12, message: 'Skipped CREATE TRIGGER' },
      { line: 13, message: 'Skipped INSERT' },
    ]);
  });

  it('summarises repeated INSERTs once', async () => {
    const s = await parseSqliteSql(`CREATE TABLE t (a INT);\nINSERT INTO t VALUES (1);\nINSERT INTO t VALUES (2);`);
    expect(s.warnings).toEqual([{ line: 2, message: 'Skipped 2 INSERT statements' }]);
  });

  it('reports a statement SQLite rejects and still imports the rest', async () => {
    const s = await parseSqliteSql(`CREATE TABLE a (x INT);\nCREATE TABLE b (x INT,, y);\nCREATE TABLE c (x INT);`);
    expect(s.tables.map((t) => t.name)).toEqual(['a', 'c']);
    expect(s.warnings).toEqual([{ line: 2, message: "Couldn't parse: CREATE TABLE b (x INT,, y)" }]);
  });

  it('ignores ATTACH, so a table in another schema fails instead of importing', async () => {
    const s = await parseSqliteSql(`ATTACH 'x.db' AS y; CREATE TABLE y.t (id int);`);
    expect(s.tables).toEqual([]);
    expect(s.warnings).toEqual([{ line: 1, message: "Couldn't parse: CREATE TABLE y.t (id int)" }]);
  });

  it('lets SQLite apply DROP TABLE', async () => {
    const s = await parseSqliteSql(`CREATE TABLE a (x INT); CREATE TABLE b (x INT); DROP TABLE a;`);
    expect(s.tables.map((t) => t.name)).toEqual(['b']);
  });

  it('warns where an unterminated quote starts', async () => {
    const s = await parseSqliteSql(`CREATE TABLE a (x INT);\nCREATE TABLE b (y TEXT DEFAULT 'oops);`);
    expect(s.tables.map((t) => t.name)).toEqual(['a']);
    expect(s.warnings.at(-1)).toEqual({
      line: 2,
      message: 'Unterminated quote or comment starts here; the rest of the file was ignored',
    });
  });

  it('keeps a trigger body with CASE ... END whole', async () => {
    const s = await parseSqliteSql(`CREATE TABLE a (x INT);
CREATE TRIGGER trg AFTER INSERT ON a BEGIN
  UPDATE a SET x = CASE WHEN x > 1 THEN 1 ELSE 0 END;
  SELECT 1;
END;
CREATE TABLE b (y INT);`);
    expect(s.tables.map((t) => t.name)).toEqual(['a', 'b']);
    expect(s.warnings).toEqual([{ line: 2, message: 'Skipped CREATE TRIGGER' }]);
  });

  it('leaves a leading comment out of the Couldn\'t parse snippet', async () => {
    const s = await parseSqliteSql(`-- the broken one\nCREATE TABLE b (x INT,, y);`);
    expect(s.warnings).toEqual([{ line: 2, message: "Couldn't parse: CREATE TABLE b (x INT,, y)" }]);
  });

  it('does not run CREATE TABLE ... AS, so a runaway query cannot hang the import', async () => {
    const runaway = 'CREATE TABLE r AS WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n) SELECT i FROM n;';
    const s = await parseSqliteSql(`CREATE TABLE a (x INT);\n${runaway}`);
    // A run query never ends, so the cost per skipped statement staying flat is the guard.
    const manyAt = (scale: number) => Array.from({ length: 2_000 * scale }, (_, i) => runaway.replace(' r ', ` r${i} `)).join('\n');
    expect(await growth((scale) => { const sql = manyAt(scale); return () => parseSqliteSql(sql); })).toBeLessThan(MAX_LINEAR_GROWTH);
    expect(s.tables.map((t) => t.name)).toEqual(['a']);
    expect(s.warnings).toEqual([{ line: 2, message: 'Skipped CREATE TABLE … AS SELECT (its columns come from a query)' }]);
  });

  it('skips statements that are not schema definitions', async () => {
    const s = await parseSqliteSql(`CREATE TABLE a (x INT);
UPDATE a SET x = 1;
DELETE FROM a;
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n) INSERT INTO a SELECT i FROM n;
SAVEPOINT s;`);
    expect(s.tables.map((t) => t.name)).toEqual(['a']);
    expect(s.warnings).toEqual([
      { line: 2, message: 'Skipped UPDATE' },
      { line: 3, message: 'Skipped DELETE' },
      { line: 4, message: 'Skipped WITH' },
      { line: 5, message: 'Skipped SAVEPOINT' },
    ]);
  });

  it('imports TEMP tables like normal tables', async () => {
    const s = await parseSqliteSql(`-- scratch\nCREATE TEMP TABLE t1(a int); CREATE TEMPORARY TABLE IF NOT EXISTS t2(b int);`);
    expect(s.tables.map((t) => t.name)).toEqual(['t1', 't2']);
    expect(s.warnings).toEqual([]);
  });
});
