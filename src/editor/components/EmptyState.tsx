import { useState } from 'react';
import { css } from 'styled-system/css';
import { Button } from '../../design-system';
import { usePreferences } from '../../settings/preferences/PreferencesContext';
import { useLatest } from '../../shared/useLatest';
import { useBoards, useEditor } from '../EditorContext';
import { fitBox, rotatedBounds, screenToWorld, unionBoxes } from '../geometry';
import { useFileActions } from '../hooks/FileActions';
import { createNode, DEFAULT_SIZE } from '../model/nodes';
import { SQL_DIALECTS } from '../model/table';

// A sibling of the canvas element: the canvas starts gestures on pointer-down. The area lets presses
// through, so drawing works around the card, and it stops above the tool dock.
const areaClass = css({
  position: 'absolute',
  insetInline: '0',
  top: '0',
  bottom: 'toolDockClearance',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
});
const cardClass = css({
  pointerEvents: 'auto',
  display: 'grid',
  gap: '3',
  justifyItems: 'stretch',
  width: '[320px]',
  maxWidth: 'full',
  maxHeight: 'full',
  overflowY: 'auto',
  padding: '4',
  borderRadius: 'large',
  bg: 'bg',
  boxShadow: 'elevation200',
});
const titleClass = css({ margin: '0', textStyle: 'body.largeStrong' });
const hintClass = css({ margin: '0', color: 'text.secondary' });
const linkClass = css({ justifySelf: 'start' });

/** Shown over a board with no layers: ways to start besides picking a tool. */
export function EmptyState({ onOpenGuide }: { onOpenGuide: () => void }) {
  const { state, dispatch } = useEditor();
  const { sqlDialect } = usePreferences().preferences;
  const files = useFileActions();
  const { activeId } = useBoards();
  const activeIdRef = useLatest(activeId);
  // Ignores a second click while the sample is still being laid out, which would add it twice.
  const [adding, setAdding] = useState(false);

  const addTable = () => {
    const { width, height } = DEFAULT_SIZE.table;
    const centre = screenToWorld({ x: state.canvasSize.width / 2, y: state.canvasSize.height / 2 }, state.viewport);
    const node = createNode('table', { x: centre.x - width / 2, y: centre.y - height / 2, width, height }, state.nodes, SQL_DIALECTS[sqlDialect].idType);
    dispatch({ type: 'addNode', node });
  };

  const addExample = async () => {
    if (adding) return;
    setAdding(true);
    const startedOn = activeId;
    try {
      const [{ EXAMPLE_SCHEMA }, { planImport }] = await Promise.all([import('../schemaImport/exampleSchema'), import('../schemaImport/importSchema')]);
      const plan = await planImport(EXAMPLE_SCHEMA, state.nodes);
      // The user may have switched boards while this loaded; the dispatch would land on that one instead.
      if (activeIdRef.current !== startedOn) return;
      dispatch({ type: 'importNodes', nodes: plan.nodes });
      const bounds = unionBoxes(plan.nodes.filter((n) => n.type === 'table').map((n) => rotatedBounds(n, n.rotation)));
      if (bounds) dispatch({ type: 'setViewport', viewport: fitBox(bounds, state.canvasSize) });
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      {/* Only on the Move tool: with a drawing tool picked, a drag through the card's area must reach the canvas. */}
      {state.nodes.length === 0 && state.tool === 'select' && (
        <div className={areaClass}>
          <section className={cardClass} data-testid="empty-state" aria-label="Start a board">
            <h2 className={titleClass}>Start your first schema</h2>
            <p className={hintClass}>Pick a tool below and drag on the canvas, or begin here.</p>
            <Button variant="primary" data-testid="empty-add-table" onClick={addTable}>
              Add a table
            </Button>
            <Button data-testid="empty-import-schema" onClick={files.importSchema}>
              Import SQL or DBML…
            </Button>
            <Button data-testid="empty-open-file" onClick={files.importBoard}>
              Open a board file…
            </Button>
            <Button data-testid="empty-example" disabled={adding} onClick={() => void addExample()}>
              Try an example
            </Button>
            <Button variant="ghost" className={linkClass} data-testid="empty-guide" onClick={onOpenGuide}>
              Getting started
            </Button>
          </section>
        </div>
      )}
    </>
  );
}
