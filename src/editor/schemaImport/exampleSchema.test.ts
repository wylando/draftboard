import { describe, expect, it } from 'vitest';
import { EXAMPLE_SCHEMA } from './exampleSchema';
import { planImport } from './importSchema';

describe('EXAMPLE_SCHEMA', () => {
  it('plans four tables joined by three foreign keys with no warnings', async () => {
    const plan = await planImport(EXAMPLE_SCHEMA, []);
    expect(plan.warnings).toEqual([]);
    expect(plan.nodes.filter((n) => n.type === 'table')).toHaveLength(4);
    const links = plan.nodes.filter((n) => n.type === 'connector');
    expect(links).toHaveLength(3);
    expect(links.every((c) => c.type === 'connector' && c.isForeignKey)).toBe(true);
  });
});
