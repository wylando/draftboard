import { describe, expect, it } from 'vitest';
import { repairTableData } from './table';

const column = { primaryKey: false, nullable: false, unique: false, dataType: 'text' };

describe('repairTableData', () => {
  it('renames a column whose name repeats another ignoring case, keeping the first', () => {
    const { columns } = repairTableData({ columns: [{ ...column, id: 'a', name: 'email' }, { ...column, id: 'b', name: 'Email' }] });
    expect(columns.map((c) => c.name)).toEqual(['email', 'Email_2']);
  });

  it('drops index columns that no longer exist', () => {
    const { indexes } = repairTableData({
      columns: [{ ...column, id: 'a', name: 'email' }],
      indexes: [{ id: 'i', name: 'users_idx', columnIds: ['a', 'gone'], unique: false }],
    });
    expect(indexes[0]!.columnIds).toEqual(['a']);
  });
});
