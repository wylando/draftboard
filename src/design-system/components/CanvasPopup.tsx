import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { popup } from 'styled-system/recipes';
import { icons } from '../icons';
import { IconButton } from './IconButton';

export interface CanvasPopupProps {
  title: string;
  onClose: () => void;
  /**
   * Where the card goes: its top-left corner for a card of `size` inside `area`, both in the canvas's own
   * coordinates. Called after every render, so the card follows what it describes.
   */
  place: (size: { width: number; height: number }, area: { x: number; y: number; width: number; height: number }) => { x: number; y: number };
  testId?: string;
  children: ReactNode;
}

/**
 * A non-modal card over the canvas, rendered inside the canvas element. It never takes focus by itself;
 * keyboard users reach its close button by Tab.
 */
export function CanvasPopup({ title, onClose, place, testId, children }: CanvasPopupProps) {
  const classes = popup();
  const titleId = useId();
  const areaRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);

  // Measured and moved before paint, by style rather than state: the size is only known once rendered,
  // and a state round trip would show the card in the wrong place for a frame.
  useLayoutEffect(() => {
    const area = areaRef.current;
    const card = cardRef.current;
    if (!area || !card) return;
    const box = { x: area.offsetLeft, y: area.offsetTop, width: area.clientWidth, height: area.clientHeight };
    const at = place({ width: card.offsetWidth, height: card.offsetHeight }, box);
    card.style.left = `${at.x - box.x}px`;
    card.style.top = `${at.y - box.y}px`;
  });

  return (
    <div ref={areaRef} className={classes.positioner}>
      <aside
        ref={cardRef}
        className={classes.content}
        aria-labelledby={titleId}
        data-testid={testId}
        data-canvas-popup=""
        // The canvas starts gestures on these, and a press on empty canvas clears the selection.
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {/* A header, so Space presses the close button instead of panning the canvas (Canvas exempts headers). */}
        <header className={classes.header}>
          <h2 id={titleId} className={classes.title}>{title}</h2>
          <IconButton tone="dark" label="Close" icon={<icons.close />} onClick={onClose} data-testid={testId && `${testId}-close`} />
        </header>
        <div className={classes.body}>{children}</div>
      </aside>
    </div>
  );
}
