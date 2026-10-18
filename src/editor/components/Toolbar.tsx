import { useRef, type ReactElement, type RefObject } from 'react';
import { Button, IconButton, icons } from '../../design-system';
import { useEditor } from '../EditorContext';
import { useViewportControls } from '../hooks/useViewportControls';
import type { ToolId } from '../model/types';
import { screenToWorld } from '../geometry';
import { importImage } from '../imageImport';
import { createImage } from '../model/nodes';
import { downloadDocument, parseDocument } from '../persistence';
import { COMMANDS, type CommandId } from '../../settings/keybindings/commands';
import { formatBindingText } from '../../settings/keybindings/keys';
import { useKeybindings } from '../../settings/keybindings/KeybindingsContext';
import { css } from 'styled-system/css';

const toolbarClass = css({
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 'toolbarHeight',
  paddingInline: '2',
  bg: 'bg.toolbar',
  color: 'text.onToolbar',
});
const groupClass = css({ display: 'flex', alignItems: 'center', gap: '1' });
const brandClass = css({ paddingInlineStart: '2', paddingInlineEnd: '3', textStyle: 'body.largeStrong' });
const zoomClass = css({ minWidth: 'zoomLabel' });
const saveErrorClass = css({ color: 'text.danger', textStyle: 'body.medium', paddingInline: '2' });

const TOOLS: Array<{ id: ToolId; command: CommandId; icon: () => ReactElement }> = [
  { id: 'select', command: 'tool.select', icon: icons.select },
  { id: 'frame', command: 'tool.frame', icon: icons.frame },
  { id: 'rect', command: 'tool.rect', icon: icons.rect },
  { id: 'ellipse', command: 'tool.ellipse', icon: icons.ellipse },
  { id: 'diamond', command: 'tool.diamond', icon: icons.diamond },
  { id: 'line', command: 'tool.line', icon: icons.line },
  { id: 'arrow', command: 'tool.arrow', icon: icons.arrow },
  { id: 'polygon', command: 'tool.polygon', icon: icons.polygon },
  { id: 'star', command: 'tool.star', icon: icons.star },
  { id: 'pencil', command: 'tool.pencil', icon: icons.pencil },
  { id: 'sticky', command: 'tool.sticky', icon: icons.sticky },
  { id: 'connector', command: 'tool.connector', icon: icons.connector },
  { id: 'text', command: 'tool.text', icon: icons.text },
  { id: 'hand', command: 'tool.hand', icon: icons.hand },
];

/** "Rectangle (R)": label plus the user's current first binding, if any. */
function useCommandTitle() {
  const { bindings } = useKeybindings();
  return (id: CommandId, label: string = COMMANDS[id].label) => {
    const first = bindings[id][0];
    return first ? `${label} (${formatBindingText(first)})` : label;
  };
}

interface ToolbarProps {
  onOpenSettings: () => void;
  imageInput: RefObject<HTMLInputElement | null>;
}

export function Toolbar({ onOpenSettings, imageInput }: ToolbarProps) {
  const { state, dispatch, saveFailed } = useEditor();
  const { zoom, zoomIn, zoomOut, zoomToFit } = useViewportControls();
  const fileInput = useRef<HTMLInputElement>(null);
  const title = useCommandTitle();

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const nodes = parseDocument(await file.text());
    if (nodes) dispatch({ type: 'loadDocument', nodes });
    else window.alert('That file is not a valid Draftboard document.');
  };

  // Placed centered in the visible canvas, and inside a frame if one is under the center.
  const onPlaceImage = async (file: File | undefined) => {
    if (!file) return;
    const image = await importImage(file);
    if (!image) {
      window.alert('That file could not be read as an image.');
      return;
    }
    const center = screenToWorld({ x: state.canvasSize.width / 2, y: state.canvasSize.height / 2 }, state.viewport);
    const box = {
      x: Math.round(center.x - image.width / 2),
      y: Math.round(center.y - image.height / 2),
      width: image.width,
      height: image.height,
    };
    dispatch({ type: 'addNode', node: createImage(image.src, box, state.nodes), parentAt: center });
  };

  return (
    <header className={toolbarClass} data-testid="toolbar">
      <div className={groupClass}>
        <span className={brandClass}>Draftboard</span>
        {TOOLS.map((t) => (
          <IconButton
            key={t.id}
            tone="dark"
            label={title(t.command)}
            data-testid={`tool-${t.id}`}
            icon={<t.icon />}
            active={state.tool === t.id}
            onClick={() => dispatch({ type: 'setTool', tool: t.id })}
          />
        ))}
        <IconButton
          tone="dark"
          label={title('tool.image')}
          data-testid="tool-image"
          icon={<icons.image />}
          onClick={() => imageInput.current?.click()}
        />
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          data-testid="image-input"
          onChange={(e) => {
            void onPlaceImage(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <div className={groupClass}>
        {saveFailed && (
          <span role="alert" className={saveErrorClass} data-testid="save-error">
            Not saved: browser storage is full. Export to keep your work.
          </span>
        )}
        <IconButton
          tone="dark"
          label={title('edit.undo')}
          data-testid="undo"
          icon={<icons.undo />}
          disabled={state.past.length === 0}
          onClick={() => dispatch({ type: 'undo' })}
        />
        <IconButton
          tone="dark"
          label={title('edit.redo')}
          data-testid="redo"
          icon={<icons.redo />}
          disabled={state.future.length === 0}
          onClick={() => dispatch({ type: 'redo' })}
        />
      </div>

      <div className={groupClass}>
        <Button variant="toolbar" onClick={() => fileInput.current?.click()}>
          Import
        </Button>
        <Button variant="toolbar" onClick={() => downloadDocument(state.nodes)}>
          Export
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void onImport(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <IconButton tone="dark" label={title('view.zoomOut')} data-testid="zoom-out" icon={<icons.minus />} onClick={zoomOut} />
        <Button variant="toolbar" className={zoomClass} data-testid="zoom-level" title={title('view.zoomFit')} onClick={zoomToFit}>
          {Math.round(zoom * 100)}%
        </Button>
        <IconButton tone="dark" label={title('view.zoomIn')} data-testid="zoom-in" icon={<icons.plus />} onClick={zoomIn} />
        <IconButton
          tone="dark"
          label={title('app.openSettings', 'Settings')}
          data-testid="open-settings"
          icon={<icons.settings />}
          onClick={onOpenSettings}
        />
      </div>
    </header>
  );
}
