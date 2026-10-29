import { describe, expect, it } from 'vitest';
import { createConnector } from '../model/connector';
import { createNode } from '../model/nodes';
import type { Anchor, Column, ConnectorNode, DesignNode, TableNode } from '../model/types';
import { parseDbml } from '../schemaImport/fromDbml';
import { parseSql } from '../schemaImport/fromSql';
import { parseSqliteSql } from '../schemaImport/fromSqlite';
import type { ImportedSchema } from '../schemaImport/types';
import { collectSchema, toDbml, toSql } from './exportSchema';

type ColumnSpec = Partial<Column> & { name: string };

// Column ids are their names, so tests can anchor connectors by name.
function table(name: string, columns: ColumnSpec[], extra: Partial<TableNode> = {}): TableNode {
  const base = createNode('table', { x: 0, y: 0, width: 240, height: 64 }, []) as TableNode;
  return {
    ...base,
    name,
    columns: columns.map((c) => ({ id: c.name, dataType: 'integer', primaryKey: false, nullable: false, unique: false, ...c })),
    indexes: [],
    ...extra,
  };
}

const col = (t: TableNode, columnId: string): Anchor => ({ kind: 'column', tableId: t.id, columnId });
const whole = (t: TableNode): Anchor => ({ kind: 'node', nodeId: t.id });

function link(nodes: DesignNode[], from: Anchor, to: Anchor, patch: Partial<ConnectorNode> = {}): ConnectorNode {
  return { ...createConnector(from, to, `connector ${nodes.length}`, new Map(nodes.map((n) => [n.id, n]))), ...patch };
}

const users = () =>
  table('users', [
    { name: 'id', dataType: 'integer', primaryKey: true },
    { name: 'email', dataType: 'text', unique: true },
    { name: 'bio', dataType: 'text', nullable: true, default: "'O''Brien'" },
    { name: 'created', dataType: 'timestamp', default: 'now()' },
  ]);

/** What a parser read back, minus what an export doesn't promise to keep (warnings, format). */
const shape = (schema: ImportedSchema) => ({ tables: schema.tables, relations: schema.relations });

