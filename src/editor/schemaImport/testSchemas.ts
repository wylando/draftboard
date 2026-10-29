import type { ImportedColumn } from './types';

/** A nullable, plain column; `over` sets the fields a test is about. */
export const importedColumn = (name: string, dataType: string, over: Partial<ImportedColumn> = {}): ImportedColumn => ({
  name,
  dataType,
  primaryKey: false,
  nullable: true,
  unique: false,
  ...over,
});
