import type { DesignNode } from '../../src/editor/model/types';

const KEY = 'draftboard:workspace:v1';

export interface SavedWorkspace {
  activeId: string;
  boards: Array<{ id: string; name: string; nodes: DesignNode[] }>;
}

/** Visits with one saved board holding `nodes`, in the shape persistence.ts saves. */
export function seedWorkspace(nodes: readonly unknown[]) {
  const workspace = { version: 1, activeId: 'b1', boards: [{ id: 'b1', name: 'Board 1', nodes }] };
  cy.visit('/', { onBeforeLoad: (win) => win.localStorage.setItem(KEY, JSON.stringify(workspace)) });
}

/**
 * Retries `check` against the saved workspace, because saves are debounced. Yields the workspace that passed.
 * Throws on a missing save, so the retry covers a write that hasn't landed yet.
 */
export function savedWorkspace(check: (workspace: SavedWorkspace) => void) {
  let latest: SavedWorkspace | undefined;
  return cy
    .window()
    .should((win) => {
      const raw = win.localStorage.getItem(KEY);
      expect(raw, 'saved workspace').to.be.a('string');
      const workspace = JSON.parse(raw as string) as SavedWorkspace;
      check(workspace);
      latest = workspace;
    })
    .then(() => latest as SavedWorkspace);
}

/** `savedWorkspace` for the first board's nodes; `T` narrows them to the fields a spec reads. */
export function savedNodes<T = DesignNode>(check: (nodes: T[]) => void) {
  return savedWorkspace((w) => check(w.boards[0]!.nodes as unknown as T[])).then((w) => w.boards[0]!.nodes as unknown as T[]);
}