describe('collectSchema', () => {
  it('exports the selected tables, counting tables inside a selected frame', () => {
    const a = users();
    const frame = createNode('frame', { x: 0, y: 0, width: 400, height: 400 }, []);
    const b = { ...table('posts', [{ name: 'id', primaryKey: true }]), parentId: frame.id };
    const c = table('tags', [{ name: 'id', primaryKey: true }]);
    const nodes = [a, frame, b, c];
    expect(collectSchema(nodes, [a.id])).toMatchObject({ scope: 'selection', tables: [{ name: 'users' }] });
    expect(collectSchema(nodes, [frame.id, c.id]).tables.map((t) => t.name)).toEqual(['posts', 'tags']);
  });

  it('falls back to every visible table when the selection holds none', () => {
    const a = users();
    const hidden = table('secret', [{ name: 'id' }], { visible: false });
    const frame = { ...createNode('frame', { x: 0, y: 0, width: 400, height: 400 }, []), visible: false };
    const inHidden = { ...table('inside', [{ name: 'id' }]), parentId: frame.id };
    const rect = createNode('rect', { x: 0, y: 0, width: 10, height: 10 }, []);
    const nodes = [a, hidden, frame, inHidden, rect];
    expect(collectSchema(nodes, []).tables.map((t) => t.name)).toEqual(['users']);
    expect(collectSchema(nodes, [rect.id])).toMatchObject({ scope: 'board', tables: [{ name: 'users' }] });
    // Selected, a hidden table is exported: the user asked for it.
    expect(collectSchema(nodes, [hidden.id]).tables.map((t) => t.name)).toEqual(['secret']);
  });

  it('keeps foreign keys, one-to-ones and many-to-manys between exported tables, and says what it skipped', () => {
    const a = users();
    const posts = table('posts', [{ name: 'id', primaryKey: true }, { name: 'user_id' }, { name: 'editor_id' }]);
    const profile = table('profile', [{ name: 'user_id', primaryKey: true }]);
    const tags = table('tags', [{ name: 'id', primaryKey: true }]);
    const noKey = table('notes', [{ name: 'body', dataType: 'text' }]);
    const empty = table('empty', []);
    const outside = table('outside', [{ name: 'id', primaryKey: true }]);
    const tables = [a, posts, profile, tags, noKey, empty, outside];
    const fk = link(tables, col(posts, 'user_id'), col(a, 'id'));
    const oneToOne = link(tables, col(profile, 'user_id'), col(a, 'id'), { fromCardinality: 'one', toCardinality: 'zeroOrOne' });
    const manyToMany = link(tables, whole(posts), whole(tags), { fromCardinality: 'many', toCardinality: 'oneOrMany' });
    const notFk = link(tables, col(posts, 'editor_id'), col(a, 'id'), { name: 'not fk', isForeignKey: false });
    const oneToMany = link(tables, whole(a), whole(tags), { name: 'one to many' });
    const unkeyed = link(tables, whole(tags), whole(noKey), { name: 'unkeyed', fromCardinality: 'many', toCardinality: 'many' });
    const leaving = link(tables, col(posts, 'editor_id'), col(outside, 'id'), { name: 'leaving' });
    const loose = link(tables, col(posts, 'editor_id'), col(a, 'bio'), { name: 'loose' });
    const nodes = [...tables, fk, oneToOne, manyToMany, notFk, oneToMany, unkeyed, leaving, loose];
    const schema = collectSchema(
      nodes,
      tables.filter((t) => t !== outside).map((t) => t.id),
    );

    expect(schema.tables.map((t) => t.name)).toEqual(['users', 'posts', 'profile', 'tags', 'notes']);
    expect(schema.foreignKeys.map((f) => [f.from.name, f.fromColumn.name, f.to.name, f.toColumn.name, f.oneToOne])).toEqual([
      ['posts', 'user_id', 'users', 'id', false],
      ['profile', 'user_id', 'users', 'id', true],
    ]);
    expect(schema.manyToMany.map((m) => [m.a.name, m.b.name])).toEqual([['posts', 'tags']]);
    expect(schema.warnings).toEqual(['Table "empty" has no columns; skipped']);
    // Named by their ends, never by the connector layer's name.
    expect(schema.skippedLinks).toEqual([
      { ends: 'posts.editor_id → users.id', reason: "isn't a foreign key" },
      { ends: 'users → tags', reason: "links whole tables but isn't many-to-many; link columns to export a foreign key" },
      { ends: 'tags → notes', reason: '"notes" has no primary key' },
      { ends: 'posts.editor_id → outside.id', reason: '"outside" isn\'t included', missingTableId: outside.id },
      { ends: 'posts.editor_id → users.bio', reason: '"users"."bio" isn\'t unique or the primary key' },
    ]);
  });
});

describe('collectSchema, links it cannot write', () => {
  it('says so for a link between a table and a column, instead of dropping it silently', () => {
    const a = users();
    const posts = table('posts', [{ name: 'id', primaryKey: true }]);
    const tables = [a, posts];
    const mixed = link(tables, whole(posts), col(a, 'id'));
    expect(collectSchema([...tables, mixed], []).skippedLinks).toEqual([
      { ends: 'posts → users.id', reason: 'links a table to a column; link two columns to export a foreign key' },
    ]);
  });

  it('offers to include a missing table only when it has columns to export', () => {
    const a = users();
    const bare = table('bare', []);
    const full = table('full', [{ name: 'id', primaryKey: true }]);
    const tables = [a, bare, full];
    const nodes = [...tables, link(tables, col(a, 'id'), col(full, 'id')), link(tables, col(a, 'id'), whole(bare), { isForeignKey: true })];
    const links = collectSchema(nodes, [a.id]).skippedLinks;
    expect(links.map((l) => l.missingTableId)).toEqual([full.id, undefined]);
    expect(links[1]!.reason).toBe('"bare" has no columns');
  });
});

// One design that touches every column and relation feature, read back through the importers.
function design() {
  const a = table(
    'Order Items',
    [
      { name: 'order_id', primaryKey: true },
      { name: 'Line No', primaryKey: true },
      { name: 'price', dataType: 'numeric(10,2)', nullable: true, default: '0' },
    ],
    { note: "One row per line\nof an 'order'" },
  );
  const u = users();
  const profile = table('profile', [{ name: 'user_id', primaryKey: true }, { name: 'nickname', dataType: 'text', nullable: true }]);
  const tables = [a, u, profile];
  u.indexes = [{ id: 'i1', name: 'by_created', columnIds: ['created', 'email'], unique: true }];
  a.columns.push({ id: 'buyer', name: 'buyer', dataType: 'integer', primaryKey: false, nullable: true, unique: false });
  const nodes: DesignNode[] = [
    ...tables,
    link(tables, col(a, 'buyer'), col(u, 'id')),
    link(tables, col(profile, 'user_id'), col(u, 'id'), { fromCardinality: 'one', toCardinality: 'one' }),
  ];
  return collectSchema(nodes, []);
}

