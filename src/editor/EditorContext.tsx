import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import { notify } from '../design-system';
import { useLatest } from '../shared/useLatest';
import { editorReducer, type EditorAction, type EditorState } from './model/editorReducer';
import { byIdOf, topLevelIds } from './model/tree';
import { initialWorkspace, sameSavedParts, workspaceReducer, type WorkspaceAction } from './model/workspace';
import { loadWorkspace, saveWorkspace } from './persistence';

const SAVE_DEBOUNCE_MS = 300;

interface EditorContextValue {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

interface BoardSummary {
  id: string;
  name: string;
  isEmpty: boolean;
}

interface BoardsContextValue {
  boards: BoardSummary[];
  activeId: string;
  dispatch: Dispatch<WorkspaceAction>;
}

const layers = (n: number) => `${n} ${n === 1 ? 'layer' : 'layers'}`;

/**
 * The toast an action earns, worked out from the state it ran on. Silent when it changed nothing, so a
 * key with nothing to act on doesn't talk. `undoable` is where Undo goes, for actions it can take back.
 */
function announce(before: EditorState, action: EditorAction, undo: (past: number) => void) {
  const after = editorReducer(before, action);
  const top = (s: EditorState) => topLevelIds(byIdOf(s.nodes), s.selection).length;
  switch (action.type) {
    case 'copySelection':
      if (before.selection.length > 0) notify(`Copied ${layers(top(before))}`, { id: 'copy' });
      return;
    case 'cutSelection':
      if (after !== before) notify(`Cut ${layers(top(before))}`, { id: 'cut' });
      return;
    case 'duplicateSelection':
      if (after !== before) notify(`Duplicated ${layers(top(before))}`, { id: 'duplicate' });
      return;
    case 'pasteClipboard': {
      if (after === before) return notify('Nothing to paste', { id: 'paste' });
      const inClipboard = new Set(before.clipboard.map((n) => n.id));
      const pasted = before.clipboard.filter((n) => n.parentId === null || !inClipboard.has(n.parentId)).length;
      return notify(`Pasted ${layers(pasted)}`, { id: 'paste' });
    }
    case 'deleteSelection': {
      if (after === before) return;
      const message = before.selectedColumn ? 'Deleted column' : `Deleted ${layers(top(before))}`;
      notify(message, { id: 'delete', action: { label: 'Undo', onClick: () => undo(after.past.length) } });
    }
  }
}

const EditorContext = createContext<EditorContextValue | null>(null);
const BoardsContext = createContext<BoardsContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [workspace, workspaceDispatch] = useReducer(workspaceReducer, undefined, () => {
    const saved = loadWorkspace();
    return initialWorkspace(saved.boards, saved.activeId);
  });
  const latest = useLatest(workspace);
  // Actions sent but not yet rendered. A toast decides from the state its action will really run on, and
  // a key pressed right after another would otherwise read the state from before that one.
  const pending = useRef<WorkspaceAction[]>([]);
  useLayoutEffect(() => {
    pending.current = [];
  }, [workspace]);
  const send = useCallback(
    (action: WorkspaceAction) => {
      pending.current.push(action);
      workspaceDispatch(action);
    },
    [],
  );
  const dispatch = useCallback(
    (action: EditorAction) => {
      const current = () => pending.current.reduce(workspaceReducer, latest.current);
      const { boards, activeId } = current();
      const board = boards.find((b) => b.id === activeId);
      if (board) {
        // Undo must take back only the delete it announced: any other edit, or another board, changes this.
        const undo = (past: number) => {
          const now = current();
          const here = now.boards.find((b) => b.id === now.activeId);
          if (now.activeId === activeId && here?.editor.past.length === past) send({ type: 'editor', action: { type: 'undo' } });
        };
        announce(board.editor, action, undo);
      }
      send({ type: 'editor', action });
    },
    [latest, send],
  );

  const scheduled = useRef(workspace);
  const timer = useRef<number | undefined>(undefined);
  // Not cleaned up per change: a pan right after an edit must not cancel the edit's pending save.
  useEffect(() => {
    if (sameSavedParts(scheduled.current, workspace)) return;
    scheduled.current = workspace;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveWorkspace(latest.current), SAVE_DEBOUNCE_MS);
  }, [workspace, latest]);

  // An edit made just before a reload or close would still be waiting on the debounce.
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(timer.current);
      saveWorkspace(latest.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [latest]);

  const active = workspace.boards.find((b) => b.id === workspace.activeId)!.editor;
  const editorValue = useMemo(() => ({ state: active, dispatch }), [active, dispatch]);

  // Keyed by content, so a pan (which rebuilds `workspace`) doesn't hand the tab bar a new array.
  const summaryKey = JSON.stringify(workspace.boards.map((b) => ({ id: b.id, name: b.name, isEmpty: b.editor.nodes.length === 0 })));
  const boards = useMemo(() => JSON.parse(summaryKey) as BoardSummary[], [summaryKey]);
  const boardsValue = useMemo(
    () => ({ boards, activeId: workspace.activeId, dispatch: send }),
    [boards, workspace.activeId, send],
  );

  return (
    <BoardsContext.Provider value={boardsValue}>
      <EditorContext.Provider value={editorValue}>{children}</EditorContext.Provider>
    </BoardsContext.Provider>
  );
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used inside <EditorProvider>');
  return ctx;
}

export function useBoards(): BoardsContextValue {
  const ctx = useContext(BoardsContext);
  if (!ctx) throw new Error('useBoards must be used inside <EditorProvider>');
  return ctx;
}

export function useSelectedNodes() {
  const { state } = useEditor();
  const ids = new Set(state.selection);
  return state.nodes.filter((n) => ids.has(n.id));
}
