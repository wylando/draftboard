import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useDialogs } from '../../design-system';
import { useLatest } from '../../shared/useLatest';
import { useEditor } from '../EditorContext';
import { measureBetween, rotatedBounds, screenToWorld, unionBoxes, type Guides } from '../geometry';
import { useCanvasGestures, type ConnectPreview, type Marquee } from '../hooks/useCanvasGestures';
import {
  anchorAt,
  anchorBox,
  foreignKeyColumns,
  linksToItself,
  relationalEnd,
  routeBetween,
  sameAnchor,
  typeMismatch,
} from '../model/connector';
import { SQL_DIALECTS, type RowDrop, type TableCell } from '../model/table';
import { byIdOf, childrenByParent, enteredScopes, isEffectivelyVisible, relatedToTables, selectTarget } from '../model/tree';
import type { Anchor, DesignNode, TableNode, TextNode, Viewport } from '../model/types';
import { CANVAS_FONT_FAMILY, measureText } from '../textMetrics';
import { usePreferences } from '../../settings/preferences/PreferencesContext';
import { CanvasGrid } from './CanvasGrid';
import { FrameLabel, NodeView, RelationsContext, type Relations } from './NodeView';
import { SelectionOverlay } from './SelectionOverlay';
import { TableCellEditor } from './TableCellEditor';
import { TextEditor } from './TextEditor';
import { css } from 'styled-system/css';

const canvasClass = css({
  position: 'relative',
  flex: '1',
  minWidth: '0',
  overflow: 'hidden',
  bg: 'bg.canvas',
  touchAction: 'none',
  userSelect: 'none',
});
const svgClass = css({ display: 'block' });
const noticeClass = css({
  position: 'absolute',
  left: '[50%]',
  bottom: '4',
  transform: 'translateX(-50%)',
  margin: '0',
  paddingBlock: '1',
  paddingInline: '3',
  borderRadius: 'medium',
  bg: 'bg',
  boxShadow: 'elevation200',
  color: 'text.danger',
  textStyle: 'body.medium',
});

const TOOL_CURSORS: Record<string, string> = {
  select: 'default',
  hand: 'grab',
};

