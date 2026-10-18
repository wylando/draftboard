import type { DesignNode, NodeType, Point } from './model/types';

const STORAGE_KEY = 'draftboard:document:v1';
const NODE_TYPES: ReadonlySet<NodeType> = new Set([
  'frame',
  'rect',
  'ellipse',
  'diamond',
  'sticky',
  'line',
  'arrow',
  'polygon',
  'star',
  'path',
  'image',
  'text',
  'group',
]);
/** Only raster data URLs: no remote images (offline), and no SVG documents. */
const IMAGE_SRC = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Fields the renderer reads for types that carry more than a box. */
function hasTypeFields(n: Record<string, unknown>): boolean {
  if (n.label !== undefined && typeof n.label !== 'string') return false;
  switch (n.type) {
    case 'polygon':
      return isFiniteNumber(n.sides);
    case 'star':
      return isFiniteNumber(n.points) && isFiniteNumber(n.innerRatio);
    case 'path':
      return (
        Array.isArray(n.path) &&
        n.path.every((p: unknown) => typeof p === 'object' && p !== null && isFiniteNumber((p as Point).x) && isFiniteNumber((p as Point).y))
      );
    case 'image':
      return typeof n.src === 'string' && IMAGE_SRC.test(n.src);
    default:
      return true;
  }
}

interface SavedDocument {
  version: 1;
  nodes: DesignNode[];
}

/** Minimal structural check: anything we load is user-editable data, not trusted input. */
function isNode(value: unknown): value is DesignNode {
  if (typeof value !== 'object' || value === null) return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n.id === 'string' &&
    typeof n.type === 'string' &&
    NODE_TYPES.has(n.type as NodeType) &&
    // Optional: documents saved before nesting have no parentId. normalizeTree repairs bad references.
    (n.parentId === undefined || n.parentId === null || typeof n.parentId === 'string') &&
    ['x', 'y', 'width', 'height'].every((k) => isFiniteNumber(n[k])) &&
    hasTypeFields(n)
  );
}

export function parseDocument(json: string): DesignNode[] | null {
  try {
    const data = JSON.parse(json) as Partial<SavedDocument>;
    if (data.version !== 1 || !Array.isArray(data.nodes)) return null;
    return data.nodes.every(isNode) ? data.nodes : null;
  } catch {
    return null;
  }
}

export function serializeDocument(nodes: DesignNode[]): string {
  const doc: SavedDocument = { version: 1, nodes };
  return JSON.stringify(doc, null, 2);
}

export function loadFromStorage(): DesignNode[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (parseDocument(raw) ?? []) : [];
  } catch {
    return [];
  }
}

/** False when storage is full or blocked (private mode); the in-memory document still works. */
export function saveToStorage(nodes: DesignNode[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, serializeDocument(nodes));
    return true;
  } catch {
    return false;
  }
}

export function downloadDocument(nodes: DesignNode[], filename = 'design.draftboard.json'): void {
  const blob = new Blob([serializeDocument(nodes)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
