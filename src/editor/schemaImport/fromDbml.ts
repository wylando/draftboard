import type { Column, Database, Index, Ref, RefEndpoint, Table } from '@dbml/parse';
import type { ImportedColumn, ImportedIndex, ImportedRelation, ImportedSchema, ImportedTable, ImportWarning } from './types';

// Design choice, mirroring the SQL importers: the default schema keeps the bare name.
const qualified = (schemaName: string | null, name: string) =>
  schemaName && schemaName.toLowerCase() !== 'public' ? `${schemaName}.${name}` : name;

function defaultText(d: NonNullable<Column['dbdefault']>): string {
  return d.type === 'string' ? `'${String(d.value).replaceAll("'", "''")}'` : String(d.value);
}

function readIndexes(table: Table, warnings: ImportWarning[]): { indexes: ImportedIndex[]; pkColumns: Set<string> } {
  const indexes: ImportedIndex[] = [];
  const pkColumns = new Set<string>();
  for (const index of table.indexes as Index[]) {
    if (index.columns.some((c) => c.type !== 'column')) {
      const named = index.name ? `index "${index.name}"` : 'an index';
      warnings.push({ message: `Skipped ${named} on table "${qualified(table.schemaName, table.name)}" (it uses an expression)` });
      continue;
    }
    const columns = index.columns.map((c) => c.value);
    if (index.pk) columns.forEach((c) => pkColumns.add(c));
    else indexes.push({ name: index.name ?? '', columns, unique: !!index.unique });
  }
  return { indexes, pkColumns };
}

function readTable(table: Table, warnings: ImportWarning[]): ImportedTable {
  const { indexes, pkColumns } = readIndexes(table, warnings);
  const columns = table.fields.map((f): ImportedColumn => {
    const primaryKey = !!f.pk || pkColumns.has(f.name);
    const column: ImportedColumn = {
      name: f.name,
      dataType: f.type.type_name,
      primaryKey,
      nullable: !f.not_null && !primaryKey,
      unique: !!f.unique,
    };
    if (f.dbdefault) column.default = defaultText(f.dbdefault);
    return column;
  });
  const imported: ImportedTable = { name: qualified(table.schemaName, table.name), columns, indexes };
  if (table.note) imported.note = table.note.value;
  return imported;
}

const CARDINALITY = /^(\d+|\*|\d+\.\.(\d+|\*))$/;
const isMany = (c: string) => c === '*' || c.endsWith('..*');

function readRefs(db: Database, warnings: ImportWarning[]): ImportedRelation[] {
  // Inline refs list the referenced side first, so the column that declared one is the only way to tell which end is "from".
  const inlineOwners = new Set<string>();
  for (const t of db.tables) for (const f of t.fields) if (f.inline_refs.length) inlineOwners.add(`${qualified(t.schemaName, t.name)}.${f.name}`);
  const keyColumns = new Set<string>();
  for (const t of db.tables) for (const f of t.fields) if (f.pk || f.unique) keyColumns.add(`${qualified(t.schemaName, t.name)}.${f.name}`);
  const isKey = (e: RefEndpoint) => e.fieldNames.length === 1 && keyColumns.has(`${qualified(e.schemaName, e.tableName)}.${e.fieldNames[0]}`);
  const owns = (e: RefEndpoint) => e.fieldNames.length === 1 && inlineOwners.has(`${qualified(e.schemaName, e.tableName)}.${e.fieldNames[0]}`);

  const relations: ImportedRelation[] = [];
  const seen = new Set<string>();
  for (const ref of db.refs as Ref[]) {
    const [a, b] = ref.endpoints;
    if (!CARDINALITY.test(a.relation) || !CARDINALITY.test(b.relation)) {
      warnings.push({ message: `Unsupported relationship "${a.relation}" to "${b.relation}"; skipped` });
      continue;
    }
    let from = a;
    let to = b;
    let cardinality: ImportedRelation['cardinality'];
    if (isMany(a.relation) !== isMany(b.relation)) {
      if (!isMany(a.relation)) [from, to] = [b, a];
    } else {
      cardinality = isMany(a.relation) ? 'many-to-many' : 'one-to-one';
      // The foreign key belongs on the end that isn't the key, whichever way round the ref was written.
      const swap = owns(a) !== owns(b) ? owns(b) : cardinality === 'one-to-one' && isKey(a) && !isKey(b);
      if (swap) [from, to] = [b, a];
    }
    from.fieldNames.forEach((fromColumn, i) => {
      const relation: ImportedRelation = {
        fromTable: qualified(from.schemaName, from.tableName),
        fromColumn,
        toTable: qualified(to.schemaName, to.tableName),
        toColumn: to.fieldNames[i] ?? '',
        declared: true,
      };
      if (cardinality) relation.cardinality = cardinality;
      const key = JSON.stringify(relation);
      if (seen.has(key)) return;
      seen.add(key);
      relations.push(relation);
    });
  }
  return relations;
}

export async function parseDbml(source: string): Promise<ImportedSchema> {
  // Lazy: the compiler is large and only needed once someone imports DBML.
  const { Compiler, MemoryProjectLayout, Filepath } = await import('@dbml/parse');
  const entry = Filepath.from('/main.dbml');
  const report = new Compiler(new MemoryProjectLayout({ '/main.dbml': source })).interpretFile(entry);
  const db = report.getValue();
  const errors = report.getErrors();

  // All-or-nothing by user decision: the compiler yields no partial model once anything fails.
  if (errors.length > 0 || !db) {
    const warnings = errors.map((e): ImportWarning => {
      const pos = (e.nodeOrToken as { startPos?: { line: number; column: number } }).startPos;
      return pos ? { line: pos.line + 1, message: `${e.diagnostic} (column ${pos.column + 1})` } : { message: e.diagnostic };
    });
    return { format: 'dbml', tables: [], relations: [], warnings };
  }

  const warnings: ImportWarning[] = [];
  const tables = db.tables.map((t) => readTable(t, warnings));
  const relations = readRefs(db, warnings);
  if (db.enums.length > 0) warnings.push({ message: 'Skipped enum types; their columns keep the enum name as the type' });
  if (db.records.length > 0) warnings.push({ message: 'Skipped records' });
  return { format: 'dbml', tables, relations, warnings };
}
