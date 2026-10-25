import { lazy, Suspense, useRef, useState } from 'react';
import { Button, IconButton, icons, useDialogs } from '../../design-system';
import { useEditor } from '../EditorContext';
import { BoardTabs } from './BoardTabs';
import { useViewportControls } from '../hooks/useViewportControls';
import { isBroken } from '../model/connector';
import { downloadDocument, parseDocument } from '../persistence';
import { useCommandTitle } from '../../settings/keybindings/useCommandTitle';
import { css } from 'styled-system/css';

// Loaded on first open so its parser and layout code stay out of the startup bundle.
const SchemaImportDialog = lazy(() => import('./SchemaImportDialog').then((m) => ({ default: m.SchemaImportDialog })));

const toolbarClass = css({
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 'toolbarHeight',
  paddingInline: '2',
  bg: 'bg.topBar',
  color: 'text.onToolbar',
});
const groupClass = css({ display: 'flex', alignItems: 'center', gap: '1', flex: 'none' });
// Takes the space the right-hand group leaves; the tabs sit on the bar's bottom edge and scroll when they run out.
const leftGroupClass = css({ display: 'flex', alignItems: 'flex-end', gap: '1', flex: '1', minWidth: '0', alignSelf: 'stretch' });
const brandClass = css({ alignSelf: 'center', paddingInlineStart: '2', paddingInlineEnd: '3', textStyle: 'body.largeStrong' });
const zoomClass = css({ minWidth: 'zoomLabel' });
const problemsClass = css({ color: 'text.danger' });

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
      <div className={leftGroupClass}>
        <span className={brandClass}>Draftboard</span>
        <BoardTabs />
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
