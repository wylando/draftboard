import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import { editorReducer, initialEditorState, type EditorAction, type EditorState } from './model/editorReducer';
import { loadFromStorage, saveToStorage } from './persistence';

const SAVE_DEBOUNCE_MS = 300;

interface EditorContextValue {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => initialEditorState(loadFromStorage()));

  useEffect(() => {
    const handle = window.setTimeout(() => saveToStorage(state.nodes), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [state.nodes]);

  return <EditorContext.Provider value={{ state, dispatch }}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used inside <EditorProvider>');
  return ctx;
}

export function useSelectedNodes() {
  const { state } = useEditor();
  const ids = new Set(state.selection);
  return state.nodes.filter((n) => ids.has(n.id));
}