export function Canvas() {
  const { state, dispatch } = useEditor();
  const { gridStyle, snapToLayers, sqlDialect, relationHighlight } = usePreferences().preferences;
  const containerRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [guides, setGuides] = useState<Guides>({ lines: [], spacing: [] });
  const [altPressed, setAltPressed] = useState(false);
  /**
   * The layer under a resting pointer, with the viewport and nodes it was hit
   * against: once either changes, the layer may no longer be under the pointer.
   */
  /** With the Connector tool, `anchor` is what an end would attach to under the pointer. */
  const [hover, setHover] = useState<{ hitId: string; anchor: Anchor | null; viewport: Viewport; nodes: DesignNode[] } | null>(null);
  const [connectPreview, setConnectPreview] = useState<ConnectPreview | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tableCell, setTableCell] = useState<TableCell | null>(null);
  /** Why the last cell edit wasn't saved, shown until the next press on the canvas. */
  const [cellNotice, setCellNotice] = useState<string | null>(null);
  const [rowDrop, setRowDrop] = useState<RowDrop | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const dialogOpen = useLatest(useDialogs().isOpen);

  // Measured before the first paint as well: ResizeObserver reports only later, and until the size is
  // known no layer counts as on screen, so a drag started straight after load would snap to nothing.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el) dispatch({ type: 'setCanvasSize', size: { width: el.clientWidth, height: el.clientHeight } });
  }, [dispatch]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      dispatch({ type: 'setCanvasSize', size: { width, height } });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [dispatch]);

  useEffect(() => {
    const isTyping = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      // Inside an open dialog, Space must press the focused button, so don't cancel it.
      if (e.code === 'Space' && !isTyping(e.target) && !dialogOpen.current) {
        e.preventDefault();
        setSpacePressed(true);
      }
      // Option-typing accents in a field shouldn't flash measurements over the canvas.
      if (e.key === 'Alt' && !isTyping(e.target)) setAltPressed(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
      if (e.key === 'Alt') setAltPressed(false);
    };
    // Switching windows with Alt held never delivers its keyup here.
    const blur = () => setAltPressed(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [dialogOpen]);

  const onEditText = useCallback((id: string) => setEditingId(id), []);
  const { onPointerDown, onDoubleClick } = useCanvasGestures({
    containerRef,
    state,
    dispatch,
    spacePressed,
    snapToLayers,
    tableIdType: SQL_DIALECTS[sqlDialect].idType,
    onMarquee: setMarquee,
    onGuides: setGuides,
    onEditText,
    onEditTable: (cell) => {
      setCellNotice(null);
      setTableCell(cell);
    },
    onRowDrop: setRowDrop,
    onConnect: setConnectPreview,
  });

  const onHover = (e: ReactPointerEvent) => {
    // Pointer events carry the real Alt state, which catches an Alt pressed outside the window.
    setAltPressed(e.altKey);
    const hitId = e.buttons === 0 ? (e.target as Element).closest('[data-node-id]')?.getAttribute('data-node-id') : null;
    const { viewport, nodes } = state;
    // Found exactly as a release would find it, so the highlight never disagrees with the result.
    // Only the Connector tool needs it; tracking rows otherwise would re-render on every row crossed.
    const rect = containerRef.current?.getBoundingClientRect();
    const world = screenToWorld({ x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }, viewport);
    const found = state.tool === 'connector' && e.buttons === 0 ? anchorAt(document.elementsFromPoint(e.clientX, e.clientY), world, byIdOf(nodes)) : null;
    const anchor = found?.kind === 'point' ? null : found;
    const same = (a: Anchor | null, b: Anchor | null) => a === b || (a !== null && b !== null && sameAnchor(a, b));
    setHover((prev) =>
      !hitId && !anchor
        ? null
        : prev && prev.hitId === (hitId ?? '') && same(prev.anchor, anchor) && prev.viewport === viewport && prev.nodes === nodes
          ? prev
          : { hitId: hitId ?? '', anchor, viewport, nodes },
    );
  };

  // The editor belongs to its table while that table is the whole selection.
  const editingTable =
    tableCell && state.selection.length === 1 && state.selection[0] === tableCell.tableId
      ? state.nodes.find((n): n is TableNode => n.id === tableCell.tableId && n.type === 'table')
      : undefined;
  // Storing what was rendered last: a cell whose table went away is dropped, so it can't come back on undo.
  if (tableCell && !editingTable) setTableCell(null);
  const editingNode = state.nodes.find((n): n is TextNode => n.id === editingId && n.type === 'text');

  const commitText = (text: string) => {
    if (editingNode && text !== editingNode.text) {
      const size = measureText(text, editingNode.fontSize, CANVAS_FONT_FAMILY);
      dispatch({ type: 'checkpoint' });
      dispatch({ type: 'updateNodes', patches: { [editingNode.id]: { text, ...size } } });
    }
    setEditingId(null);
  };

  const { viewport, nodes, selection, tool } = state;
  const childrenOf = useMemo(() => childrenByParent(nodes), [nodes]);
  const byId = useMemo(() => byIdOf(nodes), [nodes]);
  const relations = useMemo<Relations>(() => {
    const mismatched = new Set<string>();
    const relationalEnds = new Set<string>();
    for (const n of nodes) {
      if (n.type !== 'connector') continue;
      if (typeMismatch(n, byId)) mismatched.add(n.id);
      if (relationalEnd(n.from, byId)) relationalEnds.add(`${n.id}:from`);
      if (relationalEnd(n.to, byId)) relationalEnds.add(`${n.id}:to`);
    }
    return { foreignKeys: foreignKeyColumns(nodes), mismatched, relationalEnds };
  }, [nodes, byId]);
  const related = useMemo(() => {
    const { connectors, tables } = relatedToTables(selection, byId);
    return nodes.filter((n) => connectors.has(n.id) || tables.has(n.id));
  }, [selection, nodes, byId]);
  const selectedSet = new Set(selection);
  const selected = nodes.filter((n) => selectedSet.has(n.id) && isEffectivelyVisible(byId, n));
  const picked = state.selectedColumn;
  const cursor = spacePressed ? 'grab' : (TOOL_CURSORS[tool] ?? 'crosshair');
  const freshHover = hover && hover.viewport === viewport && hover.nodes === nodes ? hover : null;
  const hoverHit = freshHover?.hitId ?? null;
  // What a connector would attach to: under the drag, or under the resting pointer with the Connector tool.
  // Escape or another tool mid-drag ends the drag's preview at once; the release then changes nothing.
  // A re-attach lasts while its connector stays selected, a new connector while the tool stays.
  const drawing =
    connectPreview && (connectPreview.editing ? selection.length === 1 && selection[0] === connectPreview.editing : tool === 'connector')
      ? connectPreview
      : null;
  // A release that would link a layer to itself is refused, so its target isn't offered.
  const refused = drawing ? linksToItself(drawing.from, drawing.to) : false;
  const connectAnchor: Anchor | null = drawing
    ? refused
      ? null
      : drawing[drawing.moving]
    : tool === 'connector'
      ? (freshHover?.anchor ?? null)
      : null;
  const connectBox = connectAnchor ? anchorBox(connectAnchor, byId) : null;
  const connectTarget =
    connectAnchor && connectBox && connectAnchor.kind !== 'point'
      ? { kind: connectAnchor.kind, box: connectBox, columnId: connectAnchor.kind === 'column' ? connectAnchor.columnId : undefined }
      : null;
  const previewRoute = drawing ? routeBetween(drawing.from, drawing.to, drawing.routing, byId) : null;
  const measureId = altPressed && hoverHit && editingId === null ? selectTarget(byId, hoverHit, enteredScopes(byId, selection, false)) : null;
  // A connector's box is only its route's bounds, so it is neither measured from nor to.
  const measureNode = measureId && !selectedSet.has(measureId) ? byId.get(measureId) : undefined;
  const measureTarget = measureNode?.type === 'connector' ? undefined : measureNode;
  const selectionBox = unionBoxes(selected.filter((n) => n.type !== 'connector').map((n) => rotatedBounds(n, n.rotation)));
  const measures =
    measureTarget && selectionBox && isEffectivelyVisible(byId, measureTarget)
      ? measureBetween(selectionBox, rotatedBounds(measureTarget, measureTarget.rotation))
      : null;

  return (
    <div
      ref={containerRef}
      className={canvasClass}
      data-testid="canvas"
      data-tool={tool}
      data-grid={gridStyle}
      style={{ cursor }}
      onPointerDown={(e) => {
        setCellNotice(null);
        // An in-place editor saves on blur, but the press may select something else and unmount it
        // first, and a removed input never blurs. So end the edit before the press does anything.
        const active = document.activeElement;
        if (active instanceof HTMLElement && containerRef.current?.contains(active)) active.blur();
        onPointerDown(e);
      }}
      onPointerMove={onHover}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={onDoubleClick}
    >
      <svg className={svgClass} width="100%" height="100%">
        <CanvasGrid viewport={viewport} style={gridStyle} />
        <g
          data-testid="world"
          data-zoom={viewport.zoom}
          transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}
        >
          <RelationsContext.Provider value={relations}>
            {(childrenOf.get(null) ?? []).map((n) => (
              <NodeView key={n.id} node={n} childrenOf={childrenOf} editingId={editingId} />
            ))}
          </RelationsContext.Provider>
          {nodes.map((n) => (
            <FrameLabel key={`label-${n.id}`} node={n} zoom={viewport.zoom} />
          ))}
        </g>
        <SelectionOverlay
          selected={selected}
          viewport={viewport}
          marquee={marquee?.box ?? null}
          guides={guides}
          measures={measures}
          measureTarget={measures ? measureTarget : undefined}
          pickedColumnId={picked && picked.tableId === selection[0] && selection.length === 1 ? picked.columnId : null}
          rowDrop={rowDrop}
          connectTarget={connectTarget}
          connectPreview={previewRoute}
          hideHandles={editingId !== null || editingTable !== undefined || tool === 'connector'}
          related={related}
          relatedColor={relationHighlight}
        />
      </svg>
      {editingTable && tableCell && (
        <TableCellEditor
          key={`${tableCell.tableId}-${tableCell.field}-${'columnId' in tableCell ? tableCell.columnId : ''}`}
          table={editingTable}
          cell={tableCell}
          viewport={viewport}
          onMove={(cell, notice) => {
            setTableCell(cell);
            setCellNotice(notice ?? null);
          }}
        />
      )}
      {cellNotice && (
        <p data-testid="table-cell-notice" role="status" className={noticeClass}>
          {cellNotice} The cell kept its old value.
        </p>
      )}
      {editingNode && (
        <TextEditor
          key={editingNode.id}
          node={editingNode}
          viewport={viewport}
          onCommit={commitText}
          onCancel={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
