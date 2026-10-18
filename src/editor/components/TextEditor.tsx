import { useEffect, useRef, useState } from 'react';
import { worldToScreen } from '../geometry';
import type { TextNode, Viewport } from '../model/types';
import { CANVAS_FONT_FAMILY, TEXT_LINE_HEIGHT } from '../textMetrics';
import { css } from 'styled-system/css';

// Position, size and font are per-node and zoom-dependent, so they stay inline.
const editorClass = css({
  position: 'absolute',
  margin: '0',
  padding: '0',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'selection',
  outline: 'none',
  bg: 'transparent',
  resize: 'none',
  overflow: 'hidden',
  whiteSpace: 'pre',
  transformOrigin: 'top left',
});

interface Props {
  node: TextNode;
  viewport: Viewport;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/** HTML textarea laid over the SVG text node while it is being edited. */
export function TextEditor({ node, viewport, onCommit, onCancel }: Props) {
  const [value, setValue] = useState(node.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef(false);
  // Enter commits, then the unmount triggers blur; only the first one counts.
  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };
  const p = worldToScreen(node, viewport);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <textarea
      ref={ref}
      data-testid="text-editor"
      className={editorClass}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') finish(false);
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        }
      }}
      style={{
        left: p.x,
        top: p.y,
        minWidth: Math.max(node.width, 20) * viewport.zoom + 8,
        height: (value.split('\n').length * node.fontSize * TEXT_LINE_HEIGHT + 4) * viewport.zoom,
        fontSize: node.fontSize * viewport.zoom,
        lineHeight: TEXT_LINE_HEIGHT,
        fontFamily: CANVAS_FONT_FAMILY,
        color: node.fill,
        transform: `rotate(${node.rotation}deg)`,
      }}
    />
  );
}
