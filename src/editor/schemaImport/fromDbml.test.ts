import { describe, expect, it } from 'vitest';
import { parseDbml } from './fromDbml';

describe('parseDbml', () => {
  it('reads columns, types with arguments, defaults, keys, indexes and the table note', async () => {
    const schema = await parseDbml(`Table users {
  id int [pk]
  email varchar(255) [unique, not null]
  name varchar [default: 'O\\'Brien']
  age int [default: 18]
  active boolean [default: true]
  created timestamp [default: \`now()\`]
  Note: 'people'
  indexes {
    (email, name) [unique, name: 'u_en']
    name
    \`lower(email)\` [name: 'by_lower']
  }
}`);
    expect(schema).toEqual({
      format: 'dbml',
      tables: [
        {
          name: 'users',
          note: 'people',
          columns: [
            { name: 'id', dataType: 'int', primaryKey: true, nullable: false, unique: false },
            { name: 'email', dataType: 'varchar(255)', primaryKey: false, nullable: false, unique: true },
            { name: 'name', dataType: 'varchar', primaryKey: false, nullable: true, unique: false, default: "'O''Brien'" },
            { name: 'age', dataType: 'int', primaryKey: false, nullable: true, unique: false, default: '18' },
            { name: 'active', dataType: 'boolean', primaryKey: false, nullable: true, unique: false, default: 'true' },
            { name: 'created', dataType: 'timestamp', primaryKey: false, nullable: true, unique: false, default: 'now()' },
          ],
          indexes: [
            { name: 'u_en', columns: ['email', 'name'], unique: true },
            { name: '', columns: ['name'], unique: false },
          ],
        },
      ],
      relations: [],
      warnings: [{ message: 'Skipped index "by_lower" on table "users" (it uses an expression)' }],
    });
  });

  it('turns a composite primary key declared as an index into primary-key columns', async () => {
    const schema = await parseDbml('Table m { a int\n b int\n c int\n indexes { (a, b) [pk] } }');
    expect(schema.tables[0]?.columns.map((c) => [c.name, c.primaryKey, c.nullable])).toEqual([
      ['a', true, false],
      ['b', true, false],
      ['c', false, true],
    ]);
    expect(schema.tables[0]?.indexes).toEqual([]);
  });

  it('reads inline and standalone refs once, from the many side to the one side', async () => {
    const schema = await parseDbml(`Table users { id int [pk]
  email varchar }
Table posts { id int [pk]
  user_id int [ref: > users.id]
  author varchar }
Ref: posts.author > users.email
Ref: users.id < posts.id`);
    expect(schema.warnings).toEqual([]);
    expect(schema.relations).toEqual([
      { fromTable: 'posts', fromColumn: 'user_id', toTable: 'users', toColumn: 'id', declared: true },
      { fromTable: 'posts', fromColumn: 'author', toTable: 'users', toColumn: 'email', declared: true },
      { fromTable: 'posts', fromColumn: 'id', toTable: 'users', toColumn: 'id', declared: true },
    ]);
  });

  it('splits a composite ref into one relation per column pair', async () => {
    const schema = await parseDbml(`Table a { x int
 y int }
Table b { x int
 y int }
Ref: b.(x, y) > a.(x, y)`);
    expect(schema.relations).toEqual([
      { fromTable: 'b', fromColumn: 'x', toTable: 'a', toColumn: 'x', declared: true },
      { fromTable: 'b', fromColumn: 'y', toTable: 'a', toColumn: 'y', declared: true },
    ]);
  });

  it('marks - as one-to-one and <> as many-to-many, with the inline declarer as the from end', async () => {
    const schema = await parseDbml(`Table a { id int }
Table b { id int
 a_id int [ref: - a.id] }
Table c { id int }
Ref: a.id <> c.id`);
    expect(schema.relations).toEqual([
      { fromTable: 'b', fromColumn: 'a_id', toTable: 'a', toColumn: 'id', declared: true, cardinality: 'one-to-one' },
      { fromTable: 'a', fromColumn: 'id', toTable: 'c', toColumn: 'id', declared: true, cardinality: 'many-to-many' },
    ]);
  });

  it('names a table outside public as schema.table', async () => {
    const schema = await parseDbml('Table auth.users { id int }\nTable public.p { id int }');
    expect(schema.tables.map((t) => t.name)).toEqual(['auth.users', 'p']);
  });

  it('imports nothing and reports 1-based line and column for a syntax error', async () => {
    const schema = await parseDbml('Table a { id int }\nTable broken { id int [pk');
    expect(schema.tables).toEqual([]);
    expect(schema.relations).toEqual([]);
    expect(schema.warnings.length).toBeGreaterThan(0);
    for (const w of schema.warnings) {
      expect(w.line).toBeGreaterThanOrEqual(2);
      expect(w.message).toMatch(/\(column \d+\)$/);
    }
  });

  it('imports nothing when a ref names an unknown table', async () => {
    const schema = await parseDbml('Table a { id int }\nTable b { x int [ref: > nope.id] }');
    expect(schema.tables).toEqual([]);
    expect(schema.warnings).toEqual([{ line: 2, message: "Table 'nope' does not exist in Schema 'public' (column 25)" }]);
  });

  it('names the table, and the index only when it has a name, when an expression index is skipped', async () => {
    const schema = await parseDbml('Table t { a int\n indexes { `lower(a)` } }');
    expect(schema.warnings).toEqual([{ message: 'Skipped an index on table "t" (it uses an expression)' }]);
  });

  it('puts a standalone one-to-one foreign key on the non-key end, in either written order', async () => {
    const decl = 'Table users { id int [pk] }\nTable profiles { user_id int }\n';
    const expected = [{ fromTable: 'profiles', fromColumn: 'user_id', toTable: 'users', toColumn: 'id', declared: true, cardinality: 'one-to-one' }];
    expect((await parseDbml(decl + 'Ref: users.id - profiles.user_id')).relations).toEqual(expected);
    expect((await parseDbml(decl + 'Ref: profiles.user_id - users.id')).relations).toEqual(expected);
  });

  it('keeps the written order for a one-to-one between two keys', async () => {
    const schema = await parseDbml('Table a { id int [pk] }\nTable b { id int [pk] }\nRef: a.id - b.id');
    expect(schema.relations).toEqual([{ fromTable: 'a', fromColumn: 'id', toTable: 'b', toColumn: 'id', declared: true, cardinality: 'one-to-one' }]);
  });

  it('warns once that enums are not imported, keeping the enum name as the column type', async () => {
    const schema = await parseDbml('Enum status { open\n closed }\nEnum kind { a }\nTable t { s status }');
    expect(schema.tables[0]?.columns[0]?.dataType).toBe('status');
    expect(schema.warnings).toEqual([{ message: 'Skipped enum types; their columns keep the enum name as the type' }]);
  });
});
