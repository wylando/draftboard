import { describe, expect, it } from 'vitest';
import { createNode } from '../model/nodes';
import type { ConnectorNode, DesignNode, TableNode } from '../model/types';
import type { ImportedSchema, ImportedTable } from './types';
import { planImport } from './importSchema';

const table = (name: string): ImportedTable => ({
  name,
  columns: [{ name: 'id', dataType: 'int', primaryKey: true, nullable: false, unique: false }],
  indexes: [],
});
const schema = (over: Partial<ImportedSchema> = {}): ImportedSchema => ({
  format: 'postgres',
  tables: [table('users'), table('posts')],
  relations: [],
  warnings: [],
  ...over,
});
const tablesOf = (nodes: DesignNode[]) => nodes.filter((n): n is TableNode => n.type === 'table');

describe('planImport', () => {
  it('starts at the origin on an empty canvas', async () => {
    const plan = await planImport(schema(), []);
    const ts = tablesOf(plan.nodes);
    expect(Math.min(...ts.map((t) => t.x))).toBe(0);
    expect(Math.min(...ts.map((t) => t.y))).toBe(0);
  });

  it('places the block right of existing content, top-aligned with it', async () => {
    const rect = createNode('rect', { x: 100, y: 50, width: 200, height: 100 }, []);
    const plan = await planImport(schema(), [rect]);
    const ts = tablesOf(plan.nodes);
    expect(Math.min(...ts.map((t) => t.x))).toBeGreaterThanOrEqual(300 + 160);
    expect(Math.min(...ts.map((t) => t.y))).toBe(50);
  });

  it('lists parse warnings before rename warnings', async () => {
    const rect = createNode('rect', { x: 0, y: 0, width: 10, height: 10 }, []);
    const clash = { ...rect, name: 'users' };
    const plan = await planImport(schema({ warnings: [{ line: 3, message: 'parse' }] }), [clash]);
    expect(plan.warnings.map((w) => w.message)).toEqual(['parse', '"users" already exists; imported as "users 2"']);
  });

  it('puts connectors after the tables', async () => {
    const plan = await planImport(
      schema({ relations: [{ fromTable: 'posts', fromColumn: 'id', toTable: 'users', toColumn: 'id', declared: true }] }),
      [],
    );
    expect(plan.nodes.map((n) => n.type)).toEqual(['table', 'table', 'connector']);
    expect((plan.nodes[2] as ConnectorNode).type).toBe('connector');
  });
});
