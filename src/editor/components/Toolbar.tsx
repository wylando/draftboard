import { useRef } from 'react';
import { Menu } from '@ark-ui/react/menu';
import { Portal } from '@ark-ui/react/portal';
import { Button, icons } from '../../design-system';
import { useEditor } from '../EditorContext';
import { BoardTabs } from './BoardTabs';
import { useViewportControls } from '../hooks/useViewportControls';
import { isBroken } from '../model/connector';
import { useFileActions } from '../hooks/FileActions';
import type { CommandId } from '../../settings/keybindings/commands';
import { formatBindingText } from '../../settings/keybindings/keys';
import { useKeybindings } from '../../settings/keybindings/KeybindingsContext';
import { css, cx } from 'styled-system/css';
import { menu } from 'styled-system/recipes';

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
  // Under the tabs, so the open tab covers it and joins the canvas below.
  boxShadow: '[inset 0 -1px 0 0 var(--colors-border)]',
});
const rowClass = css({ display: 'flex', alignItems: 'center', gap: '1', flex: 'none', height: 'boardTab' });
// Takes the space the right-hand group leaves; the tabs sit on the bar's bottom edge and scroll when they run out.
const leftGroupClass = css({ display: 'flex', alignItems: 'flex-end', gap: '1', flex: '1', minWidth: '0', alignSelf: 'stretch' });
const menuButtonClass = css({ display: 'flex', alignItems: 'center', gap: '1' });
// Icon-only on a narrow window so the board tabs keep their room; the name stays in aria-label and title.
const fileLabelClass = css({ '@media (max-width: 900px)': { display: 'none' } });
const zoomClass = css({ width: 'zoomLabel', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' });
const shortcutClass = css({ marginInlineStart: 'auto', paddingInlineStart: '4', color: 'text.secondary' });
const problemsClass = css({ color: 'text.danger' });

export function Toolbar({ onOpenSettings }: { onOpenSettings: (section?: string) => void }) {
  const { state, dispatch } = useEditor();
  const { zoom, zoomIn, zoomOut, zoomTo100, zoomToFit } = useViewportControls();
  const files = useFileActions();
  const { bindings } = useKeybindings();
  // Opened once the menu has closed, so the menu's focus return doesn't pull focus out of the dialog.
  const openWhenMenuCloses = useRef<'importSchema' | 'exportSchema' | 'settings' | 'guide' | null>(null);
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

  const afterMenuCloses = () => {
    const next = openWhenMenuCloses.current;
    openWhenMenuCloses.current = null;
    if (next === 'importSchema') files.importSchema();
    else if (next === 'exportSchema') files.exportSchema();
    else if (next === 'settings') onOpenSettings();
    else if (next === 'guide') onOpenSettings('getting-started');
  };
  const fileMenuButton = (kind: 'import' | 'export', label: string) => (
    <Menu.Trigger asChild>
      <Button variant="toolbar" className={menuButtonClass} data-testid={`${kind}-menu`} aria-label={label} title={label}>
        {kind === 'import' ? <icons.importFile /> : <icons.exportFile />}
        <span className={fileLabelClass} data-testid={`${kind}-menu-label`}>{label}</span>
        <icons.chevronDown />
      </Button>
    </Menu.Trigger>
  );

  return (
    <header className={toolbarClass} data-testid="toolbar">
      <div className={leftGroupClass}>
        <div className={rowClass}>
          <Menu.Root
            lazyMount
            unmountOnExit
            positioning={{ placement: 'bottom-start' }}
            onSelect={({ value }) => {
              openWhenMenuCloses.current = value === 'guide' ? 'guide' : 'settings';
            }}
            onExitComplete={afterMenuCloses}
          >
            <Menu.Trigger asChild>
              <Button variant="toolbar" className={menuButtonClass} data-testid="app-menu" aria-label="Draftboard menu" title="Draftboard menu">
                <icons.logo />
                <icons.chevronDown />
              </Button>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner className={menuClasses.positioner}>
                <Menu.Content className={menuClasses.content}>
                  <Menu.Item value="guide" className={menuClasses.item} data-testid="open-guide">
                    Getting started
                    {shortcut('app.gettingStarted')}
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
        <Menu.Root
          lazyMount
          unmountOnExit
          positioning={{ placement: 'bottom-end' }}
          onSelect={({ value }) => {
            // The file picker opens straight away: browsers only allow it during the click that asked for it.
            if (value === 'import-board') files.importBoard();
            else openWhenMenuCloses.current = 'importSchema';
          }}
          onExitComplete={afterMenuCloses}
        >
          {fileMenuButton('import', 'Import')}
          <Portal>
            <Menu.Positioner className={menuClasses.positioner}>
              <Menu.Content className={menuClasses.content}>
                <Menu.Item value="import-schema" className={menuClasses.item} data-testid="import-schema">
                  Schema (SQL, DBML, SQLite)…
                  {shortcut('file.importSchema')}
                </Menu.Item>
                <Menu.Item value="import-board" className={menuClasses.item} data-testid="import-board">
                  Board file (.json)…
                  {shortcut('file.importBoard')}
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
        <Menu.Root
          lazyMount
          unmountOnExit
          positioning={{ placement: 'bottom-end' }}
          onSelect={({ value }) => {
            if (value === 'export-board') files.exportBoard();
            else openWhenMenuCloses.current = 'exportSchema';
          }}
          onExitComplete={afterMenuCloses}
        >
          {fileMenuButton('export', 'Export')}
          <Portal>
            <Menu.Positioner className={menuClasses.positioner}>
              <Menu.Content className={menuClasses.content}>
                <Menu.Item value="export-schema" className={menuClasses.item} data-testid="export-schema">
                  Schema as SQL or DBML…
                  {shortcut('file.exportSchema')}
                </Menu.Item>
                <Menu.Item value="export-board" className={menuClasses.item} data-testid="export-board">
                  Board file (.json)
                  {shortcut('file.exportBoard')}
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
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
            <Button
              variant="toolbar"
              className={cx(menuButtonClass, zoomClass)}
              data-testid="zoom-level"
              // The visible percentage stays in the name, so speech and voice control both match what's shown.
              aria-label={`Zoom ${Math.round(zoom * 100)}%`}
              title="Zoom"
            >
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
