import { describe, expect, it } from 'vitest';
import { mapDbmlType, mapSchemaTypes } from './mapTypes';
import type { ImportedSchema } from './types';

// [input, postgres, mysql, sqlite]
const rows: [string, string, string, string][] = [
  ['int', 'integer', 'int', 'integer'],
  ['INTEGER', 'integer', 'int', 'integer'],
  ['bigint', 'bigint', 'bigint', 'integer'],
  ['smallint', 'smallint', 'smallint', 'integer'],
  ['serial', 'serial', 'int', 'integer'],
  ['bigserial', 'bigserial', 'bigint', 'integer'],
  ['varchar', 'varchar', 'varchar(255)', 'text'],
  ['varchar(100)', 'varchar(100)', 'varchar(100)', 'text'],
  ['VarChar(100)', 'varchar(100)', 'varchar(100)', 'text'],
  ['string', 'varchar', 'varchar(255)', 'text'],
  ['text', 'text', 'text', 'text'],
  ['char(8)', 'char(8)', 'char(8)', 'text'],
  ['char', 'char', 'char', 'text'],
  ['bool', 'boolean', 'boolean', 'integer'],
  ['boolean', 'boolean', 'boolean', 'integer'],
  ['float', 'double precision', 'float', 'real'],
  ['double', 'double precision', 'double', 'real'],
  ['double precision', 'double precision', 'double', 'real'],
  ['real', 'real', 'double', 'real'],
  ['decimal(10,2)', 'numeric(10,2)', 'decimal(10,2)', 'numeric'],
  ['numeric(12, 4)', 'numeric(12, 4)', 'decimal(12, 4)', 'numeric'],
  ['decimal', 'numeric', 'decimal', 'numeric'],
  ['date', 'date', 'date', 'text'],
  ['time', 'time', 'time', 'text'],
  ['datetime', 'timestamp', 'datetime', 'text'],
  ['datetime(3)', 'timestamp(3)', 'datetime(3)', 'text'],
  ['timestamp', 'timestamp', 'timestamp', 'text'],
  ['timestamptz', 'timestamptz', 'timestamp', 'text'],
  ['json', 'json', 'json', 'text'],
  ['jsonb', 'jsonb', 'json', 'text'],
  ['uuid', 'uuid', 'char(36)', 'text'],
  ['blob', 'bytea', 'blob', 'blob'],
  ['bytea', 'bytea', 'blob', 'blob'],
  ['binary(16)', 'bytea', 'binary(16)', 'blob'],
  ['tinyint', 'smallint', 'tinyint', 'integer'],
  ['tinyint(1)', 'smallint', 'tinyint(1)', 'integer'],
  ['mediumint', 'integer', 'mediumint', 'integer'],
  ['year', 'smallint', 'year', 'integer'],
  ['int unsigned', 'integer', 'int unsigned', 'integer'],
  ['BIGINT UNSIGNED', 'bigint', 'bigint unsigned', 'integer'],
  ['int(10) unsigned', 'integer', 'int(10) unsigned', 'integer'],
  ['decimal(10,2) unsigned', 'numeric(10,2)', 'decimal(10,2) unsigned', 'numeric'],
  ['float(10)', 'real', 'float(10)', 'real'],
  ['float(24)', 'real', 'float(24)', 'real'],
  ['float(25)', 'double precision', 'float(25)', 'real'],
  ['integer[]', 'integer[]', 'integer[]', 'integer[]'],
  ['text[]', 'text[]', 'text[]', 'text[]'],
];

const cases = rows.flatMap(([input, pg, my, lite]) => [
  { input, dialect: 'postgres' as const, expected: pg },
  { input, dialect: 'mysql' as const, expected: my },
  { input, dialect: 'sqlite' as const, expected: lite },
]);

describe('mapDbmlType', () => {
  it.each(cases)('$input -> $dialect: $expected', ({ input, dialect, expected }) => {
    expect(mapDbmlType(input, dialect)).toBe(expected);
  });

  it.each(['order_status', 'geometry(Point,4326)', 'int zerofill', 'Money', ''])(
    'leaves %j as written (enum, custom or unrecognized)',
    (type) => {
      for (const d of ['postgres', 'mysql', 'sqlite'] as const) expect(mapDbmlType(type, d)).toBe(type);
    },
  );
});

describe('mapSchemaTypes', () => {
  const schema: ImportedSchema = {
    format: 'dbml',
    tables: [
      {
        name: 'users',
        columns: [
          { name: 'id', dataType: 'int', primaryKey: true, nullable: false, unique: false },
          { name: 'status', dataType: 'order_status', primaryKey: false, nullable: true, unique: false, default: "'new'" },
        ],
        indexes: [{ name: '', columns: ['id'], unique: false }],
      },
    ],
    relations: [{ fromTable: 'a', fromColumn: 'b', toTable: 'users', toColumn: 'id', declared: true }],
    warnings: [{ message: 'w' }],
  };

  it('maps every column and leaves the rest of the schema and the input untouched', () => {
    const mapped = mapSchemaTypes(schema, 'mysql');
    expect(mapped.tables[0]?.columns.map((c) => c.dataType)).toEqual(['int', 'order_status']);
    expect(mapped.tables[0]?.columns[1]).toEqual({ ...schema.tables[0]?.columns[1], dataType: 'order_status' });
    expect(mapped.relations).toEqual(schema.relations);
    expect(mapped.warnings).toEqual(schema.warnings);
    expect(mapped.tables[0]?.indexes).toEqual(schema.tables[0]?.indexes);
    expect(mapped).not.toBe(schema);
  });

  it('uses the dialect for the mapping without mutating the input', () => {
    const mapped = mapSchemaTypes(schema, 'postgres');
    expect(mapped.tables[0]?.columns[0]?.dataType).toBe('integer');
    expect(schema.tables[0]?.columns[0]?.dataType).toBe('int');
  });
});
