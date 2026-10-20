import { boxCenter, HANDLES, rotatedBounds, rotatePoint, unionBoxes, worldToScreen } from '../geometry';
import type { Guides, SnapGuide, Span } from '../geometry';
import { TABLE_ROW_HEIGHT, tableRowTop, type RowDrop } from '../model/table';
import type { Box, DesignNode, Point, Viewport } from '../model/types';
import { css } from 'styled-system/css';
import { token } from 'styled-system/tokens';

// SVG presentation attributes take CSS variables, resolved from semantic tokens.
const SELECTION = token.var('colors.selection');
const SELECTION_FILL = token.var('colors.selection.fill');
const HANDLE_FILL = token.var('colors.bg');
const GUIDE = token.var('colors.selection.guide');
const GUIDE_TEXT = token.var('colors.selection.guideText');

const HANDLE_SIZE = 8;
const ROTATE_ZONE_SIZE = 16;
/** Row grips sit this far left of a selected table, outside it, so a press on a row still moves the table. */
const ROW_GRIP = { offset: 16, width: 10, height: 16, minHeight: 6 } as const;
const rowGripClass = css({ cursor: 'grab' });
/** Half the size of the × drawn where a guide meets an aligned edge or center. */
const GUIDE_MARK = 3;
/** Distance labels: font size and pill height in screen px; width is estimated per character. */
const LABEL_FONT = 10;
const LABEL_HEIGHT = 16;
const LABEL_CHAR_WIDTH = 6;

/** Whole pixels, or one decimal for a span that ends on a fraction (centering can make halves). */
const formatDistance = (d: number) => String(Math.round(d * 10) / 10);

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

/** A span with an end tick at each side and its length in a pill at the middle. */
function SpanLine({ span, viewport, ...data }: { span: Span; viewport: Viewport; 'data-testid': string; 'data-axis'?: string; 'data-distance'?: string }) {
  const at = (v: number): Point => worldToScreen(span.axis === 'x' ? { x: v, y: span.at } : { x: span.at, y: v }, viewport);
  const a = at(span.from);
  const b = at(span.to);
  const tick = (p: Point) =>
    span.axis === 'x' ? `M${p.x} ${p.y - GUIDE_MARK}V${p.y + GUIDE_MARK}` : `M${p.x - GUIDE_MARK} ${p.y}H${p.x + GUIDE_MARK}`;
  const label = formatDistance(span.to - span.from);
  const width = label.length * LABEL_CHAR_WIDTH + 8;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // A pill wider than the span on screen would cover the layers it measures.
  const fits = Math.hypot(b.x - a.x, b.y - a.y) >= (span.axis === 'x' ? width : LABEL_HEIGHT) + 4;
  return (
    <g {...data} stroke={GUIDE} strokeWidth={1} pointerEvents="none" aria-hidden="true">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      <path d={`${tick(a)}${tick(b)}`} />
      {fits && (
        <>
          <rect x={mid.x - width / 2} y={mid.y - LABEL_HEIGHT / 2} width={width} height={LABEL_HEIGHT} rx={LABEL_HEIGHT / 4} fill={GUIDE} stroke="none" />
          <text x={mid.x} y={mid.y} fill={GUIDE_TEXT} stroke="none" fontSize={LABEL_FONT} textAnchor="middle" dominantBaseline="central">
            {label}
          </text>
        </>
      )}
    </g>
  );
}

interface Props {
  selected: DesignNode[];
  viewport: Viewport;
  marquee: Box | null;
  guides: Guides;
  /** Alt-hover distances from the selection to `measureTarget`. */
  measures: { spans: Span[]; leaders: Span[] } | null;
  measureTarget: DesignNode | undefined;
  /** Column picked inside the selected table, highlighted when it still exists. */
  pickedColumnId: string | null;
  rowDrop: RowDrop | null;
  hideHandles: boolean;
}

