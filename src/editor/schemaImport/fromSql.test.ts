import { describe, expect, it } from 'vitest';
import { classifyStatement, couldntParse, parseSql } from './fromSql';
import { growth, MAX_LINEAR_GROWTH } from './testGrowth';
import type { ImportedColumn, ImportedTable } from './types';

function col(t: ImportedTable, name: string): ImportedColumn {
  const c = t.columns.find((x) => x.name === name);
  if (!c) throw new Error(`no column ${name}`);
  return c;
}

function at<T>(items: T[], i: number): T {
  const item = items[i];
  if (item === undefined) throw new Error(`no item at ${i}`);
  return item;
}

describe('parseSql', () => {
  it('reads column order, types, nullability and flags', async () => {
    const { tables, format } = await parseSql(
      `CREATE TABLE products (
        id uuid PRIMARY KEY,
        name varchar(255) NOT NULL,
        price numeric(10,2),
        created_at timestamp with time zone,
        tags text[]
      );`,
      'postgres',
    );
    expect(format).toBe('postgres');
    expect(tables).toHaveLength(1);
    const table = at(tables, 0);
    expect(table.name).toBe('products');
    expect(table.indexes).toEqual([]);
    expect(table.columns).toEqual([
      {
        name: 'id',
        dataType: 'uuid',
        primaryKey: true,
        nullable: false,
        unique: false,
      },
      {
        name: 'name',
        dataType: 'varchar(255)',
        primaryKey: false,
        nullable: false,
        unique: false,
      },
      {
        name: 'price',
        dataType: 'numeric(10,2)',
        primaryKey: false,
        nullable: true,
        unique: false,
      },
      {
        name: 'created_at',
        dataType: 'timestamp with time zone',
        primaryKey: false,
        nullable: true,
        unique: false,
      },
      {
        name: 'tags',
        dataType: 'text[]',
        primaryKey: false,
        nullable: true,
        unique: false,
      },
    ]);
  });

  it('keeps literal and argument-less-call defaults and skips the rest', async () => {
    const { tables } = await parseSql(
      `CREATE TABLE t (
        a uuid DEFAULT gen_random_uuid(),
        b numeric DEFAULT 0,
        c text DEFAULT 'draft',
        d boolean DEFAULT true,
        e timestamptz DEFAULT now(),
        f int DEFAULT 1 + 2,
        g text DEFAULT NULL
      );`,
      'postgres',
    );
    expect(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => col(at(tables, 0), n).default)).toEqual([
      'gen_random_uuid()',
      '0',
      "'draft'",
      'true',
      'now()',
      undefined,
      undefined,
    ]);
  });

  it('strips the schema prefix from table names', async () => {
    const { tables } = await parseSql('CREATE TABLE public.users (id int);', 'postgres');
    expect(at(tables, 0).name).toBe('users');
  });

  it('reads a table-level composite primary key', async () => {
    const { tables } = await parseSql(
      'CREATE TABLE memberships (user_id int, team_id int, role text, PRIMARY KEY (user_id, team_id));',
      'postgres',
    );
    const t = at(tables, 0);
    expect(['user_id', 'team_id', 'role'].map((n) => col(t, n).primaryKey)).toEqual([true, true, false]);
    expect(['user_id', 'team_id', 'role'].map((n) => col(t, n).nullable)).toEqual([false, false, true]);
  });

  it('keeps single-column UNIQUE on the column and multi-column UNIQUE as an index', async () => {
    const { tables } = await parseSql(
      `CREATE TABLE accounts (
        email text UNIQUE,
        handle text,
        org int,
        slug text,
        UNIQUE (handle),
        CONSTRAINT uq_org_slug UNIQUE (org, slug),
        UNIQUE (slug, handle)
      );`,
      'postgres',
    );
    const t = at(tables, 0);
    expect(['email', 'handle', 'org'].map((n) => col(t, n).unique)).toEqual([true, true, false]);
    expect(t.indexes).toEqual([
      { name: 'uq_org_slug', columns: ['org', 'slug'], unique: true },
      { name: '', columns: ['slug', 'handle'], unique: true },
    ]);
  });

  it('turns inline REFERENCES and composite FOREIGN KEY into one relation per column pair', async () => {
    const { relations } = await parseSql(
      `CREATE TABLE orders (id int PRIMARY KEY);
       CREATE TABLE items (
         id int,
         order_id int REFERENCES orders(id),
         a int,
         b int,
         FOREIGN KEY (a, b) REFERENCES pairs (x, y)
       );`,
      'postgres',
    );
    expect(relations).toEqual([
      {
        fromTable: 'items',
        fromColumn: 'order_id',
        toTable: 'orders',
        toColumn: 'id',
        declared: true,
      },
      {
        fromTable: 'items',
        fromColumn: 'a',
        toTable: 'pairs',
        toColumn: 'x',
        declared: true,
      },
      {
        fromTable: 'items',
        fromColumn: 'b',
        toTable: 'pairs',
        toColumn: 'y',
        declared: true,
      },
    ]);
  });

  it('spells relation tables as declared, whatever case the reference used', async () => {
    const { relations } = await parseSql(
      `CREATE TABLE c (pid int REFERENCES parent(id));
       CREATE TABLE Parent (id int);
       CREATE TABLE d (cid int REFERENCES C(pid), uid int REFERENCES Undeclared(id));`,
      'postgres',
    );
    expect(relations).toEqual([
      {
        fromTable: 'c',
        fromColumn: 'pid',
        toTable: 'Parent',
        toColumn: 'id',
        declared: true,
      },
      {
        fromTable: 'd',
        fromColumn: 'cid',
        toTable: 'c',
        toColumn: 'pid',
        declared: true,
      },
      {
        fromTable: 'd',
        fromColumn: 'uid',
        toTable: 'Undeclared',
        toColumn: 'id',
        declared: true,
      },
    ]);
  });

  it('warns with the statement line for a syntax error and still imports the other tables', async () => {
    const { tables, warnings } = await parseSql(
      `CREATE TABLE a (id int);

CREATE TABLE b (id int,, x);
CREATE TABLE c (id int);`,
      'postgres',
    );
    expect(tables.map((t) => t.name)).toEqual(['a', 'c']);
    expect(warnings).toEqual([{ line: 3, message: "Couldn't parse: CREATE TABLE b (id int,, x)" }]);
  });

  it('truncates a long unparseable statement to one line of 60 characters', async () => {
    const { warnings } = await parseSql(
      `CREATE TABLE b (\n  id int,,\n  name varchar(255) NOT NULL DEFAULT 'a long default value'\n);`,
      'postgres',
    );
    const message = at(warnings, 0).message;
    expect(message).toBe("Couldn't parse: CREATE TABLE b ( id int,, name varchar(255) NOT NULL DEFAULT…");
  });

  it('keeps the first of two tables whose names match ignoring case, and warns', async () => {
    const { tables, warnings } = await parseSql(
      'CREATE TABLE Users (id int);\n\nCREATE TABLE users (email text);',
      'postgres',
    );
    expect(tables.map((t) => [t.name, t.columns.map((c) => c.name)])).toEqual([['Users', ['id']]]);
    expect(warnings).toEqual([{ line: 3, message: 'Table "users" is defined twice; kept the first' }]);
  });

  it('emits string defaults and enum values as the parser returns them, without re-escaping', async () => {
    const pg = await parseSql("CREATE TABLE t (s text DEFAULT 'it''s');", 'postgres');
    expect(col(at(pg.tables, 0), 's').default).toBe("'it''s'");
    const my = await parseSql("CREATE TABLE t (s text DEFAULT 'it\\'s', e ENUM('it''s','b'));", 'mysql');
    expect(col(at(my.tables, 0), 's').default).toBe("'it\\'s'");
    expect(col(at(my.tables, 0), 'e').dataType).toBe("enum('it''s','b')");
  });

  it('ignores table-level CHECK constraints', async () => {
    const { tables, warnings } = await parseSql(
      'CREATE TABLE b (a int, CHECK (a > 0), CONSTRAINT c CHECK (a < 9));',
      'postgres',
    );
    expect(tables.map((t) => t.columns.map((c) => c.name))).toEqual([['a']]);
    expect(warnings).toEqual([]);
  });

  it('skips a table with no column list and warns', async () => {
    const { tables, warnings } = await parseSql('CREATE TABLE a (id int);\nCREATE TABLE b AS SELECT 1;', 'postgres');
    expect(tables.map((t) => t.name)).toEqual(['a']);
    expect(warnings).toEqual([{ line: 2, message: 'Table "b" has no column list; skipped' }]);
  });

  it('parses MySQL backtick identifiers, AUTO_INCREMENT and table options', async () => {
    const { tables, relations, format } = await parseSql(
      `CREATE TABLE \`users\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`name\` VARCHAR(50) DEFAULT NULL,
        \`org_id\` INT,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_name\` (\`name\`, \`org_id\`),
        CONSTRAINT \`fk_org\` FOREIGN KEY (\`org_id\`) REFERENCES \`orgs\` (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      'mysql',
    );
    expect(format).toBe('mysql');
    const t = at(tables, 0);
    expect(t.columns).toEqual([
      {
        name: 'id',
        dataType: 'int unsigned',
        primaryKey: true,
        nullable: false,
        unique: false,
      },
      {
        name: 'name',
        dataType: 'varchar(50)',
        primaryKey: false,
        nullable: true,
        unique: false,
      },
      {
        name: 'org_id',
        dataType: 'int',
        primaryKey: false,
        nullable: true,
        unique: false,
      },
    ]);
    expect(t.indexes).toEqual([{ name: 'uq_name', columns: ['name', 'org_id'], unique: true }]);
    expect(relations).toEqual([
      {
        fromTable: 'users',
        fromColumn: 'org_id',
        toTable: 'orgs',
        toColumn: 'id',
        declared: true,
      },
    ]);
  });

  it('turns MySQL inline KEY, INDEX and FULLTEXT keys into non-unique indexes', async () => {
    const { tables } = await parseSql(
      'CREATE TABLE t (a int, b int, KEY idx_a (a), INDEX idx_ab (a, b), FULLTEXT KEY ft_b (b));',
      'mysql',
    );
    expect(at(tables, 0).indexes).toEqual([
      { name: 'idx_a', columns: ['a'], unique: false },
      { name: 'idx_ab', columns: ['a', 'b'], unique: false },
      { name: 'ft_b', columns: ['b'], unique: false },
    ]);
  });

  describe('pg_dump-style scripts', () => {
    // Every pg_dump object is preceded by a comment header; statements start at column 0.
    const withHeaders = (script: string) =>
      script.replace(/^(?=[A-Z])/gm, '--\n-- Name: x; Type: TYPE; Schema: public; Owner: postgres\n--\n\n');
    const dump = withHeaders(`SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SELECT pg_catalog.set_config('search_path', '', false);

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL
);

ALTER TABLE public.users OWNER TO postgres;

CREATE SEQUENCE public.users_id_seq START WITH 1;
ALTER TABLE public.users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.users_id_seq
    START WITH 1
);

CREATE TABLE public.posts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title text
);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

CREATE UNIQUE INDEX users_email_idx ON public.users USING btree (email);
CREATE INDEX posts_user_idx ON public.posts USING btree (user_id, title);

CREATE VIEW public.recent AS SELECT 1;
GRANT ALL ON TABLE public.users TO app;
`);

    it('builds the final schema from CREATE TABLE plus ALTER TABLE and CREATE INDEX, warning only about the dropped view', async () => {
      const { tables, relations, warnings } = await parseSql(dump, 'postgres');
      const column = (name: string, dataType: string, primaryKey = false): ImportedColumn => ({
        name,
        dataType,
        primaryKey,
        nullable: false,
        unique: false,
      });
      expect(tables).toEqual([
        {
          name: 'users',
          columns: [column('id', 'integer', true), column('email', 'character varying(255)')],
          indexes: [{ name: 'users_email_idx', columns: ['email'], unique: true }],
        },
        {
          name: 'posts',
          columns: [
            column('id', 'integer', true),
            column('user_id', 'integer'),
            { ...column('title', 'text'), nullable: true },
          ],
          indexes: [{ name: 'posts_user_idx', columns: ['user_id', 'title'], unique: false }],
        },
      ]);
      expect(relations).toEqual([
        { fromTable: 'posts', fromColumn: 'user_id', toTable: 'users', toColumn: 'id', declared: true },
      ]);
      const viewLine = dump.split('\n').findIndex((l) => l.startsWith('CREATE VIEW')) + 1;
      expect(warnings).toEqual([{ line: viewLine, message: 'Skipped CREATE VIEW' }]);
    });
  });

  it('applies ALTER TABLE constraints: composite PK, single and multi-column UNIQUE, FK', async () => {
    const { tables, relations } = await parseSql(
      `CREATE TABLE a (x int, y int, z int, w int);
       ALTER TABLE a ADD PRIMARY KEY (x, y);
       ALTER TABLE a ADD UNIQUE (z);
       ALTER TABLE a ADD CONSTRAINT uq_zw UNIQUE (z, w);
       ALTER TABLE A ADD CONSTRAINT fk FOREIGN KEY (z, w) REFERENCES b (p, q);`,
      'postgres',
    );
    const t = at(tables, 0);
    expect(['x', 'y', 'z', 'w'].map((n) => col(t, n).primaryKey)).toEqual([true, true, false, false]);
    expect(['x', 'y', 'z', 'w'].map((n) => col(t, n).nullable)).toEqual([false, false, true, true]);
    expect(['x', 'y', 'z', 'w'].map((n) => col(t, n).unique)).toEqual([false, false, true, false]);
    expect(t.indexes).toEqual([{ name: 'uq_zw', columns: ['z', 'w'], unique: true }]);
    expect(relations.map((r) => [r.fromTable, r.fromColumn, r.toTable, r.toColumn])).toEqual([
      ['a', 'z', 'b', 'p'],
      ['a', 'w', 'b', 'q'],
    ]);
  });

  it('warns when ALTER TABLE or CREATE INDEX names a table that was not defined', async () => {
    const { tables, warnings } = await parseSql(
      'ALTER TABLE ghost ADD PRIMARY KEY (id);\nCREATE INDEX idx ON ghost (id);',
      'postgres',
    );
    expect(tables).toEqual([]);
    expect(warnings).toEqual([
      { line: 1, message: 'ALTER TABLE "ghost": table not defined; skipped' },
      { line: 2, message: 'Index "idx": table "ghost" not defined; skipped' },
    ]);
  });

  it('skips an index that contains an expression and keeps ordered plain columns', async () => {
    const { tables, warnings } = await parseSql(
      `CREATE TABLE users (email text, a int, b int);
       CREATE INDEX by_lower ON users (lower((email)::text));
       CREATE INDEX by_ab ON users (a DESC, b);`,
      'postgres',
    );
    expect(at(tables, 0).indexes).toEqual([{ name: 'by_ab', columns: ['a', 'b'], unique: false }]);
    expect(warnings).toEqual([{ line: 2, message: 'Index "by_lower" uses an expression; skipped' }]);
  });

  it('reads MySQL ALTER TABLE foreign keys and CREATE INDEX', async () => {
    const { tables, relations } = await parseSql(
      `CREATE TABLE \`u\` (\`a\` int, \`b\` int);
       ALTER TABLE \`u\` ADD CONSTRAINT \`fk\` FOREIGN KEY (\`a\`) REFERENCES \`o\` (\`id\`);
       CREATE UNIQUE INDEX \`i\` ON \`u\` (\`a\`, \`b\`);`,
      'mysql',
    );
    expect(at(tables, 0).indexes).toEqual([{ name: 'i', columns: ['a', 'b'], unique: true }]);
    expect(relations).toHaveLength(1);
  });

  it('imports a table whose column uses inline GENERATED ... AS IDENTITY', async () => {
    const { tables, warnings } = await parseSql(
      `CREATE TABLE t (
        id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        n bigint GENERATED ALWAYS AS IDENTITY (START WITH 10 INCREMENT BY (2)) NOT NULL,
        x text
      );`,
      'postgres',
    );
    expect(warnings).toEqual([]);
    const t = at(tables, 0);
    expect(t.columns.map((c) => [c.name, c.dataType, c.primaryKey])).toEqual([
      ['id', 'integer', true],
      ['n', 'bigint', false],
      ['x', 'text', false],
    ]);
  });

  it('leaves identity-like text inside string literals alone', async () => {
    const { tables } = await parseSql(
      "CREATE TABLE t (note text DEFAULT 'GENERATED ALWAYS AS IDENTITY', id int GENERATED ALWAYS AS IDENTITY);",
      'postgres',
    );
    expect(col(at(tables, 0), 'note').default).toBe("'GENERATED ALWAYS AS IDENTITY'");
    expect(col(at(tables, 0), 'id').nullable).toBe(false);
  });

  it('ignores session, ownership and permission statements silently', async () => {
    const pg = await parseSql(
      `BEGIN;
       CREATE EXTENSION IF NOT EXISTS pgcrypto;
       CREATE SCHEMA app;
       DROP TABLE IF EXISTS old;
       COMMENT ON TABLE t IS 'x';
       -- Name: x; Type: ACL
       GRANT SELECT ON t TO app;
       /* block */ REVOKE ALL ON t FROM app;
       ALTER SEQUENCE s OWNED BY t.id;
       SELECT pg_catalog.setval('s', 1, false);
       COMMIT;`,
      'postgres',
    );
    expect(pg).toMatchObject({ tables: [], warnings: [] });
    const my = await parseSql(
      `/*!40101 SET NAMES utf8 */;
       LOCK TABLES \`t\` WRITE;
       UNLOCK TABLES;
       DROP TABLE IF EXISTS \`t\`;`,
      'mysql',
    );
    expect(my).toMatchObject({ tables: [], warnings: [] });
  });

  it('warns for dropped structure: views, functions, triggers, types and INSERT', async () => {
    const { warnings } = await parseSql(
      `CREATE MATERIALIZED VIEW mv AS SELECT 1;
       CREATE OR REPLACE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;
       --
       -- Name: trg; Type: TRIGGER
       --
       CREATE TRIGGER trg BEFORE INSERT ON t FOR EACH ROW EXECUTE FUNCTION f();
       CREATE TYPE mood AS ENUM ('a');
       -- data
       INSERT INTO t VALUES (1);`,
      'postgres',
    );
    expect(warnings).toEqual([
      { line: 1, message: 'Skipped CREATE MATERIALIZED VIEW' },
      { line: 2, message: 'Skipped CREATE FUNCTION' },
      { line: 6, message: 'Skipped CREATE TRIGGER' },
      { line: 7, message: 'Skipped CREATE TYPE' },
      { line: 9, message: 'Skipped INSERT' },
    ]);
  });

  it.each([
    ['serial', 'CREATE TABLE t (a serial, b bigserial, c smallserial, d int);', [false, false, false, true]],
    [
      'identity',
      'CREATE TABLE t (a int GENERATED ALWAYS AS IDENTITY, b int GENERATED BY DEFAULT AS IDENTITY (START WITH 5) NOT NULL, c int, d int);',
      [false, false, true, true],
    ],
  ])('treats %s columns as NOT NULL', async (_kind, sql, nullable) => {
    const { tables } = await parseSql(sql, 'postgres');
    expect(at(tables, 0).columns.map((c) => c.nullable)).toEqual(nullable);
  });

  it('applies ALTER TABLE ADD COLUMN, including inline REFERENCES, PRIMARY KEY and UNIQUE', async () => {
    const { tables, relations } = await parseSql(
      `CREATE TABLE t (id int);
       ALTER TABLE t ADD COLUMN owner_id int REFERENCES users(id);
       ALTER TABLE t ADD code varchar(5) NOT NULL UNIQUE, ADD COLUMN IF NOT EXISTS note text DEFAULT 'x';`,
      'postgres',
    );
    expect(at(tables, 0).columns).toEqual([
      { name: 'id', dataType: 'int', primaryKey: false, nullable: true, unique: false },
      { name: 'owner_id', dataType: 'int', primaryKey: false, nullable: true, unique: false },
      { name: 'code', dataType: 'varchar(5)', primaryKey: false, nullable: false, unique: true },
      { name: 'note', dataType: 'text', primaryKey: false, nullable: true, unique: false, default: "'x'" },
    ]);
    expect(relations).toEqual([
      { fromTable: 't', fromColumn: 'owner_id', toTable: 'users', toColumn: 'id', declared: true },
    ]);
  });

  it('warns for ALTER TABLE actions that change columns but are not applied, and stays silent for OWNER TO, SET DEFAULT and SET NOT NULL', async () => {
    const pg = await parseSql(
      `CREATE TABLE t (a int, b int);
       ALTER TABLE t DROP COLUMN b;
       ALTER TABLE t RENAME COLUMN a TO c;
       ALTER TABLE t ALTER COLUMN a TYPE bigint;
       ALTER TABLE t RENAME TO u;
       ALTER TABLE t OWNER TO x;
       ALTER TABLE t ALTER COLUMN a SET DEFAULT 1;
       ALTER TABLE t ALTER COLUMN a SET NOT NULL;`,
      'postgres',
    );
    expect(pg.warnings).toEqual([
      { line: 2, message: 'Skipped ALTER TABLE … DROP COLUMN' },
      { line: 3, message: 'Skipped ALTER TABLE … RENAME' },
      { line: 4, message: 'Skipped ALTER TABLE … ALTER COLUMN TYPE' },
      { line: 5, message: 'Skipped ALTER TABLE … RENAME' },
    ]);
    const my = await parseSql(
      'CREATE TABLE t (a int);\nALTER TABLE t MODIFY COLUMN a bigint;\nALTER TABLE t CHANGE a b int;',
      'mysql',
    );
    expect(my.warnings).toEqual([
      { line: 2, message: 'Skipped ALTER TABLE … MODIFY COLUMN' },
      { line: 3, message: 'Skipped ALTER TABLE … CHANGE COLUMN' },
    ]);
  });

  it('skips COPY data blocks with a warning', async () => {
    const { warnings } = await parseSql("COPY public.users (id) FROM stdin;", 'postgres');
    expect(warnings).toEqual([{ line: 1, message: 'Skipped COPY' }]);
  });

  it('keeps a generated column and drops only its expression', async () => {
    const { tables, warnings } = await parseSql(
      `CREATE TABLE m (a integer, b integer GENERATED ALWAYS AS ((a * 2)) STORED NOT NULL, c text DEFAULT 'GENERATED ALWAYS AS (1) STORED');
       ALTER TABLE m ADD COLUMN d integer GENERATED ALWAYS AS (a * 3) STORED;`,
      'postgres',
    );
    expect(warnings).toEqual([]);
    expect(at(tables, 0).columns.map((c) => [c.name, c.dataType, c.nullable])).toEqual([
      ['a', 'integer', true],
      ['b', 'integer', false],
      ['c', 'text', true],
      ['d', 'integer', true],
    ]);
    expect(col(at(tables, 0), 'c').default).toBe("'GENERATED ALWAYS AS (1) STORED'");
  });

  it('reads constraints that end in DEFERRABLE, INITIALLY ... or NOT VALID', async () => {
    const { tables, relations, warnings } = await parseSql(
      `CREATE TABLE u (id int, a int, b int);
       CREATE TABLE t (uid int, x int);
       ALTER TABLE t ADD CONSTRAINT f FOREIGN KEY (uid) REFERENCES u(id) NOT VALID;
       ALTER TABLE t ADD CONSTRAINT g FOREIGN KEY (x) REFERENCES u(id) DEFERRABLE INITIALLY DEFERRED;
       ALTER TABLE u ADD CONSTRAINT q UNIQUE (a, b) NOT DEFERRABLE INITIALLY IMMEDIATE;`,
      'postgres',
    );
    expect(warnings).toEqual([]);
    expect(relations.map((r) => r.fromColumn)).toEqual(['uid', 'x']);
    expect(at(tables, 0).indexes).toEqual([{ name: 'q', columns: ['a', 'b'], unique: true }]);
  });

  it('warns about an unparseable ALTER TABLE unless it is a known noise form', async () => {
    const noise = [
      'ALTER TABLE m ALTER COLUMN b ADD GENERATED ALWAYS AS IDENTITY (START WITH 1)',
      'ALTER TABLE m OWNER TO postgres',
      'ALTER TABLE m ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE m DISABLE ROW LEVEL SECURITY',
      'ALTER TABLE m SET (fillfactor = 70)',
      'ALTER TABLE m REPLICA IDENTITY FULL',
      'ALTER TABLE m CLUSTER ON m_pkey',
      'ALTER TABLE m ALTER COLUMN b SET STATISTICS 100',
      'ALTER TABLE m ALTER COLUMN b SET STORAGE EXTERNAL',
    ].join(';\n');
    expect((await parseSql(`CREATE TABLE m (b int);\n${noise};`, 'postgres')).warnings).toEqual([]);
    const { warnings } = await parseSql(
      'CREATE TABLE m (b int);\nALTER TABLE m ALTER COLUMN b SET COMPRESSION lz4;',
      'postgres',
    );
    expect(warnings).toEqual([{ line: 2, message: "Couldn't parse: ALTER TABLE m ALTER COLUMN b SET COMPRESSION lz4" }]);
  });

  it.each([
    ['CREATE CONSTRAINT TRIGGER t AFTER INSERT ON x DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION f()', 'Skipped CREATE CONSTRAINT TRIGGER'],
    ['CREATE AGGREGATE a(int) (sfunc = f, stype = int)', 'Skipped CREATE AGGREGATE'],
    ['DROP TABLE IF EXISTS other', undefined],
    ['DROP VIEW IF EXISTS t', undefined],
    ['CREATE ROLE r', undefined],
    ['CREATE USER u', undefined],
    ['ALTER ROLE r SET x = 1', undefined],
  ])('classifies %s', async (statement, warning) => {
    const { warnings } = await parseSql(`CREATE TABLE t (a int);\n${statement};`, 'postgres');
    expect(warnings).toEqual(warning ? [{ line: 2, message: warning }] : []);
  });

  describe('schema-qualified names (postgres)', () => {
    it('keeps same-named tables from different schemas apart', async () => {
      const { tables, relations, warnings } = await parseSql(
        `CREATE TABLE public.users (id uuid primary key);
         CREATE TABLE auth.users (id uuid primary key);
         CREATE TABLE public.profiles (uid uuid REFERENCES auth.users(id));`,
        'postgres',
      );
      expect(tables.map((t) => t.name)).toEqual(['users', 'auth.users', 'profiles']);
      expect(relations).toEqual([
        { fromTable: 'profiles', fromColumn: 'uid', toTable: 'auth.users', toColumn: 'id', declared: true },
      ]);
      expect(warnings).toEqual([]);
    });

    it('never resolves a reference to an undefined schema-qualified table to the bare name', async () => {
      const { relations } = await parseSql(
        'CREATE TABLE public.users (id int);\nCREATE TABLE p (uid int REFERENCES auth.users(id));',
        'postgres',
      );
      expect(relations.map((r) => r.toTable)).toEqual(['auth.users']);
    });

    it('routes ALTER TABLE and CREATE INDEX by the same rule', async () => {
      const { tables, warnings } = await parseSql(
        `CREATE TABLE public.users (id int);
         CREATE TABLE auth.users (id int);
         ALTER TABLE auth.users ADD COLUMN a int;
         ALTER TABLE users ADD COLUMN b int;
         ALTER TABLE public.users ADD COLUMN c int;
         CREATE INDEX i ON auth.users (a);
         ALTER TABLE other.users ADD COLUMN z int;
         CREATE INDEX j ON other.users (id);`,
        'postgres',
      );
      expect(tables.map((t) => [t.name, t.columns.map((c) => c.name), t.indexes.length])).toEqual([
        ['users', ['id', 'b', 'c'], 0],
        ['auth.users', ['id', 'a'], 1],
      ]);
      expect(warnings).toEqual([
        { line: 7, message: 'ALTER TABLE "other.users": table not defined; skipped' },
        { line: 8, message: 'Index "j": table "other.users" not defined; skipped' },
      ]);
    });

    it('treats only the public schema as the default when dropping', async () => {
      const { tables, warnings } = await parseSql(
        `CREATE TABLE PUBLIC.Users (id int);
         DROP TABLE IF EXISTS auth.users;
         CREATE TABLE auth.users (id int);
         DROP TABLE IF EXISTS public.users;
         DROP TABLE IF EXISTS auth.nothing;`,
        'postgres',
      );
      expect(tables.map((t) => t.name)).toEqual(['auth.users']);
      expect(warnings).toEqual([]);
    });
  });

  it('ignores a MySQL database qualifier', async () => {
    const { tables, relations } = await parseSql(
      'CREATE TABLE shop.users (id int);\nCREATE TABLE shop.p (uid int, FOREIGN KEY (uid) REFERENCES other.users (id));',
      'mysql',
    );
    expect(tables.map((t) => t.name)).toEqual(['users', 'p']);
    expect(relations.map((r) => r.toTable)).toEqual(['users']);
  });

  describe('MySQL', () => {
    it('reads ALTER TABLE ADD INDEX / KEY / FULLTEXT KEY as non-unique indexes', async () => {
      const { tables, warnings } = await parseSql(
        `CREATE TABLE m (a int, b int);
         ALTER TABLE m ADD INDEX ix (a);
         ALTER TABLE m ADD KEY iy (a, b);
         ALTER TABLE m ADD FULLTEXT KEY iz (b);`,
        'mysql',
      );
      expect(warnings).toEqual([]);
      expect(at(tables, 0).indexes).toEqual([
        { name: 'ix', columns: ['a'], unique: false },
        { name: 'iy', columns: ['a', 'b'], unique: false },
        { name: 'iz', columns: ['b'], unique: false },
      ]);
    });

    it('reads the parenthesised ADD COLUMN (a int, b int) form', async () => {
      const { tables, warnings } = await parseSql(
        'CREATE TABLE m (id int);\nALTER TABLE m ADD COLUMN (a int, b decimal(10,2) NOT NULL DEFAULT 0), ADD INDEX ix (a);',
        'mysql',
      );
      expect(warnings).toEqual([]);
      expect(at(tables, 0).columns.map((c) => [c.name, c.dataType, c.nullable])).toEqual([
        ['id', 'int', true],
        ['a', 'int', true],
        ['b', 'decimal(10,2)', false],
      ]);
      expect(at(tables, 0).indexes).toEqual([{ name: 'ix', columns: ['a'], unique: false }]);
    });

    it.each([
      ['ALTER TABLE m DROP PRIMARY KEY', 'mysql', 'DROP PRIMARY KEY'],
      ['ALTER TABLE m DROP INDEX ix', 'mysql', 'DROP INDEX'],
      ['ALTER TABLE m DROP KEY ix', 'mysql', 'DROP KEY'],
      ['ALTER TABLE m DROP FOREIGN KEY fk', 'mysql', 'DROP FOREIGN KEY'],
      ['ALTER TABLE m DROP CONSTRAINT x', 'postgres', 'DROP CONSTRAINT'],
    ] as const)('warns that %s is skipped', async (statement, dialect, action) => {
      const { warnings } = await parseSql(`CREATE TABLE m (a int);\n${statement};`, dialect);
      expect(warnings).toEqual([{ line: 2, message: `Skipped ALTER TABLE … ${action}` }]);
    });

    it.each([
      ["REPLACE INTO t VALUES (1)", 'Skipped INSERT'],
      ["CREATE DEFINER='a b'@'h' VIEW v AS SELECT 1", 'Skipped CREATE VIEW'],
      ['CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW v AS SELECT 1', 'Skipped CREATE VIEW'],
      ['CREATE DEFINER=CURRENT_USER() TRIGGER trg BEFORE INSERT ON t FOR EACH ROW SET NEW.a = 1', 'Skipped CREATE TRIGGER'],
    ])('classifies %s', async (statement, message) => {
      const { warnings } = await parseSql(statement, 'mysql');
      expect(warnings).toEqual([{ line: 1, message }]);
    });

    it('keeps the column of a prefix index and drops the prefix length', async () => {
      const { tables, warnings } = await parseSql(
        `CREATE TABLE m (name varchar(100), b int, KEY ix (name(10)));
         CREATE INDEX iy ON m (name(10) DESC, b);
         CREATE INDEX iz ON m ((b + 1));`,
        'mysql',
      );
      expect(at(tables, 0).indexes).toEqual([
        { name: 'ix', columns: ['name'], unique: false },
        { name: 'iy', columns: ['name', 'b'], unique: false },
      ]);
      expect(warnings).toEqual([{ line: 3, message: 'Index "iz" uses an expression; skipped' }]);
    });

    const dump = `-- MySQL dump 10.13  Distrib 8.0.33, for Linux (x86_64)
--
-- Host: localhost    Database: shop
-- ------------------------------------------------------
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Table structure for table \`users\`
--

DROP TABLE IF EXISTS \`users\`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
CREATE TABLE \`users\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`name\` varchar(50) DEFAULT NULL,
  \`org_id\` int DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`org_id\` (\`org_id\`),
  CONSTRAINT \`users_ibfk_1\` FOREIGN KEY (\`org_id\`) REFERENCES \`orgs\` (\`id\`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES \`users\` WRITE;
/*!40000 ALTER TABLE \`users\` DISABLE KEYS */;
INSERT INTO \`users\` VALUES (1,'a',NULL);
/*!40000 ALTER TABLE \`users\` ENABLE KEYS */;
UNLOCK TABLES;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=\`root\`@\`localhost\` SQL SECURITY DEFINER VIEW \`v\` AS select 1 */;

DELIMITER ;;
CREATE TRIGGER \`t1\` BEFORE INSERT ON \`users\` FOR EACH ROW BEGIN
  SET NEW.name = 'x';
END ;;
DELIMITER ;
`;

    it('imports a mysqldump file: the tables and relations, and warns only about dropped data and objects', async () => {
      const { tables, relations, warnings } = await parseSql(dump, 'mysql');
      const lineOf = (text: string) => dump.split('\n').findIndex((l) => l.includes(text)) + 1;
      expect(tables).toEqual([
        {
          name: 'users',
          columns: [
            { name: 'id', dataType: 'int', primaryKey: true, nullable: false, unique: false },
            { name: 'name', dataType: 'varchar(50)', primaryKey: false, nullable: true, unique: false },
            { name: 'org_id', dataType: 'int', primaryKey: false, nullable: true, unique: false },
          ],
          indexes: [{ name: 'org_id', columns: ['org_id'], unique: false }],
        },
      ]);
      expect(relations).toEqual([
        { fromTable: 'users', fromColumn: 'org_id', toTable: 'orgs', toColumn: 'id', declared: true },
      ]);
      expect(warnings).toEqual([
        { line: lineOf('INSERT INTO'), message: 'Skipped INSERT' },
        { line: lineOf('/*!50001'), message: 'Skipped CREATE VIEW' },
        { line: lineOf('CREATE TRIGGER'), message: 'Skipped CREATE TRIGGER' },
      ]);
    });
  });

  it.each(['postgres', 'mysql'] as const)('classifies a statement behind a long comment prefix in linear time (%s)', async (dialect) => {
    const commentAt = (scale: number) => `-- ${'-'.repeat(500_000 * scale)}\n/* ${'-- '.repeat(500_000 * scale)}\n*/\n`;
    const comment = commentAt(1);
    const grant = await parseSql(`${comment}GRANT ALL ON t TO u;`, dialect);
    const view = await parseSql(`${comment}CREATE VIEW v AS SELECT 1;`, dialect);
    const classifyAt = (scale: number) => {
      const prefix = commentAt(scale);
      return async () => {
        await parseSql(`${prefix}GRANT ALL ON t TO u;`, dialect);
        await parseSql(`${prefix}CREATE VIEW v AS SELECT 1;`, dialect);
      };
    };
    expect(await growth(classifyAt)).toBeLessThan(MAX_LINEAR_GROWTH);
    expect(grant.warnings).toEqual([]);
    expect(view.warnings).toEqual([{ line: 4, message: 'Skipped CREATE VIEW' }]);
  });

  it('applies DROP TABLE: the table and every relation from or to it are removed, silently', async () => {
    const { tables, relations, warnings } = await parseSql(
      `CREATE TABLE a (id int PRIMARY KEY);
       CREATE TABLE b (id int PRIMARY KEY, a_id int REFERENCES a(id));
       CREATE TABLE c (id int, b_id int REFERENCES b(id));
       DROP TABLE IF EXISTS "A", unknown CASCADE;
       CREATE TABLE a (id int);`,
      'postgres',
    );
    expect(tables.map((t) => t.name)).toEqual(['b', 'c', 'a']);
    expect(relations.map((r) => [r.fromTable, r.toTable])).toEqual([['c', 'b']]);
    expect(warnings).toEqual([]);
  });

  it('leaves no table behind for the MySQL 5.x view-stub sequence', async () => {
    const { tables, warnings } = await parseSql(
      `/*!50001 CREATE TABLE \`v1\` (\`id\` int) ENGINE=MyISAM */;
       /*!50001 DROP TABLE IF EXISTS \`v1\`*/;
       /*!50001 CREATE VIEW \`v1\` AS select 1 */;`,
      'mysql',
    );
    expect(tables).toEqual([]);
    expect(warnings).toEqual([{ line: 3, message: 'Skipped CREATE VIEW' }]);
  });

  it('summarises repeated INSERT and COPY statements in one warning each', async () => {
    const inserts = await parseSql(`${'INSERT INTO t VALUES (1);\n'.repeat(1233)}REPLACE INTO t VALUES (2);`, 'mysql');
    expect(inserts.warnings).toEqual([{ line: 1, message: 'Skipped 1,234 INSERT statements' }]);
    const copies = await parseSql(
      'CREATE TABLE t (a int);\nCOPY t (a) FROM stdin;\n1\n\\.\n\nCOPY t (a) FROM stdin;\n2\n\\.\n',
      'postgres',
    );
    expect(copies.warnings).toEqual([{ line: 2, message: 'Skipped 2 COPY statements' }]);
  });

  describe('MySQL CREATE TABLE forms', () => {
    it.each([
      ['table options after the column list', "CREATE TABLE m (a int) ENGINE=InnoDB STATS_PERSISTENT=0 ENCRYPTION='N' PAGE_CHECKSUM=1 TRANSACTIONAL=1"],
      ['a PARTITION BY clause', 'CREATE TABLE m (a int) ENGINE=InnoDB /*!50100 PARTITION BY HASH (a) PARTITIONS 4 */'],
      ['an INVISIBLE column', 'CREATE TABLE m (a int, b int INVISIBLE)'],
      ['a MariaDB PERSISTENT generated column', 'CREATE TABLE m (a int, b int AS (a * 2) PERSISTENT)'],
    ])('imports the table despite %s', async (_form, sql) => {
      const { tables, warnings } = await parseSql(sql, 'mysql');
      expect(warnings).toEqual([]);
      expect(tables.map((t) => t.name)).toEqual(['m']);
      expect(at(tables, 0).columns.map((c) => c.name).slice(0, 1)).toEqual(['a']);
    });

    it('keeps the table and drops a functional key part with a warning', async () => {
      const { tables, warnings } = await parseSql(
        'CREATE TABLE m (a int,\n  KEY fn ((a + 1)),\n  KEY ok (a));',
        'mysql',
      );
      expect(at(tables, 0).indexes).toEqual([{ name: 'ok', columns: ['a'], unique: false }]);
      expect(warnings).toEqual([{ line: 1, message: 'Index "fn" uses an expression; skipped' }]);
    });

    it.each([
      ['CREATE DEFINER=`root`@`localhost` EVENT e ON SCHEDULE EVERY 1 DAY DO SELECT 1', 'Skipped CREATE EVENT'],
      ['RENAME TABLE a TO b', 'Skipped RENAME TABLE'],
      ['ALTER EVENT e DISABLE', undefined],
      ['FLUSH TABLES', undefined],
      ['ANALYZE TABLE t', undefined],
      ['OPTIMIZE TABLE t', undefined],
      ["CREATE TABLESPACE ts ADD DATAFILE 'ts.ibd'", undefined],
    ])('classifies %s', async (statement, message) => {
      const { warnings } = await parseSql(`${statement};`, 'mysql');
      expect(warnings).toEqual(message ? [{ line: 1, message }] : []);
    });
  });

  describe('unterminated input', () => {
    const unterminated = (line: number) => ({ line, message: 'Unterminated quote or comment starts here; the rest of the file was ignored' });

    it.each(['postgres', 'mysql'] as const)('reports a quote that runs to the end of the file (%s)', async (dialect) => {
      const { tables, warnings } = await parseSql(
        "CREATE TABLE a (id int);\nCREATE TABLE b (n text DEFAULT 'oops);",
        dialect,
      );
      expect(tables.map((t) => t.name)).toEqual(['a']);
      expect(warnings).toEqual([
        { line: 2, message: expect.stringMatching(/^Couldn't parse: CREATE TABLE b/) },
        unterminated(2),
      ]);
    });

    it('keeps a statement that fails to parse reported next to the unterminated comment', async () => {
      const { tables, warnings } = await parseSql(
        'CREATE TABLE a (id int);\nCREATE TABLE b (id int,, ) /* x',
        'postgres',
      );
      expect(tables.map((t) => t.name)).toEqual(['a']);
      expect(warnings).toEqual([
        { line: 2, message: expect.stringMatching(/^Couldn't parse: CREATE TABLE b/) },
        unterminated(2),
      ]);
    });

    it('reports input that is only an unterminated comment', async () => {
      const { tables, warnings } = await parseSql('/* only', 'postgres');
      expect(tables).toEqual([]);
      expect(warnings).toEqual([unterminated(1)]);
    });

    it('points at the comment that opened after intact statements', async () => {
      const { tables, warnings } = await parseSql(
        'CREATE TABLE a (id int);\n\nCREATE TABLE b (id int);\n/* never closed\nCREATE TABLE c (id int);',
        'postgres',
      );
      expect(tables.map((t) => t.name)).toEqual(['a', 'b']);
      expect(warnings).toEqual([unterminated(4)]);
    });
  });

  describe('classifyStatement', () => {
    it.each([
      ['postgres', 'CREATE TABLE t (a int)', { kind: 'table' }],
      ['postgres', 'ALTER TABLE t ADD COLUMN b int', { kind: 'table' }],
      ['postgres', 'DROP TABLE IF EXISTS t', { kind: 'table' }],
      ['postgres', 'DROP VIEW v', { kind: 'noise' }],
      ['postgres', '--\n-- Name: t; Type: ACL\n--\nGRANT ALL ON t TO u', { kind: 'noise' }],
      ['postgres', 'CREATE VIEW v AS SELECT 1', { kind: 'dropped', message: 'Skipped CREATE VIEW' }],
      ['postgres', 'INSERT INTO t VALUES (1)', { kind: 'data', statement: 'INSERT' }],
      ['postgres', 'COPY t (a) FROM stdin', { kind: 'data', statement: 'COPY' }],
      ['mysql', 'RENAME TABLE a TO b', { kind: 'dropped', message: 'Skipped RENAME TABLE' }],
      ['mysql', 'FLUSH TABLES', { kind: 'noise' }],
      ['postgres', 'PRAGMA foreign_keys = ON', { kind: 'table' }],
      ['sqlite', 'CREATE TABLE t (a int)', { kind: 'table' }],
      ['sqlite', 'PRAGMA foreign_keys = ON', { kind: 'noise' }],
      ['sqlite', "ATTACH DATABASE 'x.db' AS x", { kind: 'noise' }],
      ['sqlite', 'DETACH DATABASE x', { kind: 'noise' }],
      ['sqlite', 'VACUUM', { kind: 'noise' }],
      ['sqlite', 'REINDEX t', { kind: 'noise' }],
      ['sqlite', 'ANALYZE', { kind: 'noise' }],
      ['sqlite', 'CREATE VIRTUAL TABLE t USING fts5(a)', { kind: 'dropped', message: 'Skipped CREATE VIRTUAL TABLE' }],
      ['sqlite', 'CREATE VIEW v AS SELECT 1', { kind: 'dropped', message: 'Skipped CREATE VIEW' }],
    ] as const)('%s: %s', (dialect, sql, expected) => {
      expect(classifyStatement(sql, dialect)).toEqual(expected);
    });
  });

  describe('couldntParse', () => {
    it('strips leading comments, collapses whitespace and cuts at 60 characters', () => {
      expect(couldntParse('-- Name: t\n/* c */\nCREATE TABLE   t\n(id int,,)')).toBe("Couldn't parse: CREATE TABLE t (id int,,)");
      const long = couldntParse(`CREATE TABLE t (${'x int, '.repeat(20)})`);
      expect(long).toBe(`Couldn't parse: ${`CREATE TABLE t (${'x int, '.repeat(20)})`.slice(0, 60)}…`);
    });
  });
});
