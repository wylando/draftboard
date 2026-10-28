import { createContext, lazy, Suspense, useContext, useRef, useState, type ReactNode } from 'react';
import { useDialogs } from '../../design-system';
import { useBoards, useEditor } from '../EditorContext';
import { documentFileName, downloadDocument, parseDocument } from '../persistence';

// Loaded on first open so their parser and layout code stay out of the startup bundle.
const SchemaImportDialog = lazy(() => import('../components/SchemaImportDialog').then((m) => ({ default: m.SchemaImportDialog })));
const SchemaExportDialog = lazy(() => import('../components/SchemaExportDialog').then((m) => ({ default: m.SchemaExportDialog })));

export interface FileActions {
  importSchema: () => void;
  importBoard: () => void;
  exportSchema: () => void;
  exportBoard: () => void;
}

const FileActionsContext = createContext<FileActions | null>(null);

export function useFileActions(): FileActions {
  const actions = useContext(FileActionsContext);
  if (!actions) throw new Error('useFileActions needs a FileActionsProvider');
  return actions;
}

/**
 * The import and export actions with the dialogs and hidden file input they use, so the top bar, the
 * empty-board card and keyboard shortcuts all run the same ones.
 */
export function FileActionsProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useEditor();
  const { boards, activeId } = useBoards();
  const dialogs = useDialogs();
  const input = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRequested, setImportRequested] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRequested, setExportRequested] = useState(false);

  const loadBoardFile = async (file: File | undefined) => {
    if (!file) return;
    const nodes = parseDocument(await file.text());
    if (!nodes) {
      await dialogs.alert({ title: "Can't open this file", description: 'That file is not a valid Draftboard document.' });
      return;
    }
    // Loading clears undo history, so replacing a non-empty design can't be taken back.
    if (state.nodes.length > 0) {
      const replace = await dialogs.confirm({
        title: 'Replace the current design?',
        description: 'Importing replaces everything on the canvas and clears undo history. Export first to keep a copy.',
        confirmLabel: 'Replace',
      });
      if (!replace) return;
    }
    dispatch({ type: 'loadDocument', nodes });
  };

  const actions: FileActions = {
    importSchema: () => {
      setImportRequested(true);
      setImportOpen(true);
    },
    // The browser only allows the picker during the gesture that asked for it, so this runs synchronously.
    importBoard: () => input.current?.click(),
    exportSchema: () => {
      setExportRequested(true);
      setExportOpen(true);
    },
    exportBoard: () => downloadDocument(state.nodes, documentFileName(boards.find((b) => b.id === activeId)?.name ?? '')),
  };

  return (
    <FileActionsContext.Provider value={actions}>
      {children}
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="import-file"
        onChange={(e) => {
          void loadBoardFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {importRequested && (
        <Suspense fallback={null}>
          <SchemaImportDialog open={importOpen} onOpenChange={setImportOpen} />
        </Suspense>
      )}
      {exportRequested && (
        <Suspense fallback={null}>
          <SchemaExportDialog open={exportOpen} onOpenChange={setExportOpen} />
        </Suspense>
      )}
    </FileActionsContext.Provider>
  );
}