/** Drawn in screen space so outlines and handles stay a constant size at any zoom. */
export function SelectionOverlay({ selected, viewport, marquee, guides, measures, measureTarget, pickedColumnId, rowDrop, hideHandles }: Props) {
  const single = selected.length === 1 ? selected[0] : undefined;
  const table = single?.type === 'table' ? single : undefined;
  const rowTop = (i: number) => (table ? tableRowTop(table, i) : 0);
  // Zoomed out, a full-size grip would reach into the neighbouring rows' grips; far out, rows are too thin to grab.
  const gripHeight = Math.min(ROW_GRIP.height, TABLE_ROW_HEIGHT * viewport.zoom - 2);
  const showGrips = gripHeight >= ROW_GRIP.minHeight;
  const pickedIndex = table && pickedColumnId ? table.columns.findIndex((c) => c.id === pickedColumnId) : -1;
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

      {/* Before the resize handles, so a handle wins where the two overlap. Groups and tables keep rotation 0. */}
      {single &&
        !hideHandles &&
        single.type !== 'group' &&
        single.type !== 'table' &&
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

      {/* A table's height follows its rows, so it only resizes sideways. */}
      {single &&
        !hideHandles &&
        HANDLES.filter((h) => single.type !== 'table' || h.dy === 0).map((h) => {
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

      {guides.lines.map((g) => (
        <GuideLine key={`${g.axis}-${g.at}`} guide={g} viewport={viewport} />
      ))}
      {guides.spacing.map((g) => (
        <g key={`${g.axis}-${g.distance}`} data-testid="spacing-guide" data-axis={g.axis} data-distance={formatDistance(g.distance)}>
          {g.gaps.map((gap) => (
            <SpanLine key={`${gap.from}-${gap.at}`} span={gap} viewport={viewport} data-testid="spacing-gap" />
          ))}
        </g>
      ))}
      {measureTarget && (
        <polygon data-testid="measure-target" points={outline(measureTarget, viewport)} fill="none" stroke={GUIDE} pointerEvents="none" />
      )}
      {measures?.leaders.map((l) => {
        const p = (v: number) => worldToScreen(l.axis === 'x' ? { x: v, y: l.at } : { x: l.at, y: v }, viewport);
        const [a, b] = [p(l.from), p(l.to)];
        return (
          <line
            key={`${l.axis}-${l.at}`}
            data-testid="measure-leader"
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={GUIDE}
            strokeDasharray="3 3"
            pointerEvents="none"
          />
        );
      })}
      {measures?.spans.map((m) => (
        <SpanLine
          key={`${m.axis}-${m.from}-${m.to}`}
          span={m}
          viewport={viewport}
          data-testid="distance-measure"
          data-axis={m.axis}
          data-distance={formatDistance(m.to - m.from)}
        />
      ))}

      {table && pickedIndex >= 0 && (
        <rect
          data-testid="selected-column"
          x={table.x * viewport.zoom + viewport.x}
          y={rowTop(pickedIndex) * viewport.zoom + viewport.y}
          width={table.width * viewport.zoom}
          height={TABLE_ROW_HEIGHT * viewport.zoom}
          fill={SELECTION_FILL}
          stroke={SELECTION}
          pointerEvents="none"
        />
      )}
      {table &&
        !hideHandles &&
        showGrips &&
        table.columns.map((c, i) => {
          const p = worldToScreen({ x: table.x, y: rowTop(i) + TABLE_ROW_HEIGHT / 2 }, viewport);
          const left = p.x - ROW_GRIP.offset;
          return (
            <g key={c.id} data-row-handle={c.id} data-testid="row-handle" className={rowGripClass}>
              <rect x={left} y={p.y - gripHeight / 2} width={ROW_GRIP.width} height={gripHeight} fill="transparent" />
              {(gripHeight >= ROW_GRIP.height ? [-4, 0, 4] : [0]).flatMap((dy) =>
                [3, 7].map((dx) => <circle key={`${dx}-${dy}`} cx={left + dx} cy={p.y + dy} r={1} fill={SELECTION} pointerEvents="none" />),
              )}
            </g>
          );
        })}
      {table && rowDrop?.tableId === table.id && (
        <line
          data-testid="row-drop-indicator"
          x1={table.x * viewport.zoom + viewport.x}
          x2={(table.x + table.width) * viewport.zoom + viewport.x}
          y1={rowTop(rowDrop.index) * viewport.zoom + viewport.y}
          y2={rowTop(rowDrop.index) * viewport.zoom + viewport.y}
          stroke={SELECTION}
          strokeWidth={2}
          pointerEvents="none"
        />
      )}

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
