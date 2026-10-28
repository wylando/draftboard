import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useDialogs } from '../../design-system';
import { useLatest } from '../../shared/useLatest';
import { useEditor } from '../EditorContext';
import { useHoveredId, useSetHovered } from '../HoverContext';
import { measureBetween, nextCullWindow, rotatedBounds, screenToWorld, unionBoxes, viewWorldBox, type Guides } from '../geometry';
import { useCanvasGestures, type ConnectPreview, type Marquee } from '../hooks/useCanvasGestures';
import {
  anchorAt,
  anchorBox,
  foreignKeyColumns,
  foreignKeyTypes,
  linksToItself,
  relationalEnd,
  routeBetween,
  sameAnchor,
  typeMismatch,
} from '../model/connector';
import { SQL_DIALECTS, type RowDrop, type TableCell } from '../model/table';
import { byIdOf, cheapestJoinPath, childrenByParent, enteredScopes, isEffectivelyVisible, relatedToTables, renderedIds, selectTarget } from '../model/tree';
import type { Anchor, Box, DesignNode, TableNode, TextNode, Viewport } from '../model/types';
import { CANVAS_FONT_FAMILY, measureText } from '../textMetrics';
import { usePreferences } from '../../settings/preferences/PreferencesContext';
import { CanvasGrid } from './CanvasGrid';
import { DimmedContext, FrameLabel, NodeView, RelationsContext, type Relations } from './NodeView';
import { RoutePopup } from './RoutePopup';
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
const NOTHING_DIMMED: ReadonlySet<string> = new Set();
const noticeClass = css({
  position: 'absolute',
  left: '[50%]',
  bottom: 'toolDockClearance',
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
  /** A drag, pan or zoom is under way; popups over the canvas step aside until it settles. */
  const [busy, setBusy] = useState(false);
  /** The selection (ids in order) whose route popup was closed; any other selection brings the popup back. */
  const [routeClosedFor, setRouteClosedFor] = useState<string | null>(null);
  const dialogOpen = useLatest(useDialogs().isOpen);
  const setHovered = useSetHovered();
  const hoveredId = useHoveredId();
  // The Layers panel shares this store; a board switch remounts the canvas, so clear what it set.
  useEffect(() => () => setHovered(null), [setHovered]);

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
      // Inside an open dialog, and on a button in the top bar (a board tab), Space must press the focused button.
      const onTopBar = e.target instanceof Element && e.target.closest('header') !== null;
      if (e.code === 'Space' && !isTyping(e.target) && !dialogOpen.current && !onTopBar) {
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
    onBusy: setBusy,
  });

  const onHover = (e: ReactPointerEvent) => {
    // Pointer events carry the real Alt state, which catches an Alt pressed outside the window.
    setAltPressed(e.altKey);
    // A popup covers the canvas there, so nothing under it is hovered (elementsFromPoint would see through it).
    if ((e.target as Element).closest('[data-canvas-popup]')) {
      setHover(null);
      setHovered(null);
      return;
    }
    const hitId = e.buttons === 0 ? (e.target as Element).closest('[data-node-id]')?.getAttribute('data-node-id') : null;
    const { viewport, nodes } = state;
    // Resolved as a press would resolve it (including Mod for deep select), so the outline names what a click selects.
    setHovered(
      hitId && state.tool === 'select'
        ? selectTarget(byIdOf(nodes), hitId, enteredScopes(byIdOf(nodes), state.selection, false), e.metaKey || e.ctrlKey)
        : null,
    );
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
  // Stored state, advanced while rendering: `nextCullWindow` returns the same box while it still serves the view.
  const [cullWindow, setCullWindow] = useState<Box | null>(null);
  const nextWindow = nextCullWindow(cullWindow, viewWorldBox(viewport, state.canvasSize));
  if (nextWindow !== cullWindow) setCullWindow(nextWindow);
  const editingTableId = tableCell?.tableId;
  const inWindow = useMemo(() => renderedIds(nodes, nextWindow, []), [nodes, nextWindow]);
  // A marquee changes the selection every frame. Keeping `mounted` the same set while every pinned layer is
  // already in the window spares each mounted NodeView a re-render.
  const unmountedPins = [...selection, editingId, editingTableId].filter((id): id is string => !!id && !inWindow.has(id)).join('\n');
  const mounted = useMemo(
    () => (unmountedPins ? renderedIds(nodes, nextWindow, unmountedPins.split('\n')) : inWindow),
    [inWindow, unmountedPins, nodes, nextWindow],
  );
  const childrenOf = useMemo(() => childrenByParent(nodes), [nodes]);
  const byId = useMemo(() => byIdOf(nodes), [nodes]);
  const relations = useMemo<Relations>(() => {
    const typeMismatches = new Map<string, string>();
    const relationalEnds = new Set<string>();
    for (const n of nodes) {
      if (n.type !== 'connector') continue;
      const types = typeMismatch(n, byId) ? foreignKeyTypes(n, byId) : null;
      if (types && n.from.kind === 'column') typeMismatches.set(`${n.from.tableId}:${n.from.columnId}`, `Types differ: ${types.from} → ${types.to}`);
      if (relationalEnd(n.from, byId)) relationalEnds.add(`${n.id}:from`);
      if (relationalEnd(n.to, byId)) relationalEnds.add(`${n.id}:to`);
    }
    return { foreignKeys: foreignKeyColumns(nodes), typeMismatches, relationalEnds };
  }, [nodes, byId]);
  const joinPath = useMemo(() => cheapestJoinPath(selection, byId), [selection, byId]);
  const guaranteedPath = useMemo(() => joinPath && cheapestJoinPath(selection, byId, true), [joinPath, selection, byId]);
  // By content, not identity: undo and other actions rebuild the same selection as a new array.
  const selectionKey = selection.join('\n');
  if (routeClosedFor !== null && routeClosedFor !== selectionKey) setRouteClosedFor(null);
  const related = useMemo(() => {
    const { connectors, tables } = joinPath ?? relatedToTables(selection, byId);
    return nodes.filter((n) => connectors.has(n.id) || tables.has(n.id));
  }, [joinPath, selection, nodes, byId]);
  // Fades what the highlight leaves out, so the linked tables stand apart without more colour.
  const dimmed = useMemo(() => {
    if (related.length === 0) return NOTHING_DIMMED;
    const kept = new Set([...selection, ...related.map((n) => n.id)]);
    return new Set(nodes.filter((n) => (n.type === 'table' || n.type === 'connector') && !kept.has(n.id)).map((n) => n.id));
  }, [related, selection, nodes]);
  const routeTables = useMemo(
    () => (joinPath?.route ?? []).map((step) => byId.get(step.table)).filter((n): n is TableNode => n?.type === 'table'),
    [joinPath, byId],
  );
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
  const hovered = hoveredId && !busy && editingId === null && !selectedSet.has(hoveredId) ? byId.get(hoveredId) : undefined;
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
      onPointerLeave={() => {
        setHover(null);
        setHovered(null);
      }}
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
            <DimmedContext.Provider value={dimmed}>
              {(childrenOf.get(null) ?? []).filter((n) => mounted.has(n.id)).map((n) => (
                <NodeView key={n.id} node={n} childrenOf={childrenOf} mounted={mounted} editingId={editingId} />
              ))}
            </DimmedContext.Provider>
          </RelationsContext.Provider>
          {nodes.filter((n) => mounted.has(n.id)).map((n) => (
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
          routeTables={routeTables}
          hovered={hovered && isEffectivelyVisible(byId, hovered) ? hovered : null}
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
      {joinPath && !busy && routeClosedFor !== selectionKey && (
        <RoutePopup
          path={joinPath}
          guaranteed={guaranteedPath}
          ends={selection}
          byId={byId}
          viewport={viewport}
          onClose={() => setRouteClosedFor(selectionKey)}
        />
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
