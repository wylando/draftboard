import { boxCenter, HANDLES, rotatedBounds, rotatePoint, unionBoxes, worldToScreen } from '../geometry';
import type { SnapGuide } from '../geometry';
import type { Box, DesignNode, Point, Viewport } from '../model/types';
import { css } from 'styled-system/css';
import { token } from 'styled-system/tokens';

// SVG presentation attributes take CSS variables, resolved from semantic tokens.
const SELECTION = token.var('colors.selection');
const SELECTION_FILL = token.var('colors.selection.fill');
const HANDLE_FILL = token.var('colors.bg');
const GUIDE = token.var('colors.selection.guide');

const HANDLE_SIZE = 8;
const ROTATE_ZONE_SIZE = 16;
/** Half the size of the × drawn where a guide meets an aligned edge or center. */
const GUIDE_MARK = 3;

// CSS has no rotate cursor keyword. Cursor images can't read CSS variables, so the
// arrow uses fixed black-on-white, which stays visible on any canvas or theme.
const rotateZoneClass = css({
  cursor:
    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'%3E%3Cg fill=\'none\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M12 6a6 6 0 1 1-6 6\' stroke=\'white\' stroke-width=\'4\'/%3E%3Cpath d=\'M3 12h6l-3-4z\' fill=\'white\' stroke=\'white\' stroke-width=\'2\'/%3E%3Cpath d=\'M12 6a6 6 0 1 1-6 6\' stroke=\'black\' stroke-width=\'1.5\'/%3E%3Cpath d=\'M3 12h6l-3-4z\' fill=\'black\'/%3E%3C/g%3E%3C/svg%3E") 12 12, crosshair',
});

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

function GuideLine({ guide, viewport }: { guide: SnapGuide; viewport: Viewport }) {
  const along = (m: number): Point =>
    worldToScreen(guide.axis === 'x' ? { x: guide.at, y: m } : { x: m, y: guide.at }, viewport);
  const start = along(Math.min(...guide.marks));
  const end = along(Math.max(...guide.marks));
  return (
    <g data-testid="snap-guide" data-axis={guide.axis} data-at={guide.at} stroke={GUIDE} strokeWidth={1} pointerEvents="none">
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
      {guide.marks.map((m, i) => {
        const p = along(m);
        return (
          <path
            key={i}
            d={`M${p.x - GUIDE_MARK} ${p.y - GUIDE_MARK}L${p.x + GUIDE_MARK} ${p.y + GUIDE_MARK}M${p.x + GUIDE_MARK} ${p.y - GUIDE_MARK}L${p.x - GUIDE_MARK} ${p.y + GUIDE_MARK}`}
          />
        );
      })}
    </g>
  );
}

interface Props {
  selected: DesignNode[];
  viewport: Viewport;
  marquee: Box | null;
  guides: SnapGuide[];
  hideHandles: boolean;
}

/** Drawn in screen space so outlines and handles stay a constant size at any zoom. */
export function SelectionOverlay({ selected, viewport, marquee, guides, hideHandles }: Props) {
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

      {/* Before the resize handles, so a handle wins where the two overlap. Groups keep rotation 0. */}
      {single &&
        !hideHandles &&
        single.type !== 'group' &&
        HANDLES.filter((h) => h.dx !== 0 && h.dy !== 0).map((h) => {
          const c = boxCenter(single);
          const corner = { x: c.x + (h.dx * single.width) / 2, y: c.y + (h.dy * single.height) / 2 };
          const p = worldToScreen(rotatePoint(corner, single.rotation, c), viewport);
          return (
            <rect
              key={`rotate-${h.id}`}
              data-rotate-handle={h.id}
              data-testid={`rotate-${h.id}`}
              className={rotateZoneClass}
              x={h.dx < 0 ? p.x - ROTATE_ZONE_SIZE : p.x}
              y={h.dy < 0 ? p.y - ROTATE_ZONE_SIZE : p.y}
              width={ROTATE_ZONE_SIZE}
              height={ROTATE_ZONE_SIZE}
              transform={`rotate(${single.rotation} ${p.x} ${p.y})`}
              fill="transparent"
            />
          );
        })}

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

      {guides.map((g) => (
        <GuideLine key={`${g.axis}-${g.at}`} guide={g} viewport={viewport} />
      ))}

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
