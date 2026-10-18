import { useEffect, useRef, useState } from 'react';
import { worldToScreen } from '../geometry';
import type { Box, Viewport } from '../model/types';
import { CANVAS_FONT_FAMILY, LABEL_PADDING, TEXT_LINE_HEIGHT } from '../textMetrics';
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
// A shape label wraps inside the box and is centered, matching how NodeView draws it.
const labelEditorClass = css({ whiteSpace: 'pre-wrap', textAlign: 'center', transformOrigin: 'center' });

interface Props {
  text: string;
  /** The node's box and rotation. */
  box: Box & { rotation: number };
  fontSize: number;
  color: string;
  /** Label mode: fill the box and center the text. Otherwise hug the text from the top-left. */
  label: boolean;
  viewport: Viewport;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/** HTML textarea laid over a text node, or a shape's label, while it is being edited. */
export function TextEditor({ text, box, fontSize, color, label, viewport, onCommit, onCancel }: Props) {
  const [value, setValue] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef(false);
  // Enter commits, then the unmount triggers blur; only the first one counts.
  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };
  const p = worldToScreen(box, viewport);
  const z = viewport.zoom;
  const size = label
    ? { width: box.width * z, height: box.height * z, padding: LABEL_PADDING * z }
    : {
        minWidth: Math.max(box.width, 20) * z + 8,
        height: (value.split('\n').length * fontSize * TEXT_LINE_HEIGHT + 4) * z,
      };

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <textarea
      ref={ref}
      data-testid="text-editor"
      className={label ? `${editorClass} ${labelEditorClass}` : editorClass}
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
        ...size,
        fontSize: fontSize * z,
        lineHeight: TEXT_LINE_HEIGHT,
        fontFamily: CANVAS_FONT_FAMILY,
        color,
        transform: `rotate(${box.rotation}deg)`,
      }}
    />
  );
}
