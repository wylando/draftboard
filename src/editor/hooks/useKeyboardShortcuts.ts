import { useEffect } from 'react';
import { useDialogs } from '../../design-system';
import type { CommandId } from '../../settings/keybindings/commands';
import { bindingFromEvent } from '../../settings/keybindings/keys';
import { useKeybindings } from '../../settings/keybindings/KeybindingsContext';
import { useLatest } from '../../shared/useLatest';
import { useBoards } from '../EditorContext';
import type { EditorAction, EditorState } from '../model/editorReducer';
import { byIdOf, isEffectivelyVisible } from '../model/tree';
import { useCloseBoard } from './useCloseBoard';
import type { FileActions } from './FileActions';

const NUDGE = 1;
const NUDGE_LARGE = 10;

interface Options {
  state: EditorState;
  dispatch: (action: EditorAction) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo100: () => void;
  zoomToFit: () => void;
  /** `section` is a Settings deep-link slug, such as 'getting-started'. */
  openSettings: (section?: string) => void;
  files: FileActions;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
}

// These own the arrow keys and Enter while focus is inside them: tabs rove, a menu moves its
// highlight, a panel's resize handle resizes or collapses it.
const inOwnKeys = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[role=tablist], [role=menu], [role=separator]') !== null;

interface BoardControls {
  boards: Array<{ id: string }>;
  activeId: string;
  dispatch: ReturnType<typeof useBoards>['dispatch'];
  closeBoard: (id: string) => void;
}

/** What each command does in the editor. Keys come from the user's bindings. */
function runCommand(id: CommandId, o: Options, b: BoardControls): void {
  const { state, dispatch } = o;
  const nudge = (dx: number, dy: number) => dispatch({ type: 'nudgeSelection', dx, dy });
  switch (id) {
    case 'tool.select':
      return dispatch({ type: 'setTool', tool: 'select' });
    case 'tool.frame':
      return dispatch({ type: 'setTool', tool: 'frame' });
    case 'tool.rect':
      return dispatch({ type: 'setTool', tool: 'rect' });
    case 'tool.ellipse':
      return dispatch({ type: 'setTool', tool: 'ellipse' });
    case 'tool.line':
      return dispatch({ type: 'setTool', tool: 'line' });
    case 'tool.table':
      return dispatch({ type: 'setTool', tool: 'table' });
    case 'tool.connector':
      return dispatch({ type: 'setTool', tool: 'connector' });
    case 'tool.text':
      return dispatch({ type: 'setTool', tool: 'text' });
    case 'tool.hand':
      return dispatch({ type: 'setTool', tool: 'hand' });
    case 'edit.undo':
      return dispatch({ type: 'undo' });
    case 'edit.redo':
      return dispatch({ type: 'redo' });
    case 'edit.copy':
      return dispatch({ type: 'copySelection' });
    case 'edit.cut':
      return dispatch({ type: 'cutSelection' });
    case 'edit.paste':
      return dispatch({ type: 'pasteClipboard' });
    case 'edit.duplicate':
      return dispatch({ type: 'duplicateSelection' });
    case 'edit.delete':
      return dispatch({ type: 'deleteSelection' });
    case 'edit.selectAll': {
      // Select siblings of the current selection (top level if nothing is selected).
      const byId = byIdOf(state.nodes);
      const scope = byId.get(state.selection[0] ?? '')?.parentId ?? null;
      const ids = state.nodes.filter((n) => n.parentId === scope && isEffectivelyVisible(byId, n)).map((n) => n.id);
      return dispatch({ type: 'select', ids });
    }
    case 'edit.escape':
      return dispatch({ type: 'escape' });
    case 'arrange.forward':
      return dispatch({ type: 'reorderSelection', direction: 'forward' });
    case 'arrange.backward':
      return dispatch({ type: 'reorderSelection', direction: 'backward' });
    case 'arrange.front':
      return dispatch({ type: 'reorderSelection', direction: 'front' });
    case 'arrange.back':
      return dispatch({ type: 'reorderSelection', direction: 'back' });
    case 'arrange.group':
      return dispatch({ type: 'groupSelection' });
    case 'arrange.ungroup':
      return dispatch({ type: 'ungroupSelection' });
    case 'view.zoomIn':
      return o.zoomIn();
    case 'view.zoomOut':
      return o.zoomOut();
    case 'view.zoom100':
      return o.zoomTo100();
    case 'view.zoomFit':
      return o.zoomToFit();
    case 'nudge.left':
      return nudge(-NUDGE, 0);
    case 'nudge.right':
      return nudge(NUDGE, 0);
    case 'nudge.up':
      return nudge(0, -NUDGE);
    case 'nudge.down':
      return nudge(0, NUDGE);
    case 'nudge.leftLarge':
      return nudge(-NUDGE_LARGE, 0);
    case 'nudge.rightLarge':
      return nudge(NUDGE_LARGE, 0);
    case 'nudge.upLarge':
      return nudge(0, -NUDGE_LARGE);
    case 'nudge.downLarge':
      return nudge(0, NUDGE_LARGE);
    case 'board.new':
      return b.dispatch({ type: 'newBoard' });
    case 'board.close':
      return b.closeBoard(b.activeId);
    case 'board.next':
    case 'board.previous': {
      const at = b.boards.findIndex((x) => x.id === b.activeId);
      const step = id === 'board.next' ? 1 : -1;
      const target = b.boards[(at + step + b.boards.length) % b.boards.length];
      return b.dispatch({ type: 'switchBoard', id: target?.id ?? b.activeId });
    }
    case 'app.openSettings':
      return o.openSettings();
    case 'app.gettingStarted':
      return o.openSettings('getting-started');
    case 'file.importSchema':
      return o.files.importSchema();
    case 'file.importBoard':
      return o.files.importBoard();
    case 'file.exportSchema':
      return o.files.exportSchema();
    case 'file.exportBoard':
      return o.files.exportBoard();
  }
}

/** Dispatches editor keyboard commands. Mounted only while the editor is on screen. */
export function useKeyboardShortcuts(options: Options) {
  const { commandFor } = useKeybindings();
  const { isOpen: dialogOpen } = useDialogs();
  const { boards, activeId, dispatch: boardsDispatch } = useBoards();
  const closeBoard = useCloseBoard();
  const latest = useLatest({ options, commandFor, dialogOpen, boardControls: { boards, activeId, dispatch: boardsDispatch, closeBoard } });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // A modal dialog owns the keyboard: Escape closes it, Backspace mustn't delete the selection behind it.
      // Arrow keys on a focused board tab move between tabs, and in a menu they move its highlight;
      // neither may also nudge the selection. Alt combos (board commands) don't use those keys, so they pass.
      if (latest.current.dialogOpen || isTypingTarget(e.target) || (inOwnKeys(e.target) && !e.altKey)) return;
      const binding = bindingFromEvent(e);
      let id = binding ? latest.current.commandFor(binding) : undefined;
      // Bindings use the physical key, so a layout that types "?" elsewhere (Shift+- on German) finds nothing above;
      // the typed character then stands in for Shift+/, still through the user's own bindings.
      // Not with Ctrl/Cmd/Alt: Cmd+Shift+/ is the OS and browser Help shortcut, which must stay theirs.
      if (!id && e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) id = latest.current.commandFor('Shift+/');
      if (!id) return;
      e.preventDefault();
      // Holding a nudge key should keep nudging, but holding Alt+N shouldn't keep adding boards.
      if (e.repeat && id.startsWith('board.')) return;
      runCommand(id, latest.current.options, latest.current.boardControls);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [latest]);
}
