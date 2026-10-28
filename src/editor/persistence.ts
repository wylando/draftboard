import { repairConnectorData } from './model/connector';
import { repairTableData } from './model/table';
import type { DesignNode, NodeType } from './model/types';
import type { WorkspaceState } from './model/workspace';

const LEGACY_KEY = 'draftboard:document:v1';
const WORKSPACE_KEY = 'draftboard:workspace:v1';
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

/** Null unless every node passes `isNode`. A damaged table or connector is repaired rather than refused, so it never costs the rest of the document. */
function validNodes(nodes: unknown): DesignNode[] | null {
  if (!Array.isArray(nodes) || !nodes.every(isNode)) return null;
  return nodes.map((n) => {
    const raw = n as unknown as Record<string, unknown>;
    if (n.type === 'table') return { ...n, ...repairTableData(raw) };
    if (n.type === 'connector') return { ...n, ...repairConnectorData(raw) };
    return n;
  });
}

export function parseDocument(json: string): DesignNode[] | null {
  try {
    const data = JSON.parse(json) as Partial<SavedDocument>;
    return data.version === 1 ? validNodes(data.nodes) : null;
  } catch {
    return null;
  }
}

export interface SavedBoard {
  id: string;
  name: string;
  nodes: DesignNode[];
}

interface SavedWorkspace {
  version: 1;
  activeId: string;
  boards: SavedBoard[];
}

/** A board that fails validation is dropped, not the whole workspace; null when none survives. */
export function parseWorkspace(json: string): { boards: SavedBoard[]; activeId: string | undefined } | null {
  try {
    const data = JSON.parse(json) as Partial<SavedWorkspace>;
    if (data.version !== 1 || !Array.isArray(data.boards)) return null;
    const boards: SavedBoard[] = [];
    for (const b of data.boards as Partial<SavedBoard>[]) {
      if (typeof b !== 'object' || b === null || typeof b.id !== 'string' || boards.some((x) => x.id === b.id)) continue;
      const nodes = validNodes(b.nodes);
      if (nodes) boards.push({ id: b.id, name: typeof b.name === 'string' ? b.name : '', nodes });
    }
    if (boards.length === 0) return null;
    return { boards, activeId: typeof data.activeId === 'string' ? data.activeId : undefined };
  } catch {
    return null;
  }
}

export function serializeWorkspace(state: WorkspaceState): string {
  const doc: SavedWorkspace = {
    version: 1,
    activeId: state.activeId,
    boards: state.boards.map((b) => ({ id: b.id, name: b.name, nodes: b.editor.nodes })),
  };
  return JSON.stringify(doc);
}

/**
 * The saved workspace, else the pre-boards single document as "Board 1". The legacy key is only
 * read: it stays as a fallback should the workspace key ever be lost or corrupted.
 */
export function workspaceFromStorage(
  workspaceRaw: string | null,
  legacyRaw: string | null,
): { boards: SavedBoard[]; activeId: string | undefined } {
  const saved = workspaceRaw ? parseWorkspace(workspaceRaw) : null;
  if (saved) return saved;
  const legacy = legacyRaw ? parseDocument(legacyRaw) : null;
  return legacy ? { boards: [{ id: 'board-1', name: 'Board 1', nodes: legacy }], activeId: undefined } : { boards: [], activeId: undefined };
}

export function loadWorkspace(): { boards: SavedBoard[]; activeId: string | undefined } {
  try {
    return workspaceFromStorage(localStorage.getItem(WORKSPACE_KEY), localStorage.getItem(LEGACY_KEY));
  } catch {
    return { boards: [], activeId: undefined };
  }
}

export function saveWorkspace(state: WorkspaceState): void {
  try {
    localStorage.setItem(WORKSPACE_KEY, serializeWorkspace(state));
  } catch {
    // Storage full or blocked (private mode); the in-memory workspace still works.
  }
}

export function serializeDocument(nodes: DesignNode[]): string {
  const doc: SavedDocument = { version: 1, nodes };
  return JSON.stringify(doc, null, 2);
}

/** `<board name>.draftboard.json`, with the characters Windows, macOS or Linux forbid in a file name replaced. */
export function documentFileName(boardName: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what file names can't hold.
  const safe = boardName.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_').trim().replace(/^\.+/, '');
  return `${safe || 'board'}.draftboard.json`;
}

export function downloadDocument(nodes: DesignNode[], filename: string): void {
  downloadText(serializeDocument(nodes), filename, 'application/json');
}

export function downloadText(text: string, filename: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
