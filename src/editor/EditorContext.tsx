import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import { useLatest } from '../shared/useLatest';
import type { EditorAction, EditorState } from './model/editorReducer';
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

const EditorContext = createContext<EditorContextValue | null>(null);
const BoardsContext = createContext<BoardsContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [workspace, workspaceDispatch] = useReducer(workspaceReducer, undefined, () => {
    const saved = loadWorkspace();
    return initialWorkspace(saved.boards, saved.activeId);
  });
  const dispatch = useCallback((action: EditorAction) => workspaceDispatch({ type: 'editor', action }), []);

  const latest = useLatest(workspace);
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
    () => ({ boards, activeId: workspace.activeId, dispatch: workspaceDispatch }),
    [boards, workspace.activeId],
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
