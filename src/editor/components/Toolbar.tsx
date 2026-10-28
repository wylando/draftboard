import { lazy, Suspense, useRef, useState } from 'react';
import { Menu } from '@ark-ui/react/menu';
import { Portal } from '@ark-ui/react/portal';
import { Button, icons, useDialogs } from '../../design-system';
import { useBoards, useEditor } from '../EditorContext';
import { BoardTabs } from './BoardTabs';
import { useViewportControls } from '../hooks/useViewportControls';
import { isBroken } from '../model/connector';
import { documentFileName, downloadDocument, parseDocument } from '../persistence';
import type { CommandId } from '../../settings/keybindings/commands';
import { formatBindingText } from '../../settings/keybindings/keys';
import { useKeybindings } from '../../settings/keybindings/KeybindingsContext';
import { css, cx } from 'styled-system/css';
import { menu } from 'styled-system/recipes';

// Loaded on first open so its parser and layout code stay out of the startup bundle.
const SchemaImportDialog = lazy(() => import('./SchemaImportDialog').then((m) => ({ default: m.SchemaImportDialog })));
const SchemaExportDialog = lazy(() => import('./SchemaExportDialog').then((m) => ({ default: m.SchemaExportDialog })));

const menuClasses = menu();

// Everything sits on the board tabs' row: the bar's bottom `boardTab` height, where the open tab is drawn.
const toolbarClass = css({
  flex: 'none',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  height: 'toolbarHeight',
  paddingInline: '2',
  bg: 'bg.topBar',
  color: 'text.onToolbar',
});
const rowClass = css({ display: 'flex', alignItems: 'center', gap: '1', flex: 'none', height: 'boardTab' });
// Takes the space the right-hand group leaves; the tabs sit on the bar's bottom edge and scroll when they run out.
const leftGroupClass = css({ display: 'flex', alignItems: 'flex-end', gap: '1', flex: '1', minWidth: '0', alignSelf: 'stretch' });
const menuButtonClass = css({ display: 'flex', alignItems: 'center', gap: '1' });
const zoomClass = css({ minWidth: 'zoomLabel', justifyContent: 'center' });
const shortcutClass = css({ marginInlineStart: 'auto', paddingInlineStart: '4', color: 'text.secondary' });
const problemsClass = css({ color: 'text.danger' });

export function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state, dispatch } = useEditor();
  const { boards, activeId } = useBoards();
  const boardName = boards.find((b) => b.id === activeId)?.name ?? '';
  const { zoom, zoomIn, zoomOut, zoomTo100, zoomToFit } = useViewportControls();
  const fileInput = useRef<HTMLInputElement>(null);
  const { bindings } = useKeybindings();
  const dialogs = useDialogs();
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schemaRequested, setSchemaRequested] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRequested, setExportRequested] = useState(false);
  // Opened once the menu has closed, so the menu's focus return doesn't pull focus out of the dialog.
  const openWhenMenuCloses = useRef<'import' | 'export' | 'settings' | null>(null);
  const broken = state.nodes.filter((n) => n.type === 'connector' && isBroken(n));

  // The user's own first binding, shown like the browser's menus do; `data-binding` keeps tests platform-neutral.
  const shortcut = (id: CommandId) => {
    const first = bindings[id][0];
    return first ? <span className={shortcutClass} data-binding={first}>{formatBindingText(first)}</span> : null;
  };
  const zoomItem = (value: string, id: CommandId, label: string) => (
    <Menu.Item value={value} className={menuClasses.item} data-testid={value}>
      {label}
      {shortcut(id)}
    </Menu.Item>
  );

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
      <div className={leftGroupClass}>
        <div className={rowClass}>
          {/* The app menu holds every import and export and Settings, so the top bar leaves the board tabs their room. */}
          <Menu.Root
            lazyMount
            unmountOnExit
            positioning={{ placement: 'bottom-start' }}
            onSelect={({ value }) => {
              // The file picker opens straight away: browsers only allow it during the click that asked for it.
              if (value === 'import-board') fileInput.current?.click();
              else if (value === 'export-board') downloadDocument(state.nodes, documentFileName(boardName));
              else if (value === 'settings') openWhenMenuCloses.current = 'settings';
              else openWhenMenuCloses.current = value === 'export-schema' ? 'export' : 'import';
            }}
            onExitComplete={() => {
              const next = openWhenMenuCloses.current;
              openWhenMenuCloses.current = null;
              if (next === 'import') {
                setSchemaRequested(true);
                setSchemaOpen(true);
              } else if (next === 'export') {
                setExportRequested(true);
                setExportOpen(true);
              } else if (next === 'settings') {
                onOpenSettings();
              }
            }}
          >
            <Menu.Trigger asChild>
              <Button variant="toolbar" className={menuButtonClass} data-testid="app-menu" aria-label="Draftboard menu" title="Draftboard">
                <icons.logo />
                <icons.chevronDown />
              </Button>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner className={menuClasses.positioner}>
                <Menu.Content className={menuClasses.content}>
                  <Menu.Item value="import-board" className={menuClasses.item} data-testid="import-board">
                    Import board (JSON)…
                  </Menu.Item>
                  <Menu.Item value="export-board" className={menuClasses.item} data-testid="export-board">
                    Export board (JSON)
                  </Menu.Item>
                  <Menu.Separator className={menuClasses.separator} />
                  <Menu.Item value="import-schema" className={menuClasses.item} data-testid="import-schema">
                    Import schema…
                  </Menu.Item>
                  <Menu.Item value="export-schema" className={menuClasses.item} data-testid="export-schema">
                    Export schema…
                  </Menu.Item>
                  <Menu.Separator className={menuClasses.separator} />
                  <Menu.Item value="settings" className={menuClasses.item} data-testid="open-settings">
                    Settings
                    {shortcut('app.openSettings')}
                  </Menu.Item>
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
        </div>
        <BoardTabs />
      </div>

      <div className={rowClass}>
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
        {schemaRequested && (
          <Suspense fallback={null}>
            <SchemaImportDialog open={schemaOpen} onOpenChange={setSchemaOpen} />
          </Suspense>
        )}
        {exportRequested && (
          <Suspense fallback={null}>
            <SchemaExportDialog open={exportOpen} onOpenChange={setExportOpen} />
          </Suspense>
        )}
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
        <Menu.Root
          lazyMount
          unmountOnExit
          positioning={{ placement: 'bottom-end' }}
          onSelect={({ value }) => {
            if (value === 'zoom-in') zoomIn();
            else if (value === 'zoom-out') zoomOut();
            else if (value === 'zoom-100') zoomTo100();
            else if (value === 'zoom-fit') zoomToFit();
          }}
        >
          <Menu.Trigger asChild>
            <Button variant="toolbar" className={cx(menuButtonClass, zoomClass)} data-testid="zoom-level" title="Zoom">
              {Math.round(zoom * 100)}%
              <icons.chevronDown />
            </Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner className={menuClasses.positioner}>
              <Menu.Content className={menuClasses.content}>
                {zoomItem('zoom-in', 'view.zoomIn', 'Zoom in')}
                {zoomItem('zoom-out', 'view.zoomOut', 'Zoom out')}
                <Menu.Separator className={menuClasses.separator} />
                {zoomItem('zoom-fit', 'view.zoomFit', 'Zoom to fit')}
                {zoomItem('zoom-100', 'view.zoom100', 'Zoom to 100%')}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </div>
    </header>
  );
}
