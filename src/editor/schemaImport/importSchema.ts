import { rotatedBounds, unionBoxes } from '../geometry';
import { DEFAULT_SIZE } from '../model/nodes';
import { tableHeight } from '../model/table';
import type { DesignNode } from '../model/types';
import { layoutSchema } from './layoutSchema';
import { schemaToNodes } from './toNodes';
import type { ImportedSchema, ImportWarning } from './types';

/** Gap in world px between existing content and the imported block (design choice). */
const IMPORT_GAP = 160;

/** What the preview shows and what Add to canvas dispatches. */
export interface ImportPlan {
  schema: ImportedSchema;
  /** Tables then connectors, ready for the `importNodes` action. */
  nodes: DesignNode[];
  /** Parse warnings first (they carry lines), then repair/rename warnings. */
  warnings: ImportWarning[];
}

export async function planImport(schema: ImportedSchema, existing: readonly DesignNode[]): Promise<ImportPlan> {
  const layout = await layoutSchema(
    schema.tables.map((t) => ({ name: t.name, width: DEFAULT_SIZE.table.width, height: tableHeight(t.columns.length) })),
    schema.relations,
  );
  // Hidden layers aren't on screen, so they shouldn't push the import away.
  const content = unionBoxes(existing.filter((n) => n.visible).map((n) => rotatedBounds(n, n.rotation)));
  const origin = content ? { x: content.x + content.width + IMPORT_GAP, y: content.y } : { x: 0, y: 0 };
  const built = schemaToNodes(schema, layout, origin, existing);
  return { schema, nodes: built.nodes, warnings: [...schema.warnings, ...built.warnings] };
}
