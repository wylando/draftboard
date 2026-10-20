import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  alignmentGuides,
  boxFromPoints,
  boxCenter,
  boxesIntersect,
  boxLines,
  dragRotation,
  HANDLES,
  resizeBox,
  rotatedBounds,
  screenToWorld,
  snapOffset,
  snapSpacing,
  spacingGuides,
  unionBoxes,
  zoomAt,
  type Guides,
  type HandleDir,
} from '../geometry';
import { useLatest } from '../../shared/useLatest';
import type { EditorAction, EditorState } from '../model/editorReducer';
import { createNode, DEFAULT_SIZE, minSizeFor } from '../model/nodes';
import { TABLE_HEADER_HEIGHT, TABLE_ROW_HEIGHT, type RowDrop, type TableCell } from '../model/table';
import { byIdOf, descendantIds, enteredScopes, isEffectivelyVisible, selectTarget, topLevelIds } from '../model/tree';
import type { Box, DesignNode, DrawableType, NodePatch, Point, Viewport } from '../model/types';

/** Screen-pixel distance before a press becomes a drag. */
const DRAG_THRESHOLD = 3;
const WHEEL_ZOOM_SPEED = 0.01;
/** Design choice: Shift snaps a corner rotation to this many degrees. */
const ROTATION_SNAP = 15;
/** Design choice: screen-pixel distance at which an edge or center snaps to another layer's. */
const SNAP_DISTANCE = 6;
const NO_GUIDES: Guides = { lines: [], spacing: [] };

/** The smaller of two optional snap offsets. */
const nearer = (a: number | null, b: number | null) => (a === null || (b !== null && Math.abs(b) < Math.abs(a)) ? b : a);

type Gesture =
  | { kind: 'pan'; start: Point; startViewport: Viewport }
  | { kind: 'create'; nodeType: DrawableType; start: Point; startWorld: Point; nodeId: string | null; targets: SnapTargets }
  | {
      kind: 'move';
      start: Point;
      startWorld: Point;
      origins: Map<string, Point>;
      /** The moving top-level layers as they were at the start of the drag. */
      tops: DesignNode[];
      /** Their combined bounds at the start of the drag. */
      bounds: Box;
      targets: SnapTargets;
      moved: boolean;
      /** World pointer position at the latest move; a cancel drops the selection here. */
      last: Point;
      /** A press on a row of the already-selected table: without a drag, it picks that column. */
      clickColumn: { tableId: string; columnId: string } | null;
    }
  | {
      kind: 'resize';
      start: Point;
      startWorld: Point;
      node: DesignNode;
      handle: HandleDir;
      targets: SnapTargets;
      moved: boolean;
    }
  | { kind: 'rotate'; start: Point; startWorld: Point; node: DesignNode; moved: boolean }
  | { kind: 'reorder'; start: Point; tableId: string; columnId: string; slot: number | null }
  | { kind: 'marquee'; start: Point; startWorld: Point; base: string[]; moved: boolean };

export interface Marquee {
  box: Box;
}

interface Options {
  containerRef: RefObject<HTMLDivElement | null>;
  state: EditorState;
  dispatch: (action: EditorAction) => void;
  spacePressed: boolean;
  snapToLayers: boolean;
  /** Type of the `id` column a new table starts with, from the SQL dialect setting. */
  tableIdType: string;
  onMarquee: (marquee: Marquee | null) => void;
  onGuides: (guides: Guides) => void;
  onEditText: (id: string) => void;
  onEditTable: (cell: TableCell) => void;
  onRowDrop: (drop: RowDrop | null) => void;
}

const isShapeTool = (tool: string): tool is DrawableType =>
  tool === 'frame' || tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'text' || tool === 'table';

/**
 * World boxes a gesture can snap to: layers you can see on screen, except the
 * `changing` layers and the groups whose bounds follow them.
 */
