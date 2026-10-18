import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor } from '../EditorContext';
import { useCanvasGestures, type Marquee } from '../hooks/useCanvasGestures';
import type { TextNode } from '../model/types';
import { CANVAS_FONT_FAMILY, measureText } from '../textMetrics';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);

  // Track canvas size for zoom-to-center and zoom-to-fit.
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

  // Holding space temporarily switches to panning.
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target)) {
        e.preventDefault();
        setSpacePressed(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpacePressed(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onEditText = useCallback((id: string) => setEditingId(id), []);
  const { onPointerDown, onDoubleClick } = useCanvasGestures({
    containerRef,
    state,
    dispatch,
    spacePressed,
    onMarquee: setMarquee,
    onEditText,
  });

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
  const selectedSet = new Set(selection);
  const selected = nodes.filter((n) => selectedSet.has(n.id) && n.visible);
  const cursor = spacePressed ? 'grab' : (TOOL_CURSORS[tool] ?? 'crosshair');

  return (
    <div
      ref={containerRef}
      className={canvasClass}
      data-testid="canvas"
      data-tool={tool}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <svg className={svgClass} width="100%" height="100%">
        <g
          data-testid="world"
          data-zoom={viewport.zoom}
          transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}
        >
          {nodes.map((n) => (
            <NodeView key={n.id} node={n} hidden={n.id === editingId} />
          ))}
          {nodes.map((n) => (
            <FrameLabel key={`label-${n.id}`} node={n} zoom={viewport.zoom} />
          ))}
        </g>
        <SelectionOverlay
          selected={selected}
          viewport={viewport}
          marquee={marquee?.box ?? null}
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
