import { useEffect } from 'react';
import { useDialogs } from '../../design-system';
import type { CommandId } from '../../settings/keybindings/commands';
import { bindingFromEvent } from '../../settings/keybindings/keys';
import { useKeybindings } from '../../settings/keybindings/KeybindingsContext';
import { useLatest } from '../../shared/useLatest';
import type { EditorAction, EditorState } from '../model/editorReducer';
import { byIdOf, isEffectivelyVisible } from '../model/tree';

const NUDGE = 1;
const NUDGE_LARGE = 10;

interface Options {
  state: EditorState;
  dispatch: (action: EditorAction) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo100: () => void;
  zoomToFit: () => void;
  openSettings: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
}

/** What each command does in the editor. Keys come from the user's bindings. */
function runCommand(id: CommandId, o: Options): void {
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
    case 'app.openSettings':
      return o.openSettings();
  }
}

/** Dispatches editor keyboard commands. Mounted only while the editor is on screen. */
export function useKeyboardShortcuts(options: Options) {
  const { commandFor } = useKeybindings();
  const { isOpen: dialogOpen } = useDialogs();
  const latest = useLatest({ options, commandFor, dialogOpen });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // A modal dialog owns the keyboard: Escape closes it, Backspace mustn't delete the selection behind it.
      if (latest.current.dialogOpen || isTypingTarget(e.target)) return;
      const binding = bindingFromEvent(e);
      const id = binding ? latest.current.commandFor(binding) : undefined;
      if (!id) return;
      e.preventDefault();
      runCommand(id, latest.current.options);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [latest]);
}
