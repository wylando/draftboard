import { describe, expect, it } from 'vitest';
import { createNode } from '../model/nodes';
import { tableHeight } from '../model/table';
import type { ConnectorNode, DesignNode, TableNode } from '../model/types';
import type { ImportedColumn, ImportedRelation, ImportedTable } from './types';
import { schemaToNodes } from './toNodes';

const col = (name: string, over: Partial<ImportedColumn> = {}): ImportedColumn => ({
  name,
  dataType: 'text',
  primaryKey: false,
  nullable: false,
  unique: false,
  ...over,
});
const table = (name: string, columns: ImportedColumn[], over: Partial<ImportedTable> = {}): ImportedTable => ({
  name,
  columns,
  indexes: [],
  ...over,
});
const run = (tables: ImportedTable[], existing: DesignNode[] = [], relations: ImportedRelation[] = []) =>
  schemaToNodes({ format: 'postgres', tables, relations, warnings: [] }, new Map(tables.map((t, i) => [t.name, { x: i * 300, y: 20 }])), { x: 1000, y: 500 }, existing);
const rel = (fromTable: string, fromColumn: string, toTable: string, toColumn: string, declared = true): ImportedRelation => ({ fromTable, fromColumn, toTable, toColumn, declared });
const connectors = (nodes: DesignNode[]) => nodes.filter((n): n is ConnectorNode => n.type === 'connector');
const tables = (nodes: DesignNode[]) => nodes as TableNode[];