const orderItems = {
  name: 'Order Items',
  columns: [
    { name: 'order_id', dataType: 'integer', primaryKey: true, nullable: false, unique: false },
    { name: 'Line No', dataType: 'integer', primaryKey: true, nullable: false, unique: false },
    { name: 'price', dataType: 'numeric(10,2)', primaryKey: false, nullable: true, unique: false, default: '0' },
    { name: 'buyer', dataType: 'integer', primaryKey: false, nullable: true, unique: false },
  ],
  indexes: [],
};

describe('toSql', () => {
  it.each(['postgres', 'mysql'] as const)('writes %s DDL that the importer reads back as the design', async (dialect) => {
    const { text, warnings } = toSql(design(), dialect);
    expect(warnings).toEqual([]);
    const parsed = await parseSql(text, dialect);
    expect(parsed.warnings).toEqual([]);
    const [readItems, readUsers, profile] = parsed.tables;
    expect(readItems).toEqual(orderItems);
    expect(readUsers?.columns).toEqual([
      { name: 'id', dataType: 'integer', primaryKey: true, nullable: false, unique: false },
      { name: 'email', dataType: 'text', primaryKey: false, nullable: false, unique: true },
      { name: 'bio', dataType: 'text', primaryKey: false, nullable: true, unique: false, default: "'O''Brien'" },
      { name: 'created', dataType: 'timestamp', primaryKey: false, nullable: false, unique: false, default: 'now()' },
    ]);
    expect(readUsers?.indexes).toEqual([{ name: 'by_created', columns: ['created', 'email'], unique: true }]);
    // A one-to-one is a foreign key whose column is unique; a primary key already is.
    expect(profile?.columns[0]).toMatchObject({ name: 'user_id', primaryKey: true });
    expect(parsed.relations).toEqual([
      { fromTable: 'Order Items', fromColumn: 'buyer', toTable: 'users', toColumn: 'id', declared: true },
      { fromTable: 'profile', fromColumn: 'user_id', toTable: 'users', toColumn: 'id', declared: true },
    ]);
  });

  it('writes SQLite DDL that SQLite itself runs, with foreign keys inline', async () => {
    const { text } = toSql(design(), 'sqlite');
    expect(text).not.toMatch(/ALTER TABLE/);
    const parsed = await parseSqliteSql(text);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.tables.map((t) => t.name)).toEqual(['Order Items', 'users', 'profile']);
    expect(parsed.relations).toEqual([
      { fromTable: 'Order Items', fromColumn: 'buyer', toTable: 'users', toColumn: 'id', declared: true },
      { fromTable: 'profile', fromColumn: 'user_id', toTable: 'users', toColumn: 'id', declared: true },
    ]);
  });

  it('prefixes every line of a note as a comment', () => {
    expect(toSql(design(), 'postgres').text).toContain("-- One row per line\n-- of an 'order'\nCREATE TABLE \"Order Items\"");
    const t = table('t', [{ name: 'a', note: 'one\rtwo', default: '1 +\n1' }], { note: 'x\ry' });
    const text = toSql(collectSchema([t], []), 'postgres').text;
    expect(text).not.toMatch(/\r/);
    expect(text).toContain('-- x\n-- y\n');
    expect(text).toContain('DEFAULT 1 + 1, -- one two'.replace(',', ''));
  });

  it('makes a one-to-one foreign key column unique', async () => {
    const a = users();
    const b = table('passport', [{ name: 'id', primaryKey: true }, { name: 'owner' }]);
    const nodes = [a, b, link([a, b], col(b, 'owner'), col(a, 'id'), { fromCardinality: 'zeroOrOne', toCardinality: 'one' })];
    const parsed = await parseSql(toSql(collectSchema(nodes, []), 'postgres').text, 'postgres');
    expect(parsed.tables[1]?.columns[1]).toMatchObject({ name: 'owner', unique: true });
    // Part of a composite key, the column alone mustn't become unique.
    const c = table('visa', [{ name: 'owner', primaryKey: true }, { name: 'country', primaryKey: true }]);
    const composite = [a, c, link([a, c], col(c, 'owner'), col(a, 'id'), { fromCardinality: 'one', toCardinality: 'one' })];
    expect(toSql(collectSchema(composite, []), 'postgres').text).not.toMatch(/"owner"[^\n]*UNIQUE/);
  });

  it('wraps expression defaults in parentheses where MySQL and SQLite need them', async () => {
    const t = table('t', [
      { name: 'id', dataType: 'char(36)', primaryKey: true, default: 'uuid()' },
      { name: 'at', dataType: 'timestamp', default: 'CURRENT_TIMESTAMP' },
    ]);
    const mysql = toSql(collectSchema([t], []), 'mysql').text;
    expect(mysql).toContain('DEFAULT (uuid())');
    expect(mysql).toContain('DEFAULT CURRENT_TIMESTAMP');
    const day = table('d', [{ name: 'on', dataType: 'date', default: 'current_date' }, { name: 'msg', dataType: 'text', default: "'a\nb'" }]);
    // MySQL takes only CURRENT_TIMESTAMP and its synonyms bare; a string keeps its line break.
    expect(toSql(collectSchema([day], []), 'mysql').text).toContain("DEFAULT (current_date)");
    expect(toSql(collectSchema([day], []), 'postgres').text).toContain("DEFAULT 'a\nb'");
    expect((await parseSql(mysql, 'mysql')).warnings).toEqual([]);
    expect(toSql(collectSchema([t], []), 'postgres').text).toContain('DEFAULT uuid()');
  });

  // Types stay as written, so each dialect gets key types it accepts; auto-numbering never reaches the junction.
  it.each([
    ['postgres', 'serial', 'bigint generated always as identity', ['integer', 'bigint']],
    ['mysql', 'int auto_increment', 'bigint', ['int', 'bigint']],
    ['sqlite', 'integer', 'integer', ['integer', 'integer']],
  ] as const)('generates a junction table for a many-to-many in %s', async (dialect, postKey, tagKey, junctionTypes) => {
    const posts = table('posts', [{ name: 'id', dataType: postKey, primaryKey: true }]);
    const tags = table('Tag', [
      { name: 'scope', dataType: 'text', primaryKey: true },
      { name: 'id', dataType: tagKey, primaryKey: true },
    ]);
    const posts_tag = table('posts_tag', [{ name: 'x' }]);
    const nodes = [posts, tags, posts_tag, link([posts, tags], whole(posts), whole(tags), { fromCardinality: 'many', toCardinality: 'many' })];
    const { text } = toSql(collectSchema(nodes, []), dialect);
    const parsed = dialect === 'sqlite' ? await parseSqliteSql(text) : await parseSql(text, dialect);
    expect(parsed.warnings).toEqual([]);
    const junction = parsed.tables[3];
    // Its name steers clear of the existing posts_tag.
    expect(junction?.name).toBe('posts_tag_2');
    expect(junction?.columns.map((c) => [c.name, c.dataType.toLowerCase(), c.primaryKey])).toEqual([
      ['posts_id', junctionTypes[0], true],
      ['tag_scope', 'text', true],
      ['tag_id', junctionTypes[1], true],
    ]);
    expect(parsed.relations.map((r) => `${r.fromTable}.${r.fromColumn}>${r.toTable}.${r.toColumn}`)).toEqual([
      'posts_tag_2.posts_id>posts.id',
      'posts_tag_2.tag_scope>Tag.scope',
      'posts_tag_2.tag_id>Tag.id',
    ]);
  });

  it('keeps index names unique across the schema where the dialect needs it, and fills in missing types', async () => {
    const a = table('a', [{ name: 'name', dataType: '' }]);
    const b = table('b', [{ name: 'name', dataType: 'text' }]);
    a.indexes = [
      { id: 'i1', name: 'by_name', columnIds: ['name'], unique: false },
      { id: 'i2', name: 'pending', columnIds: [], unique: false },
    ];
    b.indexes = [
      { id: 'i1', name: 'BY_NAME', columnIds: ['name'], unique: false },
      { id: 'i2', name: 'a', columnIds: ['name'], unique: false },
      { id: 'i3', name: 'ghost', columnIds: ['gone'], unique: false },
    ];
    const schema = collectSchema([a, b], []);

    const pg = toSql(schema, 'postgres');
    expect(pg.warnings).toEqual([
      'Table "a": column "name" has no type; exported as text',
      'Table "a": index "pending" has no columns; skipped',
      'Table "b": index "ghost" names a column the table doesn\'t have; skipped',
      'Table "b": index "BY_NAME" is also used by another table; exported as "BY_NAME_2"',
      'Table "b": index "a" is also used by another table; exported as "a_2"',
    ]);
    const parsed = await parseSql(pg.text, 'postgres');
    expect(parsed.tables.map((t) => t.indexes.map((i) => i.name))).toEqual([['by_name'], ['BY_NAME_2', 'a_2']]);
    // SQLite also keeps tables and indexes in one namespace; it runs the DDL, so a clash would fail.
    const lite = await parseSqliteSql(toSql(schema, 'sqlite').text);
    expect(lite.warnings).toEqual([]);
    expect(lite.tables.map((t) => t.indexes.map((i) => i.name))).toEqual([['by_name'], ['BY_NAME_2', 'a_2']]);
    expect(parsed.tables[0]?.columns[0]?.dataType).toBe('text');
    // MySQL scopes index names to their table, so nothing is renamed.
    expect(toSql(schema, 'mysql').text).toContain('CREATE INDEX `BY_NAME` ON `b`');
  });

  // Through SQLite, which runs the DDL: the SQL importer doesn't read doubled quote characters.
  it('escapes quote characters in names', async () => {
    const t = table('say "hi"', [{ name: 'col "a"', primaryKey: true }]);
    const parsed = await parseSqliteSql(toSql(collectSchema([t], []), 'sqlite').text);
    expect(parsed.tables[0]).toMatchObject({ name: 'say "hi"', columns: [{ name: 'col "a"' }] });
    expect(toSql(collectSchema([{ ...t, name: 'it`s' }], []), 'mysql').text).toContain('CREATE TABLE `it``s`');
  });
});

