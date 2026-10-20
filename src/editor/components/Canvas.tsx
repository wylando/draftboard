import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useDialogs } from '../../design-system';
import { useLatest } from '../../shared/useLatest';
import { useEditor } from '../EditorContext';
import { measureBetween, rotatedBounds, unionBoxes, type Guides } from '../geometry';
import { useCanvasGestures, type Marquee } from '../hooks/useCanvasGestures';
import { SQL_DIALECTS } from '../model/table';
import { byIdOf, childrenByParent, enteredScopes, isEffectivelyVisible, selectTarget } from '../model/tree';
import type { DesignNode, TextNode, Viewport } from '../model/types';
import { CANVAS_FONT_FAMILY, measureText } from '../textMetrics';
import { usePreferences } from '../../settings/preferences/PreferencesContext';
import { CanvasGrid } from './CanvasGrid';
import { FrameLabel, NodeView } from './NodeView';
import { SelectionOverlay } from './SelectionOverlay';
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

const TOOL_CURSORS: Record<string, string> = {
  select: 'default',
  hand: 'grab',
};

export function Canvas() {
  const { state, dispatch } = useEditor();
  const { gridStyle, snapToLayers, sqlDialect } = usePreferences().preferences;
  const containerRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [guides, setGuides] = useState<Guides>({ lines: [], spacing: [] });
  const [altPressed, setAltPressed] = useState(false);
  /**
   * The layer under a resting pointer, with the viewport and nodes it was hit
   * against: once either changes, the layer may no longer be under the pointer.
   */
  const [hover, setHover] = useState<{ hitId: string; viewport: Viewport; nodes: DesignNode[] } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const dialogOpen = useLatest(useDialogs().isOpen);

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
  });

  const onHover = (e: ReactPointerEvent) => {
    // Pointer events carry the real Alt state, which catches an Alt pressed outside the window.
    setAltPressed(e.altKey);
    const hitId = e.buttons === 0 ? (e.target as Element).closest('[data-node-id]')?.getAttribute('data-node-id') : null;
    const { viewport, nodes } = state;
    setHover((prev) =>
      !hitId ? null : prev?.hitId === hitId && prev.viewport === viewport && prev.nodes === nodes ? prev : { hitId, viewport, nodes },
    );
  };

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
  const byId = byIdOf(nodes);
  const selectedSet = new Set(selection);
  const selected = nodes.filter((n) => selectedSet.has(n.id) && isEffectivelyVisible(byId, n));
  const cursor = spacePressed ? 'grab' : (TOOL_CURSORS[tool] ?? 'crosshair');
  const hoverHit = hover && hover.viewport === viewport && hover.nodes === nodes ? hover.hitId : null;
  const measureId = altPressed && hoverHit && editingId === null ? selectTarget(byId, hoverHit, enteredScopes(byId, selection, false)) : null;
  const measureTarget = measureId && !selectedSet.has(measureId) ? byId.get(measureId) : undefined;
  const selectionBox = unionBoxes(selected.map((n) => rotatedBounds(n, n.rotation)));
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
      onPointerDown={onPointerDown}
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
          {(childrenOf.get(null) ?? []).map((n) => (
            <NodeView key={n.id} node={n} childrenOf={childrenOf} editingId={editingId} />
          ))}
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
          hideHandles={editingId !== null}
        />
      </svg>
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
