import { useRef } from 'react';
import { useDialogs } from '../../design-system';
import { useEditor } from '../EditorContext';
import { parseDocument } from '../persistence';

/** The hidden file input and the confirm-then-load flow for a board JSON file, shared by the top bar and the empty-board card. */
export function useBoardFileImport(testId: string) {
  const { state, dispatch } = useEditor();
  const dialogs = useDialogs();
  const input = useRef<HTMLInputElement>(null);

  const load = async (file: File | undefined) => {
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

  return {
    // The browser only allows the picker during the click that asked for it, so callers open it synchronously.
    pick: () => input.current?.click(),
    field: (
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid={testId}
        onChange={(e) => {
          void load(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    ),
  };
}