describe('toDbml', () => {
  it('writes DBML that the importer reads back as the design', async () => {
    const posts = table('posts', [{ name: 'id', primaryKey: true }]);
    const extra = table('stats', [
      { name: 'ratio', dataType: 'double precision', nullable: true, default: '18' },
      { name: 'flag', dataType: 'boolean', default: 'true', note: "it's a flag" },
    ]);
    const schema = design();
    schema.tables.push(posts, extra);
    schema.manyToMany.push({ a: schema.tables[1] as TableNode, b: posts });
    const { text, warnings } = toDbml(schema, 'postgres');
    expect(warnings).toEqual([]);
    const parsed = await parseDbml(text);
    expect(parsed.warnings).toEqual([]);
    const [readItems, readUsers, , , stats] = parsed.tables;
    expect(readItems).toEqual({ ...orderItems, note: "One row per line\nof an 'order'" });
    expect(readUsers?.columns).toEqual([
      { name: 'id', dataType: 'integer', primaryKey: true, nullable: false, unique: false },
      { name: 'email', dataType: 'text', primaryKey: false, nullable: false, unique: true },
      { name: 'bio', dataType: 'text', primaryKey: false, nullable: true, unique: false, default: "'O''Brien'" },
      { name: 'created', dataType: 'timestamp', primaryKey: false, nullable: false, unique: false, default: 'now()' },
    ]);
    expect(readUsers?.indexes).toEqual([{ name: 'by_created', columns: ['created', 'email'], unique: true }]);
    expect(stats?.columns.map((c) => [c.dataType, c.default])).toEqual([
      ['double precision', '18'],
      ['boolean', 'true'],
    ]);
    expect(shape(parsed).relations).toEqual([
      { fromTable: 'Order Items', fromColumn: 'buyer', toTable: 'users', toColumn: 'id', declared: true },
      { fromTable: 'profile', fromColumn: 'user_id', toTable: 'users', toColumn: 'id', declared: true, cardinality: 'one-to-one' },
      { fromTable: 'users', fromColumn: 'id', toTable: 'posts', toColumn: 'id', declared: true, cardinality: 'many-to-many' },
    ]);
  });
});