describe('schemaToNodes', () => {
  it('makes a table node with columns, flags, default, note and the laid-out position', () => {
    const { nodes, warnings } = run([
      table(
        'users',
        [col('id', { dataType: 'uuid', primaryKey: true }), col('email', { dataType: 'varchar(255)', unique: true, nullable: true, default: "''" })],
        { note: 'Accounts' },
      ),
    ]);
    const [t] = tables(nodes);
    expect(warnings).toEqual([]);
    expect(t).toMatchObject({ type: 'table', name: 'users', x: 1000, y: 520, width: 240, height: tableHeight(2), note: 'Accounts' });
    expect(t?.columns.map((c) => ({ ...c, id: undefined }))).toEqual([
      { name: 'id', dataType: 'uuid', primaryKey: true, nullable: false, unique: false },
      { name: 'email', dataType: 'varchar(255)', primaryKey: false, nullable: true, unique: true, default: "''" },
    ]);
  });

  it('renames a table clashing with an existing layer of another case, with a warning', () => {
    const existing = [{ ...createNode('rect', { x: 0, y: 0, width: 1, height: 1 }, []), name: 'Users' }];
    const { nodes, warnings } = run([table('users', [col('id')])], existing);
    expect(tables(nodes)[0]?.name).toBe('users 2');
    expect(warnings).toEqual([{ message: '"users" already exists; imported as "users 2"' }]);
  });

  it('names a table with an empty name "table" and warns', () => {
    const { nodes, warnings } = run([table('  ', [col('id')])]);
    expect(tables(nodes)[0]?.name).toBe('table');
    expect(warnings).toEqual([{ message: 'A table has no name; imported as "table"' }]);
  });

  it('renames a duplicate column around every real source name, so an index keeps its own column', () => {
    const { nodes, warnings } = run([
      table('t', [col('id'), col('ID'), col('id_2')], { indexes: [{ name: 'ix', columns: ['id_2'], unique: false }] }),
    ]);
    const t = tables(nodes)[0];
    expect(t?.columns.map((c) => c.name)).toEqual(['id', 'ID_3', 'id_2']);
    expect(t?.indexes[0]?.columnIds).toEqual([t?.columns[2]?.id]);
    expect(warnings).toEqual([{ message: 'Table "t": column "ID" is repeated; imported as "ID_3"' }]);
  });

  it('forces a nullable primary key non-nullable and warns', () => {
    const { nodes, warnings } = run([table('t', [col('id', { primaryKey: true, nullable: true })])]);
    expect(tables(nodes)[0]?.columns[0]?.nullable).toBe(false);
    expect(warnings).toEqual([{ message: 'Table "t": primary key "id" can\'t be nullable; imported as NOT NULL' }]);
  });

  it('gives an empty column name the next column_n and warns', () => {
    const { nodes, warnings } = run([table('t', [col('column_1'), col('')])]);
    expect(tables(nodes)[0]?.columns.map((c) => c.name)).toEqual(['column_1', 'column_2']);
    expect(warnings).toEqual([{ message: 'Table "t": a column has no name; imported as "column_2"' }]);
  });

  it('maps index columns, trimmed and ignoring case, to ids', () => {
    const { nodes, warnings } = run([
      table('t', [col('a'), col('b')], { indexes: [{ name: 'ix', columns: [' A ', 'b'], unique: true }] }),
    ]);
    const t = tables(nodes)[0];
    expect(warnings).toEqual([]);
    expect(t?.indexes).toEqual([{ id: expect.any(String), name: 'ix', columnIds: t?.columns.map((c) => c.id), unique: true }]);
  });

  it('names an unnamed index from SQL identifiers of the final table and column names', () => {
    const existing = [{ ...createNode('rect', { x: 0, y: 0, width: 1, height: 1 }, []), name: 'Users' }];
    const { nodes } = run([table('Users', [col('Full Name')], { indexes: [{ name: ' ', columns: ['Full Name'], unique: false }] })], existing);
    expect(tables(nodes)[0]?.indexes[0]?.name).toBe('users_2_full_name_idx');
  });

  it('drops an index naming an unknown column, with a warning', () => {
    const { nodes, warnings } = run([table('t', [col('a')], { indexes: [{ name: 'ix', columns: ['a', 'zzz'], unique: false }] })]);
    expect(tables(nodes)[0]?.indexes).toEqual([]);
    expect(warnings).toEqual([{ message: 'Table "t": index ix names unknown column "zzz"; skipped' }]);
  });

  it('drops an unnamed index that repeats a column, labelled (unnamed)', () => {
    const { nodes, warnings } = run([table('t', [col('a')], { indexes: [{ name: ' ', columns: ['a', 'A'], unique: false }] })]);
    expect(tables(nodes)[0]?.indexes).toEqual([]);
    expect(warnings).toEqual([{ message: 'Table "t": index (unnamed) repeats a column; skipped' }]);
  });

  describe('relations', () => {
    const users = table('users', [col('id', { primaryKey: true }), col('parent_id')]);
    const orders = table('orders', [col('id', { primaryKey: true }), col('user_id')]);

    it('links a declared relation between the column anchors as a foreign key, after all tables', () => {
      const { nodes, warnings } = run([orders, users], [], [rel('orders', 'user_id', 'users', 'id')]);
      const [o, u] = tables(nodes);
      expect(nodes.map((n) => n.type)).toEqual(['table', 'table', 'connector']);
      expect(connectors(nodes)[0]).toMatchObject({
        name: 'Connector 1',
        from: { kind: 'column', tableId: o?.id, columnId: o?.columns[1]?.id },
        to: { kind: 'column', tableId: u?.id, columnId: u?.columns[0]?.id },
        fromCardinality: 'many',
        toCardinality: 'one',
        isForeignKey: true,
      });
      expect(warnings).toEqual([]);
    });

    it('does not mark an inferred relation as a foreign key', () => {
      const { nodes } = run([orders, users], [], [rel('orders', 'user_id', 'users', 'id', false)]);
      expect(connectors(nodes)[0]?.isForeignKey).toBe(false);
    });

    it('resolves tables and columns by their source names ignoring case, even when the layer was renamed', () => {
      const existing = [{ ...createNode('rect', { x: 0, y: 0, width: 1, height: 1 }, []), name: 'Users' }];
      const { nodes } = run([orders, users], existing, [rel('ORDERS', 'USER_ID', 'Users', 'ID')]);
      expect(tables(nodes)[1]?.name).toBe('users 2');
      expect(connectors(nodes)[0]?.to).toMatchObject({ tableId: tables(nodes)[1]?.id });
    });

    it('names connectors like the Connector tool, unique against existing layers', () => {
      const existing = [{ ...createNode('rect', { x: 0, y: 0, width: 1, height: 1 }, []), name: 'Connector 1' }];
      const { nodes } = run([orders, users], existing, [rel('orders', 'user_id', 'users', 'id'), rel('users', 'parent_id', 'users', 'id')]);
      expect(connectors(nodes).map((c) => c.name)).toEqual(['Connector 2', 'Connector 3']);
    });

    it('skips a relation naming a missing column, with a warning', () => {
      const { nodes, warnings } = run([orders, users], [], [rel('orders', 'user_id', 'users', 'nope')]);
      expect(connectors(nodes)).toEqual([]);
      expect(warnings).toEqual([{ message: 'Relationship orders.user_id → users.nope points at a missing table or column; skipped' }]);
    });

    it('skips a relation linking a column to itself, with a warning', () => {
      const { nodes, warnings } = run([users], [], [rel('users', 'id', 'USERS', 'ID')]);
      expect(connectors(nodes)).toEqual([]);
      expect(warnings).toEqual([{ message: 'Relationship users.id → USERS.ID links a column to itself; skipped' }]);
    });

    it('draws one connector for the same declared relation arriving twice', () => {
      const { nodes, warnings } = run([orders, users], [], [rel('orders', 'user_id', 'users', 'id'), rel('ORDERS', 'user_id', 'users', 'id')]);
      expect(connectors(nodes)).toHaveLength(1);
      expect(warnings).toEqual([]);
    });

    it('lets a declared relation win over an inferred one for the same columns', () => {
      const { nodes } = run([orders, users], [], [rel('orders', 'user_id', 'users', 'id', false), rel('orders', 'user_id', 'users', 'id')]);
      expect(connectors(nodes).map((c) => c.isForeignKey)).toEqual([true]);
    });

    it('links two different columns of one table', () => {
      const { nodes, warnings } = run([users], [], [rel('users', 'parent_id', 'users', 'id')]);
      expect(connectors(nodes)).toHaveLength(1);
      expect(warnings).toEqual([]);
    });
  });
});
