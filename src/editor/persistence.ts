import { repairConnectorData } from './model/connector';
import { repairTableData } from './model/table';
import type { DesignNode, NodeType } from './model/types';

const STORAGE_KEY = 'draftboard:document:v1';
const NODE_TYPES: ReadonlySet<NodeType> = new Set(['frame', 'rect', 'ellipse', 'line', 'text', 'group', 'table', 'connector']);

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
    // A connector's box is derived from its route, so a missing one is repaired, not refused.
    (n.type === 'connector' || ['x', 'y', 'width', 'height'].every((k) => typeof n[k] === 'number' && Number.isFinite(n[k])))
  );
}

export function parseDocument(json: string): DesignNode[] | null {
  try {
    const data = JSON.parse(json) as Partial<SavedDocument>;
    if (data.version !== 1 || !Array.isArray(data.nodes)) return null;
    if (!data.nodes.every(isNode)) return null;
    // A damaged table or connector is repaired rather than refused, so it never costs the rest of the document.
    return data.nodes.map((n) => {
      const raw = n as unknown as Record<string, unknown>;
      if (n.type === 'table') return { ...n, ...repairTableData(raw) };
      if (n.type === 'connector') return { ...n, ...repairConnectorData(raw) };
      return n;
    });
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

export function saveToStorage(nodes: DesignNode[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeDocument(nodes));
  } catch {
    // Storage full or blocked (private mode); the in-memory document still works.
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
