import { typesCompatible } from '../model/connector';
import { nameKey } from '../model/names';
import type { ImportedRelation, ImportedSchema } from './types';

const splitSchema = (name: string) => {
  const dot = name.lastIndexOf('.');
  return { schema: dot < 0 || nameKey(name.slice(0, dot)) === 'public' ? '' : nameKey(name.slice(0, dot)), base: nameKey(name.slice(dot + 1)) };
};

/**
 * The key's stem: "user" for user_id, userId and userID. The all-caps form needs a lowercase or digit before it,
 * so UUID, PAID and VALID aren't read as keys; a one-letter stem is too weak to trust.
 */
function stem(column: string): string | null {
  const x = (/^(.+)_id$/i.exec(column) ?? /^(.*[a-z0-9])(?:Id|ID)$/.exec(column))?.[1];
  return x && x.length >= 2 ? x : null;
}

// Plain English plurals only; irregular ones (person/people) simply go unguessed.
const forms = (x: string) => [x, `${x}s`, `${x}es`, ...(x.endsWith('y') ? [`${x.slice(0, -1)}ies`] : [])];

/** Relationships guessed from column names, for columns no declared relation covers. */
export function inferRelations(schema: ImportedSchema): ImportedRelation[] {
  const end = (table: string, column: string) => `${nameKey(table)}\0${nameKey(column)}`;
  // A declared relation covers both of its columns, whichever way it points.
  const covered = new Set(
    schema.relations.flatMap((r) => [
      `${end(r.fromTable, r.fromColumn)}\0${end(r.toTable, r.toColumn)}`,
      `${end(r.toTable, r.toColumn)}\0${end(r.fromTable, r.fromColumn)}`,
    ]),
  );
  const declaredFrom = new Set(schema.relations.map((r) => end(r.fromTable, r.fromColumn)));

  // A table with no single-column primary key has nothing to point at, so it is never a target.
  const targets = schema.tables.flatMap((table) => {
    const keys = table.columns.filter((c) => c.primaryKey);
    const [only] = keys;
    return only && keys.length === 1 ? [{ table, key: only.name, ...splitSchema(table.name) }] : [];
  });

  const found: ImportedRelation[] = [];
  for (const from of schema.tables) {
    const own = splitSchema(from.name);
    const soleKey = from.columns.filter((c) => c.primaryKey);
    for (const column of from.columns) {
      const x = stem(column.name);
      if (!x || declaredFrom.has(end(from.name, column.name))) continue;
      // A lone primary key named user_id in users identifies the row; it doesn't reference another.
      if (column.primaryKey && soleKey.length === 1) continue;

      for (const name of forms(x).map(nameKey)) {
        const matches = targets.filter((t) => t.base === name);
        if (matches.length === 0) continue;
        // Bare names are the public schema, so a bare table prefers a bare target.
        const sameSchema = matches.filter((t) => t.schema === own.schema);
        const pool = sameSchema.length > 0 ? sameSchema : matches;
        // Two candidates is a coin toss, and a wrong suggestion costs more than a missing one.
        const [best] = pool;
        if (pool.length !== 1 || !best) break;
        // A column naming its own table duplicates that table's key; it isn't a parent link.
        const key = from === best.table ? undefined : best.table.columns.find((c) => c.name === best.key);
        const differs = key && !typesCompatible(key.dataType, column.dataType);
        if (key && !differs && !covered.has(`${end(from.name, column.name)}\0${end(best.table.name, key.name)}`)) {
          found.push({ fromTable: from.name, fromColumn: column.name, toTable: best.table.name, toColumn: key.name, declared: false });
        }
        break;
      }
    }
  }
  return found;
}
