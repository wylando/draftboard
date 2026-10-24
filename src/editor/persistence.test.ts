import { describe, expect, it } from 'vitest';
import { initialWorkspace, workspaceReducer } from './model/workspace';
import { createNode } from './model/nodes';
import { parseDocument, parseWorkspace, serializeDocument, serializeWorkspace, workspaceFromStorage } from './persistence';

const rect = () => createNode('rect', { x: 0, y: 0, width: 50, height: 50 }, []);
const wrap = (boards: unknown[], activeId = 'a') => JSON.stringify({ version: 1, activeId, boards });

describe('parseWorkspace', () => {
  it('round-trips ids, names, nodes and the active board, without history or viewport', () => {
    const r = rect();
    let s = initialWorkspace([{ id: 'a', name: 'Plan', nodes: [r] }]);
    s = workspaceReducer(s, { type: 'newBoard' });
    s = workspaceReducer(s, { type: 'editor', action: { type: 'setViewport', viewport: { x: 9, y: 9, zoom: 3 } } });
    const json = serializeWorkspace(s);
    expect(json).not.toContain('"past"');
    expect(json).not.toContain('"zoom"');
    const loaded = parseWorkspace(json)!;
    expect(loaded.activeId).toBe(s.activeId);
    expect(loaded.boards.map((b) => [b.id, b.name])).toEqual(s.boards.map((b) => [b.id, b.name]));
    expect(loaded.boards[0]!.nodes.map((n) => n.id)).toEqual([r.id]);
  });

  it('drops a board whose nodes are invalid and keeps the rest', () => {
    const loaded = parseWorkspace(wrap([{ id: 'a', name: 'Bad', nodes: [{ id: 'x', type: 'nope' }] }, { id: 'b', name: 'Good', nodes: [rect()] }], 'a'))!;
    expect(loaded.boards.map((b) => b.id)).toEqual(['b']);
  });

  it('returns null for bad JSON, a wrong version, or when no board survives', () => {
    expect(parseWorkspace('{')).toBeNull();
    expect(parseWorkspace(JSON.stringify({ version: 2, boards: [] }))).toBeNull();
    expect(parseWorkspace(wrap([{ id: 'a', name: 'Bad', nodes: 'x' }]))).toBeNull();
  });

  it('repairs a damaged table the way a single document does', () => {
    const table = { ...createNode('table', { x: 0, y: 0, width: 200, height: 100 }, []), columns: 'garbage' };
    expect(parseWorkspace(wrap([{ id: 'a', name: 'T', nodes: [table] }]))!.boards).toHaveLength(1);
    expect(parseDocument(JSON.stringify({ version: 1, nodes: [table] }))).not.toBeNull();
  });
});

describe('workspaceFromStorage', () => {
  it('prefers the workspace key', () => {
    const loaded = workspaceFromStorage(wrap([{ id: 'a', name: 'One', nodes: [] }]), serializeDocument([rect()]));
    expect(loaded.boards.map((b) => b.name)).toEqual(['One']);
  });

  it('migrates the legacy document into a single "Board 1"', () => {
    const r = rect();
    const loaded = workspaceFromStorage(null, serializeDocument([r]));
    expect(loaded.boards.map((b) => b.name)).toEqual(['Board 1']);
    expect(loaded.boards[0]!.nodes.map((n) => n.id)).toEqual([r.id]);
  });

  it('falls back to the legacy document when the workspace is unreadable', () => {
    expect(workspaceFromStorage('{', serializeDocument([rect()])).boards).toHaveLength(1);
  });

  it('is empty when nothing usable is stored', () => {
    expect(workspaceFromStorage(null, null).boards).toEqual([]);
    expect(workspaceFromStorage(null, 'junk').boards).toEqual([]);
  });
});