function snapCandidates(nodes: DesignNode[], changing: Set<string>, viewport: Viewport, canvasSize: { width: number; height: number }): Box[] {
  const byId = byIdOf(nodes);
  const following = new Set<string>();
  for (const id of changing) {
    for (let p = byId.get(id)?.parentId; p; ) {
      const parent = byId.get(p);
      if (parent?.type !== 'group') break;
      following.add(parent.id);
      p = parent.parentId;
    }
  }
  const view = boxFromPoints(screenToWorld({ x: 0, y: 0 }, viewport), screenToWorld({ x: canvasSize.width, y: canvasSize.height }, viewport));
  // Frames clip their children, so a child wholly outside an ancestor frame can't be seen.
  const clippedAway = (n: DesignNode, b: Box) => {
    for (let p = n.parentId ? byId.get(n.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) {
      if (p.type === 'frame' && !boxesIntersect(b, rotatedBounds(p, p.rotation))) return true;
    }
    return false;
  };
  return nodes
    .filter((n) => !changing.has(n.id) && !following.has(n.id) && isEffectivelyVisible(byId, n))
    .flatMap((n) => {
      const b = rotatedBounds(n, n.rotation);
      return boxesIntersect(b, view) && !clippedAway(n, b) ? [b] : [];
    });
}

/**
 * Snap targets for one gesture. Only layers on screen count, so the boxes are
 * recomputed whenever the canvas pans or zooms mid-drag.
 */
interface SnapTargets {
  changing: Set<string>;
  viewport: Viewport | null;
  /** The canvas size the boxes were found for; it is 0×0 until the first layout. */
  canvasSize: { width: number; height: number } | null;
  boxes: Box[];
}

function targetBoxes(t: SnapTargets, { nodes, viewport, canvasSize }: EditorState): Box[] {
  if (t.viewport !== viewport || t.canvasSize !== canvasSize) {
    t.boxes = snapCandidates(nodes, t.changing, viewport, canvasSize);
    t.viewport = viewport;
    t.canvasSize = canvasSize;
  }
  return t.boxes;
}

/**
 * Pointer state machine for the canvas. Listens on window during a drag so
 * releasing outside the canvas still ends the gesture (no pointer capture
 * needed, which also keeps synthetic test events working).
 */
export function useCanvasGestures({
  containerRef,
  state,
  dispatch,
  spacePressed,
  snapToLayers,
  tableIdType,
  onMarquee,
  onGuides,
  onEditText,
  onEditTable,
  onRowDrop,
}: Options) {
  const stateRef = useLatest(state);
  const gestureRef = useRef<Gesture | null>(null);

  const toLocal = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = containerRef.current?.getBoundingClientRect();
      return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
    },
    [containerRef],
  );

  const handleMove = useCallback(
    (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g) return;
      const { viewport, nodes } = stateRef.current;
      const boxes = (t: SnapTargets) => targetBoxes(t, stateRef.current);
      const screen = toLocal(e);
      const world = screenToWorld(screen, viewport);
      const dist = Math.hypot(screen.x - g.start.x, screen.y - g.start.y);
      const snap = snapToLayers && !(e.metaKey || e.ctrlKey);
      const threshold = SNAP_DISTANCE / viewport.zoom;

      switch (g.kind) {
        case 'pan': {
          dispatch({
            type: 'setViewport',
            viewport: {
              ...g.startViewport,
              x: g.startViewport.x + screen.x - g.start.x,
              y: g.startViewport.y + screen.y - g.start.y,
            },
          });
          return;
        }
        case 'create': {
          if (g.nodeType === 'text') return;
          if (!g.nodeId && dist < DRAG_THRESHOLD) return;
          let start = g.startWorld;
          let end = world;
          let guides = NO_GUIDES;
          if (e.shiftKey && g.nodeType !== 'table') {
            const size = Math.max(Math.abs(world.x - start.x), Math.abs(world.y - start.y));
            end = {
              x: start.x + Math.sign(world.x - start.x || 1) * size,
              y: start.y + Math.sign(world.y - start.y || 1) * size,
            };
          } else if (snap) {
            // Snapping either axis alone would break Shift's square, so it only applies unconstrained.
            // Both corners snap on every move, so ⌘/Ctrl pressed mid-drag releases the start corner too.
            const candidates = boxes(g.targets);
            const snapPoint = (p: Point): Point => ({
              x: p.x + (snapOffset([p.x], candidates, 'x', threshold) ?? 0),
              y: p.y + (snapOffset([p.y], candidates, 'y', threshold) ?? 0),
            });
            const snappedStart = snapPoint(start);
            const snappedEnd = snapPoint(end);
            // Two corners snapped onto one line would leave a shape too thin to see. On such an
            // axis only the dragged corner snaps, or neither does when the press was already on the line.
            const min = minSizeFor(g.nodeType);
            const pick = (axis: 'x' | 'y'): [number, number] => {
              const least = axis === 'x' ? min.width : min.height;
              if (Math.abs(snappedEnd[axis] - snappedStart[axis]) >= least) return [snappedStart[axis], snappedEnd[axis]];
              if (Math.abs(snappedEnd[axis] - start[axis]) >= least) return [start[axis], snappedEnd[axis]];
              return [start[axis], end[axis]];
            };
            const [sx, ex] = pick('x');
            const [sy, ey] = pick('y');
            start = { x: sx, y: sy };
            end = { x: ex, y: ey };
          }
          const isTable = g.nodeType === 'table';
          if (isTable) {
            // A table's height follows its rows, so a drag only sets its width (at least the
            // minimum, growing away from the press) and the top stays at the press.
            const dx = end.x - start.x;
            end = { x: start.x + (dx < 0 ? -1 : 1) * Math.max(Math.abs(dx), minSizeFor('table').width), y: start.y };
          }
          // Shift's square skips snapping, except for tables, which Shift doesn't constrain.
          if (snap && (isTable || !e.shiftKey)) {
            const lines = { x: [start.x, end.x], y: isTable ? [start.y] : [start.y, end.y] };
            guides = { lines: alignmentGuides(boxFromPoints(start, end), lines, boxes(g.targets)), spacing: [] };
          }
          onGuides(guides);
          const box = boxFromPoints(start, end);
          const flipped = end.x - start.x >= 0 !== end.y - start.y >= 0;
          if (!g.nodeId) {
            const node = createNode(g.nodeType, box, nodes, tableIdType);
            if (node.type === 'line') node.flipped = flipped;
            g.nodeId = node.id;
            g.targets.changing.add(node.id);
            // The parent comes from where the user pressed, not the snapped corner: a corner
            // snapped onto a frame's edge would otherwise nest a shape drawn beside the frame.
            dispatch({ type: 'addNode', node, parentAt: g.startWorld });
          } else {
            const patch: NodePatch = g.nodeType === 'line' ? { ...box, flipped } : box;
            dispatch({ type: 'updateNodes', patches: { [g.nodeId]: patch } });
          }
          return;
        }
        case 'move': {
          if (!g.moved && dist < DRAG_THRESHOLD) return;
          if (!g.moved) {
            dispatch({ type: 'checkpoint' });
            g.moved = true;
          }
          g.last = world;
          let dx = world.x - g.startWorld.x;
          let dy = world.y - g.startWorld.y;
          let lockX = false;
          let lockY = false;
          if (e.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) [dy, lockY] = [0, true];
            else [dx, lockX] = [0, true];
          }
          const candidates = snap ? boxes(g.targets) : [];
          const snapAxis = (box: Box, axis: 'x' | 'y') =>
            nearer(snapOffset(boxLines(box, axis), candidates, axis, threshold), snapSpacing(box, candidates, axis, threshold));
          const shifted = { ...g.bounds, x: g.bounds.x + dx, y: g.bounds.y + dy };
          const sy = snap && !lockY ? snapAxis(shifted, 'y') : null;
          // Which layers share the mover's row depends on its y, so x spacing uses the snapped y.
          const sx = snap && !lockX ? snapAxis({ ...shifted, y: shifted.y + (sy ?? 0) }, 'x') : null;
          // Moves land on whole pixels, except on a snapped axis, where the target line may sit on a half pixel.
          const place = (v: number, d: number, offset: number | null) => (offset === null ? Math.round(v + d) : v + d + offset);
          const patches: Record<string, NodePatch> = {};
          g.origins.forEach((o, id) => {
            patches[id] = { x: place(o.x, dx, sx), y: place(o.y, dy, sy) };
          });
          dispatch({ type: 'updateNodes', patches });
          // Guides measure where the layers actually land, after each one's own rounding.
          const moved = snap
            ? unionBoxes(g.tops.map((n) => rotatedBounds({ ...n, x: place(n.x, dx, sx), y: place(n.y, dy, sy) }, n.rotation)))
            : null;
          onGuides(
            moved
              ? {
                  lines: alignmentGuides(moved, { x: boxLines(moved, 'x'), y: boxLines(moved, 'y') }, candidates),
                  spacing: spacingGuides(moved, candidates),
                }
              : NO_GUIDES,
          );
          return;
        }
        case 'resize': {
          if (!g.moved && dist < 1) return;
          if (!g.moved) {
            dispatch({ type: 'checkpoint' });
            g.moved = true;
          }
          const delta = { x: world.x - g.startWorld.x, y: world.y - g.startWorld.y };
          const minSize = minSizeFor(g.node.type);
          let box = resizeBox(g.node, g.node.rotation, g.handle, delta, minSize);
          let guides = NO_GUIDES;
          // A rotated layer's edges don't run along the axes, so they can't line up with a guide.
          if (snap && g.node.rotation === 0) {
            const candidates = boxes(g.targets);
            const lines: { x: number[]; y: number[] } = { x: [], y: [] };
            if (g.handle.dx !== 0) {
              const edge = g.handle.dx < 0 ? box.x : box.x + box.width;
              const off = snapOffset([edge], candidates, 'x', threshold);
              if (off !== null && box.width + g.handle.dx * off >= minSize.width) {
                box = g.handle.dx < 0 ? { ...box, x: box.x + off, width: box.width - off } : { ...box, width: box.width + off };
              }
              lines.x.push(g.handle.dx < 0 ? box.x : box.x + box.width);
            }
            if (g.handle.dy !== 0) {
              const edge = g.handle.dy < 0 ? box.y : box.y + box.height;
              const off = snapOffset([edge], candidates, 'y', threshold);
              if (off !== null && box.height + g.handle.dy * off >= minSize.height) {
                box = g.handle.dy < 0 ? { ...box, y: box.y + off, height: box.height - off } : { ...box, height: box.height + off };
              }
              lines.y.push(g.handle.dy < 0 ? box.y : box.y + box.height);
            }
            guides = { lines: alignmentGuides(box, lines, candidates), spacing: [] };
          }
          onGuides(guides);
          dispatch({ type: 'transformNode', id: g.node.id, box });
          return;
        }
        case 'rotate': {
          if (!g.moved && dist < 1) return;
          if (!g.moved) {
            dispatch({ type: 'checkpoint' });
            g.moved = true;
          }
          const snap = e.shiftKey ? ROTATION_SNAP : undefined;
          const rotation = dragRotation(g.node.rotation, boxCenter(g.node), g.startWorld, world, snap);
          dispatch({ type: 'transformNode', id: g.node.id, box: { rotation } });
          return;
        }
        case 'reorder': {
          if (g.slot === null && dist < DRAG_THRESHOLD) return;
          const table = nodes.find((n) => n.id === g.tableId);
          if (table?.type !== 'table') return;
          const slot = Math.round((world.y - table.y - TABLE_HEADER_HEIGHT) / TABLE_ROW_HEIGHT);
          g.slot = Math.max(0, Math.min(table.columns.length, slot));
          // Just above or below the row itself it wouldn't move, so no drop line.
          const from = table.columns.findIndex((c) => c.id === g.columnId);
          onRowDrop(g.slot === from || g.slot === from + 1 ? null : { tableId: table.id, index: g.slot });
          return;
        }
        case 'marquee': {
          if (!g.moved && dist < DRAG_THRESHOLD) return;
          g.moved = true;
          const box = boxFromPoints(g.startWorld, world);
          const byId = byIdOf(nodes);
          // Groups have no body of their own: they are hit through their children.
          const hits = nodes
            .filter((n) => n.type !== 'group' && isEffectivelyVisible(byId, n))
            .filter((n) => boxesIntersect(box, rotatedBounds(n, n.rotation)))
            .map((n) => selectTarget(byId, n.id, new Set()));
          onMarquee({ box });
          dispatch({ type: 'select', ids: topLevelIds(byId, Array.from(new Set([...g.base, ...hits]))) });
          return;
        }
      }
    },
    [dispatch, onGuides, onMarquee, onRowDrop, snapToLayers, stateRef, tableIdType, toLocal],
  );

  const handleUp = useCallback((e: PointerEvent) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    onGuides(NO_GUIDES);

    if (g.kind === 'move' && g.moved) {
      // Same undo step as the move: the drag already checkpointed.
      dispatch({ type: 'dropSelectionAt', point: screenToWorld(toLocal(e), stateRef.current.viewport) });
    }
    if (g.kind === 'move' && !g.moved && g.clickColumn) dispatch({ type: 'selectColumn', ...g.clickColumn });
    if (g.kind === 'reorder') {
      onRowDrop(null);
      const table = stateRef.current.nodes.find((n) => n.id === g.tableId);
      const from = table?.type === 'table' ? table.columns.findIndex((c) => c.id === g.columnId) : -1;
      if (g.slot !== null && from >= 0) {
        // A slot below the row's own position counts the row itself, which moves out first.
        const toIndex = g.slot > from ? g.slot - 1 : g.slot;
        dispatch({ type: 'editTable', id: g.tableId, edit: { kind: 'moveColumn', columnId: g.columnId, toIndex } });
      }
    }
    if (g.kind === 'create') {
      if (!g.nodeId) {
        // A click without a drag places a default-sized node at the pointer.
        const size = DEFAULT_SIZE[g.nodeType];
        const node = createNode(g.nodeType, { x: g.startWorld.x, y: g.startWorld.y, ...size }, stateRef.current.nodes, tableIdType);
        dispatch({ type: 'addNode', node, parentAt: g.startWorld });
        if (node.type === 'text') onEditText(node.id);
      }
      dispatch({ type: 'setTool', tool: 'select' });
    }
    if (g.kind === 'marquee') onMarquee(null);
  }, [dispatch, onEditText, onGuides, onMarquee, onRowDrop, stateRef, tableIdType, toLocal]);

  // A cancelled pointer (a pen or touch interruption) reports no real release point, so the
  // gesture stops where it stands: a press never becomes a click-to-place, and a move drops
  // where the pointer last was, so a layer dragged out of its frame isn't left clipped away.
  const handleCancel = useCallback(() => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    onGuides(NO_GUIDES);
    if (g.kind === 'move' && g.moved) dispatch({ type: 'dropSelectionAt', point: g.last });
    if (g.kind === 'marquee') onMarquee(null);
    if (g.kind === 'reorder') onRowDrop(null);
    if (g.kind === 'create' && g.nodeId) dispatch({ type: 'setTool', tool: 'select' });
  }, [dispatch, onGuides, onMarquee, onRowDrop]);

  // Window-level listeners stay registered for the hook's lifetime and read the
  // latest handlers from refs, so a re-render mid-drag can never orphan them.
  const moveRef = useLatest(handleMove);
  const upRef = useLatest(handleUp);
  const cancelRef = useLatest(handleCancel);
  useEffect(() => {
    const move = (e: PointerEvent) => moveRef.current(e);
    const up = (e: PointerEvent) => upRef.current(e);
    const cancel = () => cancelRef.current();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [cancelRef, moveRef, upRef]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const { tool, viewport, nodes, selection } = stateRef.current;
      const screen = toLocal(e);
      const world = screenToWorld(screen, viewport);
      const target = e.target as Element;
      const nodeEl = target.closest('[data-node-id]');
      const handleEl = target.closest('[data-handle]');
      const rotateEl = target.closest('[data-rotate-handle]');
      const rowHandleEl = target.closest('[data-row-handle]');
      let gesture: Gesture | null = null;

      if (e.button === 1 || tool === 'hand' || spacePressed) {
        gesture = { kind: 'pan', start: screen, startViewport: viewport };
      } else if (e.button !== 0) {
        return;
      } else if (isShapeTool(tool)) {
        const targets = { changing: new Set<string>(), viewport: null, canvasSize: null, boxes: [] };
        gesture = { kind: 'create', nodeType: tool, start: screen, startWorld: world, nodeId: null, targets };
      } else if (rowHandleEl && selection.length === 1) {
        const columnId = rowHandleEl.getAttribute('data-row-handle');
        const tableId = selection[0] as string;
        if (columnId) gesture = { kind: 'reorder', start: screen, tableId, columnId, slot: null };
      } else if (handleEl && selection.length === 1) {
        const node = nodes.find((n) => n.id === selection[0]);
        const dir = HANDLES.find((h) => h.id === handleEl.getAttribute('data-handle'));
        if (node && dir) {
          // A group's children scale with it, so they can't be snap targets; a frame's stay put.
          const changing = new Set([node.id, ...(node.type === 'group' ? descendantIds(nodes, [node.id]) : [])]);
          const targets = { changing, viewport: null, canvasSize: null, boxes: [] };
          gesture = { kind: 'resize', start: screen, startWorld: world, node, handle: dir, targets, moved: false };
        }
      } else if (rotateEl && selection.length === 1) {
        const node = nodes.find((n) => n.id === selection[0]);
        if (node && node.type !== 'group') gesture = { kind: 'rotate', start: screen, startWorld: world, node, moved: false };
      } else if (nodeEl) {
        const byId = byIdOf(nodes);
        const hitId = nodeEl.getAttribute('data-node-id') ?? '';
        const id = selectTarget(byId, hitId, enteredScopes(byId, selection, false), e.metaKey || e.ctrlKey);
        let nextSelection = selection;
        if (e.shiftKey) {
          nextSelection = selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id];
        } else if (!selection.includes(id)) {
          nextSelection = [id];
        }
        dispatch({ type: 'select', ids: nextSelection });
        if (nextSelection.includes(id)) {
          // Containers carry their children; a layer and its ancestor never move twice.
          const top = topLevelIds(byId, nextSelection);
          const moving = new Set([...top, ...descendantIds(nodes, top)]);
          const origins = new Map<string, Point>();
          for (const n of nodes) if (moving.has(n.id)) origins.set(n.id, { x: n.x, y: n.y });
          const tops = top.flatMap((t) => byId.get(t) ?? []);
          const bounds = unionBoxes(tops.map((n) => rotatedBounds(n, n.rotation)));
          const columnId = target.closest('[data-column-id]')?.getAttribute('data-column-id');
          const pickColumn =
            columnId && !e.shiftKey && !e.metaKey && !e.ctrlKey && selection.length === 1 && selection[0] === id && byId.get(id)?.type === 'table';
          const clickColumn = pickColumn ? { tableId: id, columnId } : null;
          if (bounds) {
            const targets = { changing: moving, viewport: null, canvasSize: null, boxes: [] };
            gesture = { kind: 'move', start: screen, startWorld: world, origins, tops, bounds, targets, moved: false, last: world, clickColumn };
          }
        }
      } else {
        const base = e.shiftKey ? selection : [];
        if (!e.shiftKey) dispatch({ type: 'select', ids: [] });
        gesture = { kind: 'marquee', start: screen, startWorld: world, base, moved: false };
      }

      if (!gesture) return;
      e.preventDefault();
      gestureRef.current = gesture;
    },
    [dispatch, spacePressed, stateRef, toLocal],
  );

  const onDoubleClick = useCallback(
    (e: ReactMouseEvent) => {
      const { nodes, selection } = stateRef.current;
      const hitId = (e.target as Element).closest('[data-node-id]')?.getAttribute('data-node-id');
      if (!hitId) return;
      // Double-click goes one level into the selected group, or edits text.
      const byId = byIdOf(nodes);
      const id = selectTarget(byId, hitId, enteredScopes(byId, selection, true));
      const node = byId.get(id);
      if (!node) return;
      dispatch({ type: 'select', ids: [id] });
      if (node.type === 'text') onEditText(node.id);
      if (node.type === 'table' && id === hitId) {
        const target = e.target as Element;
        const columnId = target.closest('[data-column-id]')?.getAttribute('data-column-id');
        const world = screenToWorld(toLocal(e), stateRef.current.viewport);
        // The drawn name or type wins; between them, design choice: the right half is the type.
        const onType = target.closest('[data-testid=column-type]');
        const onName = target.closest('[data-testid=column-name]');
        const field = onType || (!onName && world.x > node.x + node.width / 2) ? 'column-type' : 'column-name';
        onEditTable(columnId ? { tableId: id, field, columnId } : { tableId: id, field: 'table-name' });
      }
    },
    [dispatch, onEditTable, onEditText, stateRef, toLocal],
  );

  // React registers wheel listeners as passive, so preventDefault needs a native listener.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { viewport } = stateRef.current;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED);
        dispatch({ type: 'setViewport', viewport: zoomAt(viewport, toLocal(e), viewport.zoom * factor) });
      } else {
        dispatch({ type: 'setViewport', viewport: { ...viewport, x: viewport.x - e.deltaX, y: viewport.y - e.deltaY } });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [containerRef, dispatch, stateRef, toLocal]);

  return { onPointerDown, onDoubleClick };
}
