import { ToggleGroup } from '@ark-ui/react/toggle-group';
import { lazy, Suspense, useRef, useState, type ReactElement } from 'react';
import { Button, IconButton, icons, useDialogs } from '../../design-system';
import { useEditor } from '../EditorContext';
import { useViewportControls } from '../hooks/useViewportControls';
import type { ToolId } from '../model/types';
import { isBroken } from '../model/connector';
import { downloadDocument, parseDocument } from '../persistence';
import { COMMANDS, type CommandId } from '../../settings/keybindings/commands';
import { formatBindingText } from '../../settings/keybindings/keys';
import { useKeybindings } from '../../settings/keybindings/KeybindingsContext';
import { css } from 'styled-system/css';
import { iconButton } from 'styled-system/recipes';

// Loaded on first open so its parser and layout code stay out of the startup bundle.
const SchemaImportDialog = lazy(() => import('./SchemaImportDialog').then((m) => ({ default: m.SchemaImportDialog })));

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
const problemsClass = css({ color: 'text.danger' });
const toolItemClass = iconButton({ tone: 'dark' });

const TOOLS: Array<{ id: ToolId; command: CommandId; icon: () => ReactElement }> = [
  { id: 'select', command: 'tool.select', icon: icons.select },
  { id: 'frame', command: 'tool.frame', icon: icons.frame },
  { id: 'rect', command: 'tool.rect', icon: icons.rect },
  { id: 'ellipse', command: 'tool.ellipse', icon: icons.ellipse },
  { id: 'line', command: 'tool.line', icon: icons.line },
  { id: 'text', command: 'tool.text', icon: icons.text },
  { id: 'table', command: 'tool.table', icon: icons.table },
  { id: 'connector', command: 'tool.connector', icon: icons.connector },
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

export function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state, dispatch } = useEditor();
  const { zoom, zoomIn, zoomOut, zoomToFit } = useViewportControls();
  const fileInput = useRef<HTMLInputElement>(null);
  const title = useCommandTitle();
  const dialogs = useDialogs();
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schemaRequested, setSchemaRequested] = useState(false);
  const broken = state.nodes.filter((n) => n.type === 'connector' && isBroken(n));

  const onImport = async (file: File | undefined) => {
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

  return (
    <header className={toolbarClass} data-testid="toolbar">
      <div className={groupClass}>
        <span className={brandClass}>Draftboard</span>
        {/* Exactly one tool is always active, so the group can't be emptied. */}
        <ToggleGroup.Root
          className={groupClass}
          aria-label="Tools"
          value={[state.tool]}
          deselectable={false}
          onValueChange={({ value }) => {
            const tool = value[0] as ToolId | undefined;
            if (tool) dispatch({ type: 'setTool', tool });
          }}
        >
          {TOOLS.map((t) => (
            <ToggleGroup.Item
              key={t.id}
              value={t.id}
              className={toolItemClass}
              aria-label={title(t.command)}
              title={title(t.command)}
              data-testid={`tool-${t.id}`}
            >
              <t.icon />
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      <div className={groupClass}>
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
        {/* A live region, so the count is announced when a delete breaks a connector. */}
        <span role="status">
          {broken.length > 0 && (
            <Button
              variant="toolbar"
              className={problemsClass}
              data-testid="problems-indicator"
              title="Connectors whose table, column or layer was deleted. Click to select them."
              onClick={() => dispatch({ type: 'select', ids: broken.map((c) => c.id) })}
            >
              {broken.length === 1 ? '1 broken connector' : `${broken.length} broken connectors`}
            </Button>
          )}
        </span>
        <Button variant="toolbar" onClick={() => fileInput.current?.click()}>
          Import
        </Button>
        <Button variant="toolbar" data-testid="import-schema" onClick={() => {
            setSchemaRequested(true);
            setSchemaOpen(true);
          }}>
          Import schema
        </Button>
        {schemaRequested && (
          <Suspense fallback={null}>
            <SchemaImportDialog open={schemaOpen} onOpenChange={setSchemaOpen} />
          </Suspense>
        )}
        <Button variant="toolbar" onClick={() => downloadDocument(state.nodes)}>
          Export
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          data-testid="import-file"
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
