import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  boxFromPoints,
  boxCenter,
  boxesIntersect,
  dragRotation,
  HANDLES,
  resizeBox,
  rotatedBounds,
  screenToWorld,
  zoomAt,
  type HandleDir,
} from '../geometry';
import { useLatest } from '../../shared/useLatest';
import type { EditorAction, EditorState } from '../model/editorReducer';
import { createNode, DEFAULT_SIZE, minSizeFor } from '../model/nodes';
import { byIdOf, descendantIds, enteredScopes, isEffectivelyVisible, selectTarget, topLevelIds } from '../model/tree';
import type { Box, DesignNode, DrawableType, NodePatch, Point, Viewport } from '../model/types';

/** Screen-pixel distance before a press becomes a drag. */
const DRAG_THRESHOLD = 3;
const WHEEL_ZOOM_SPEED = 0.01;
/** Design choice: Shift snaps a corner rotation to this many degrees. */
const ROTATION_SNAP = 15;

type Gesture =
  | { kind: 'pan'; start: Point; startViewport: Viewport }
  | { kind: 'create'; nodeType: DrawableType; start: Point; startWorld: Point; nodeId: string | null }
  | { kind: 'move'; start: Point; startWorld: Point; origins: Map<string, Point>; moved: boolean }
  | { kind: 'resize'; start: Point; startWorld: Point; node: DesignNode; handle: HandleDir; moved: boolean }
  | { kind: 'rotate'; start: Point; startWorld: Point; node: DesignNode; moved: boolean }
  | { kind: 'marquee'; start: Point; startWorld: Point; base: string[]; moved: boolean };

export interface Marquee {
  box: Box;
}

interface Options {
  containerRef: RefObject<HTMLDivElement | null>;
  state: EditorState;
  dispatch: (action: EditorAction) => void;
  spacePressed: boolean;
  onMarquee: (marquee: Marquee | null) => void;
  onEditText: (id: string) => void;
}

const isShapeTool = (tool: string): tool is DrawableType =>
  tool === 'frame' || tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'text';

/**
 * Pointer state machine for the canvas. Listens on window during a drag so
 * releasing outside the canvas still ends the gesture (no pointer capture
 * needed, which also keeps synthetic test events working).
 */
export function useCanvasGestures({ containerRef, state, dispatch, spacePressed, onMarquee, onEditText }: Options) {
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
      const screen = toLocal(e);
      const world = screenToWorld(screen, viewport);
      const dist = Math.hypot(screen.x - g.start.x, screen.y - g.start.y);

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
          let end = world;
          if (e.shiftKey) {
            const size = Math.max(Math.abs(world.x - g.startWorld.x), Math.abs(world.y - g.startWorld.y));
            end = {
              x: g.startWorld.x + Math.sign(world.x - g.startWorld.x || 1) * size,
              y: g.startWorld.y + Math.sign(world.y - g.startWorld.y || 1) * size,
            };
          }
          const box = boxFromPoints(g.startWorld, end);
          const flipped = end.x - g.startWorld.x >= 0 !== end.y - g.startWorld.y >= 0;
          if (!g.nodeId) {
            const node = createNode(g.nodeType, box, nodes);
            if (node.type === 'line') node.flipped = flipped;
            g.nodeId = node.id;
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
          let dx = world.x - g.startWorld.x;
          let dy = world.y - g.startWorld.y;
          if (e.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) dy = 0;
            else dx = 0;
          }
          const patches: Record<string, NodePatch> = {};
          g.origins.forEach((o, id) => {
            patches[id] = { x: Math.round(o.x + dx), y: Math.round(o.y + dy) };
          });
          dispatch({ type: 'updateNodes', patches });
          return;
        }
        case 'resize': {
          if (!g.moved && dist < 1) return;
          if (!g.moved) {
            dispatch({ type: 'checkpoint' });
            g.moved = true;
          }
          const delta = { x: world.x - g.startWorld.x, y: world.y - g.startWorld.y };
          const box = resizeBox(g.node, g.node.rotation, g.handle, delta, minSizeFor(g.node.type));
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
    [dispatch, onMarquee, stateRef, toLocal],
  );

  const handleUp = useCallback((e: PointerEvent) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;

    if (g.kind === 'move' && g.moved) {
      // Same undo step as the move: the drag already checkpointed.
      dispatch({ type: 'dropSelectionAt', point: screenToWorld(toLocal(e), stateRef.current.viewport) });
    }
    if (g.kind === 'create') {
      if (!g.nodeId) {
        // A click without a drag places a default-sized node at the pointer.
        const size = DEFAULT_SIZE[g.nodeType];
        const node = createNode(g.nodeType, { x: g.startWorld.x, y: g.startWorld.y, ...size }, stateRef.current.nodes);
        dispatch({ type: 'addNode', node, parentAt: g.startWorld });
        if (node.type === 'text') onEditText(node.id);
      }
      dispatch({ type: 'setTool', tool: 'select' });
    }
    if (g.kind === 'marquee') onMarquee(null);
  }, [dispatch, onEditText, onMarquee, stateRef, toLocal]);

  // Window-level listeners stay registered for the hook's lifetime and read the
  // latest handlers from refs, so a re-render mid-drag can never orphan them.
  const moveRef = useLatest(handleMove);
  const upRef = useLatest(handleUp);
  useEffect(() => {
    const move = (e: PointerEvent) => moveRef.current(e);
    const up = (e: PointerEvent) => upRef.current(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [moveRef, upRef]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const { tool, viewport, nodes, selection } = stateRef.current;
      const screen = toLocal(e);
      const world = screenToWorld(screen, viewport);
      const target = e.target as Element;
      const nodeEl = target.closest('[data-node-id]');
      const handleEl = target.closest('[data-handle]');
      const rotateEl = target.closest('[data-rotate-handle]');
      let gesture: Gesture | null = null;

      if (e.button === 1 || tool === 'hand' || spacePressed) {
        gesture = { kind: 'pan', start: screen, startViewport: viewport };
      } else if (e.button !== 0) {
        return;
      } else if (isShapeTool(tool)) {
        gesture = { kind: 'create', nodeType: tool, start: screen, startWorld: world, nodeId: null };
      } else if (handleEl && selection.length === 1) {
        const node = nodes.find((n) => n.id === selection[0]);
        const dir = HANDLES.find((h) => h.id === handleEl.getAttribute('data-handle'));
        if (node && dir) gesture = { kind: 'resize', start: screen, startWorld: world, node, handle: dir, moved: false };
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
          gesture = { kind: 'move', start: screen, startWorld: world, origins, moved: false };
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
    },
    [dispatch, onEditText, stateRef],
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
