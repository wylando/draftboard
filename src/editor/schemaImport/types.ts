import type { Point } from '../model/types';

/**
 * The format-agnostic schema every parser produces and everything downstream
 * consumes, so a new format is one adapter. Tables and columns are referred to
 * by name as written in the source; ids are minted only when nodes are made.
 */
export type SchemaFormat = 'postgres' | 'mysql' | 'sqlite' | 'sqlite-db';

export interface ImportedColumn {
  name: string;
  /** As written in the source, including any length or precision: "varchar(255)". */
  dataType: string;
  primaryKey: boolean;
  nullable: boolean;
  unique: boolean;
  /** The default expression as written: "now()", "'draft'", "0". */
  default?: string;
}

export interface ImportedIndex {
  /** Empty when the source left it unnamed. */
  name: string;
  /** In index order. */
  columns: string[];
  unique: boolean;
}

export interface ImportedTable {
  name: string;
  columns: ImportedColumn[];
  indexes: ImportedIndex[];
  note?: string;
}

/** `fromTable.fromColumn` references `toTable.toColumn`; a composite key is one relation per column pair. */
export interface ImportedRelation {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  /** false: guessed from column names, so the preview offers it unticked. */
  declared: boolean;
}

export interface ImportWarning {
  /** 1-based, when the source position is known. */
  line?: number;
  message: string;
}

export interface ImportedSchema {
  format: SchemaFormat;
  /**
   * Names unique ignoring case, since layout is keyed by name: a parser keeps the first of a repeated table and
   * warns. A PostgreSQL table outside `public` is named `schema.table` so same-named tables in two schemas both fit.
   */
  tables: ImportedTable[];
  relations: ImportedRelation[];
  warnings: ImportWarning[];
}

/** Top-left of each table by name, in world px relative to the imported block's own origin. */
export type SchemaLayout = Map<string, Point>;
