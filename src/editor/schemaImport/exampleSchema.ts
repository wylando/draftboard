import type { ImportedColumn, ImportedSchema } from './types';

const col = (name: string, dataType: string, over: Partial<ImportedColumn> = {}): ImportedColumn => ({
  name,
  dataType,
  primaryKey: false,
  nullable: false,
  unique: false,
  ...over,
});
const id = () => col('id', 'integer', { primaryKey: true });
const fk = (fromTable: string, fromColumn: string, toTable: string) => ({
  fromTable,
  fromColumn,
  toTable,
  toColumn: 'id',
  declared: true,
});

/** A small shop schema for "Try an example": four tables, three foreign keys. */
export const EXAMPLE_SCHEMA: ImportedSchema = {
  format: 'postgres',
  tables: [
    { name: 'customers', columns: [id(), col('email', 'text', { unique: true }), col('name', 'text')], indexes: [] },
    { name: 'orders', columns: [id(), col('customer_id', 'integer'), col('placed_at', 'timestamp')], indexes: [] },
    { name: 'order_items', columns: [id(), col('order_id', 'integer'), col('product_id', 'integer'), col('quantity', 'integer')], indexes: [] },
    { name: 'products', columns: [id(), col('title', 'text'), col('price', 'numeric')], indexes: [] },
  ],
  relations: [fk('orders', 'customer_id', 'customers'), fk('order_items', 'order_id', 'orders'), fk('order_items', 'product_id', 'products')],
  warnings: [],
};
