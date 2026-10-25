import { useDialogs } from '../../design-system';
import { useBoards } from '../EditorContext';

/** Closes a board, asking first when it has layers: closing deletes its design for good. The last board stays. */
export function useCloseBoard() {
  const { boards, dispatch } = useBoards();
  const dialogs = useDialogs();
  return async (id: string) => {
    const board = boards.find((b) => b.id === id);
    if (!board || boards.length === 1) return;
    if (!board.isEmpty) {
      const ok = await dialogs.confirm({
        title: `Close "${board.name}"?`,
        description: "Its design is deleted. This can't be undone.",
        confirmLabel: 'Close board',
      });
      if (!ok) return;
    }
    dispatch({ type: 'closeBoard', id });
  };
}
