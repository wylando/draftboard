import { boxCenter, HANDLES, rotatedBounds, rotatePoint, unionBoxes, worldToScreen } from '../geometry';
import type { Box, DesignNode, Viewport } from '../model/types';
import { token } from 'styled-system/tokens';

// SVG presentation attributes take CSS variables, resolved from semantic tokens.
const SELECTION = token.var('colors.selection');
const SELECTION_FILL = token.var('colors.selection.fill');
const HANDLE_FILL = token.var('colors.bg');

const HANDLE_SIZE = 8;

function outline(node: DesignNode, vp: Viewport): string {
  const c = boxCenter(node);
  return [
    { x: node.x, y: node.y },
    { x: node.x + node.width, y: node.y },
    { x: node.x + node.width, y: node.y + node.height },
    { x: node.x, y: node.y + node.height },
  ]
    .map((p) => worldToScreen(rotatePoint(p, node.rotation, c), vp))
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
}

interface Props {
  selected: DesignNode[];
  viewport: Viewport;
  marquee: Box | null;
  hideHandles: boolean;
}

/** Drawn in screen space so outlines and handles stay a constant size at any zoom. */
export function SelectionOverlay({ selected, viewport, marquee, hideHandles }: Props) {
  const single = selected.length === 1 ? selected[0] : undefined;
  const group = selected.length > 1 ? unionBoxes(selected.map((n) => rotatedBounds(n, n.rotation))) : null;

  return (
    <g data-testid="selection-overlay">
      {selected.map((n) => (
        <polygon key={n.id} points={outline(n, viewport)} fill="none" stroke={SELECTION} strokeWidth={1} pointerEvents="none" />
      ))}

      {group && (
        <rect
          x={group.x * viewport.zoom + viewport.x}
          y={group.y * viewport.zoom + viewport.y}
          width={group.width * viewport.zoom}
          height={group.height * viewport.zoom}
          fill="none"
          stroke={SELECTION}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      )}

      {single &&
        !hideHandles &&
        HANDLES.map((h) => {
          const c = boxCenter(single);
          const local = { x: c.x + (h.dx * single.width) / 2, y: c.y + (h.dy * single.height) / 2 };
          const p = worldToScreen(rotatePoint(local, single.rotation, c), viewport);
          return (
            <rect
              key={h.id}
              data-handle={h.id}
              data-testid={`handle-${h.id}`}
              x={p.x - HANDLE_SIZE / 2}
              y={p.y - HANDLE_SIZE / 2}
              width={HANDLE_SIZE}
              height={HANDLE_SIZE}
              fill={HANDLE_FILL}
              stroke={SELECTION}
              style={{ cursor: h.cursor }}
            />
          );
        })}

      {marquee && (
        <rect
          data-testid="marquee"
          x={marquee.x * viewport.zoom + viewport.x}
          y={marquee.y * viewport.zoom + viewport.y}
          width={marquee.width * viewport.zoom}
          height={marquee.height * viewport.zoom}
          fill={SELECTION_FILL}
          stroke={SELECTION}
          pointerEvents="none"
        />
      )}
    </g>
  );
}
