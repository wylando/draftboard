import { createContext, memo, useContext, type ReactNode } from 'react';
import { TABLE_COLORS, TABLE_HEADER_HEIGHT, TABLE_ROW_HEIGHT, TABLE_STYLE } from '../model/table';
import { isDark } from '../color';
import { isBroken } from '../model/connector';
import type { Cardinality, ConnectorNode, DesignNode, Point, TableNode } from '../model/types';
import { compactSizes, ellipsize, overviewAvail, overviewLabel, type TableDetail } from '../tableDetail';
import { CANVAS_FONT_FAMILY, CANVAS_MONO_FAMILY, measureText, TEXT_LINE_HEIGHT } from '../textMetrics';
import { css } from 'styled-system/css';
import { token } from 'styled-system/tokens';

/**
 * Facts about layers that come from other layers: which table columns are
 * foreign keys, and which of those join a column of an incompatible type.
 * Canvas derives them once per document change.
 */
export interface Relations {
  foreignKeys: ReadonlyMap<string, ReadonlySet<string>>;
  /** Foreign-key columns whose type doesn't fit the column they reference: "<tableId>:<columnId>" to a tooltip text. */
  typeMismatches: ReadonlyMap<string, string>;
  /** Connector ends ("<id>:from") on a table or a row, which always offer a marker to click. */
  relationalEnds: ReadonlySet<string>;
}

export const RelationsContext = createContext<Relations>({ foreignKeys: new Map(), typeMismatches: new Map(), relationalEnds: new Set() });

/**
 * Tables and connectors faded while a table's links are highlighted. UI only; its own context so that a selection
 * change re-renders the small wrapper per layer, not every layer.
 */
export const DimmedContext = createContext<ReadonlySet<string>>(new Set());
const DIMMED_OPACITY = 0.35;

function Dimmable({ id, children }: { id: string; children: ReactNode }) {
  const dimmed = useContext(DimmedContext).has(id);
  return (
    <g opacity={dimmed ? DIMMED_OPACITY : undefined} data-dimmed={dimmed || undefined}>
      {children}
    </g>
  );
}

const WARNING_BG = token.var('colors.warning.bg');
const WARNING_INK = token.var('colors.warning.ink');

/**
 * Design choice: crow's-foot marker size in world px: how far it reaches
 * along the line (within the route's 24 px stub), and its half-width.
 */
const MARKER = { reach: 20, foot: 12, half: 6, bar: 8, outer: 14, ring: 3 } as const;

/**
 * One end's marker, drawn from the end at `at` along `dir` (unit, into the line):
 * one = a bar, zero-or-one = a bar and a ring, many = a crow's foot, one-or-many
 * = a crow's foot and a bar. Squeezed to fit a first segment shorter than its
 * reach, so it never crosses a bend or reaches into the layer at the other end.
 */
function Marker({
  at,
  next,
  cardinality,
  end,
  node,
}: {
  at: Point;
  next: Point | undefined;
  cardinality: Cardinality;
  end: 'from' | 'to';
  node: ConnectorNode;
}) {
  const dir = direction(at, next);
  // On a one-segment route both ends share the segment, so each gets half.
  const length = next ? Math.hypot(next.x - at.x, next.y - at.y) : MARKER.reach;
  const room = node.points.length === 2 ? length / 2 : length;
  const k = Math.max(0, Math.min(1, (room - 2) / MARKER.reach));
  const n = { x: -dir.y, y: dir.x };
  const along = (t: number, side = 0) => ({
    x: at.x - node.x + dir.x * t * k + n.x * side * Math.max(k, 0.5),
    y: at.y - node.y + dir.y * t * k + n.y * side * Math.max(k, 0.5),
  });
  const line = (a: Point, b: Point) => `M${a.x} ${a.y}L${b.x} ${b.y}`;
  const bar = (t: number) => line(along(t, MARKER.half), along(t, -MARKER.half));
  const foot = [line(along(MARKER.foot), along(0, MARKER.half)), line(along(MARKER.foot), along(0)), line(along(MARKER.foot), along(0, -MARKER.half))].join('');
  const paths = {
    one: bar(MARKER.bar),
    zeroOrOne: bar(MARKER.bar),
    many: foot,
    oneOrMany: foot + bar(MARKER.outer),
    none: '',
  }[cardinality];
  const hit = [along(0, MARKER.half), along(MARKER.reach, MARKER.half), along(MARKER.reach, -MARKER.half), along(0, -MARKER.half)];
  return (
    <g data-testid="connector-marker" data-cardinality={cardinality} data-cardinality-end={end}>
      <polygon points={hit.map((p) => `${p.x},${p.y}`).join(' ')} fill="transparent" />
      {paths && <path d={paths} fill="none" stroke={node.stroke} strokeWidth={node.strokeWidth} />}
      {cardinality === 'zeroOrOne' && (
        <circle
          cx={along(MARKER.outer).x}
          cy={along(MARKER.outer).y}
          r={MARKER.ring * Math.max(k, 0.5)}
          fill={node.fill}
          stroke={node.stroke}
          strokeWidth={node.strokeWidth}
        />
      )}
    </g>
  );
}

/** Unit vector from `a` toward `b`; along +x when they coincide. */
function direction(a: Point, b: Point | undefined): Point {
  const dx = (b?.x ?? a.x + 1) - a.x;
  const dy = (b?.y ?? a.y) - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

const FRAME_LABEL_COLOR = token.var('colors.text.secondary');
const noSelectClass = css({ userSelect: 'none' });

/** Invisible stroke width (world px) that makes thin lines easy to grab. */
const LINE_HIT_WIDTH = 8;


/** `text`, cut short with an ellipsis if it is wider than `max` world px. */
function fitText(text: string, max: number, size: number, family: string, weight = 400): string {
  return ellipsize(text, max, (t) => measureText(t, size, family, weight).width);
}

/** The name of an overview card on a pill, centred at (x, y) and free to reach past a small card. */
function OverviewName({
  name,
  lines,
  size,
  scale,
  x,
  y,
  fill,
  stroke,
  ink,
}: {
  name: string;
  lines: string[];
  size: number;
  scale: number;
  x: number;
  y: number;
  fill: string;
  stroke: string;
  ink: string;
}) {
  const lineHeight = size * 1.2;
  const textWidth = Math.max(...lines.map((l) => measureText(l, size, CANVAS_FONT_FAMILY, 600).width));
  const padX = 4 / scale;
  const padY = 2 / scale;
  const height = lines.length * lineHeight + 2 * padY;
  // Never takes a press: past a small card it would cover neighbours, and over the card the table underneath is the target.
  return (
    <g data-testid="table-name-pill" className={noSelectClass} pointerEvents="none">
      <title>{name}</title>
      <rect
        x={x - textWidth / 2 - padX}
        y={y - height / 2}
        width={textWidth + 2 * padX}
        height={height}
        rx={4 / scale}
        fill={fill}
        stroke={stroke}
        strokeWidth={1 / scale}
        opacity={0.95}
      />
      <text data-testid="table-name" x={x} textAnchor="middle" dominantBaseline="central" fontFamily={CANVAS_FONT_FAMILY} fontSize={size} fontWeight={600} fill={ink}>
        {lines.map((line, i) => (
          <tspan key={i} x={x} y={y + (i - (lines.length - 1) / 2) * lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/** Amber dot just after a foreign-key row's badge (`x` is its centre, so it clears a wide PFK/UFK badge); off the connector, so it never crowds the route. */
function TypeMismatchMarker({ text, columnId, x, y }: { text: string; columnId: string; x: number; y: number }) {
  return (
    <g data-testid="type-mismatch" data-column-id={columnId} role="img" aria-label={text} transform={`translate(${x} ${y})`}>
      <title>{text}</title>
      <circle r={4.5} fill={WARNING_BG} stroke={WARNING_INK} strokeWidth={1.2} />
      <path d="M0 -2.5V0.5M0 2.5V2.6" stroke={WARNING_INK} strokeWidth={1.3} strokeLinecap="round" />
    </g>
  );
}

/**
 * Header with the table's name on its accent, then one row per column: key
 * badge, name, an index marker for indexed columns, and the type (with `?`
 * when nullable) right-aligned. When name and type don't both fit, the type
 * keeps what the name leaves (at least half the row) and the name the rest,
 * each cut short with an ellipsis rather than overlapping.
 */
function TableShape({ node, detail, scale }: { node: TableNode; detail: TableDetail; scale: number }) {
  const { width: w, height: h } = node;
  const compact = detail === 'compact';
  const overview = detail === 'overview';
  // Sized for the screen, not the card: a small card's label may be taller than it is.
  const label = overview
    ? overviewLabel(node.name, overviewAvail(w, scale, TABLE_STYLE.pad), scale, (t, size) => measureText(t, size, CANVAS_FONT_FAMILY, 600).width)
    : null;
  const sizes = compactSizes(scale);
  const nameSize = compact ? sizes.column : TABLE_STYLE.nameSize;
  const columnSize = compact ? sizes.column : TABLE_STYLE.columnSize;
  const badgeSize = compact ? sizes.badge : TABLE_STYLE.badgeSize;
  const clipId = `table-clip-${node.id}`;
  const indexed = new Set(node.indexes.flatMap((i) => i.columnIds));
  const relations = useContext(RelationsContext);
  const foreign = relations.foreignKeys.get(node.id);
  const headerDark = isDark(node.accent);
  const bodyDark = isDark(node.fill);
  const ink = bodyDark ? TABLE_COLORS.onDark : TABLE_COLORS.text;
  const muted = bodyDark ? TABLE_COLORS.onDarkMuted : TABLE_COLORS.muted;
  const text = { fontFamily: CANVAS_FONT_FAMILY, dominantBaseline: 'central', className: noSelectClass } as const;
  const nameX = TABLE_STYLE.pad + TABLE_STYLE.badgeWidth;
  const rowSpace = w - TABLE_STYLE.pad - nameX;
  const idxWidth = measureText('idx', badgeSize, CANVAS_FONT_FAMILY).width + TABLE_STYLE.gap;
  return (
    <>
      <clipPath id={clipId}>
        <rect width={w} height={h} rx={TABLE_STYLE.radius} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect data-testid="table-body" width={w} height={h} fill={node.fill} />
        <rect data-testid="table-header" width={w} height={TABLE_HEADER_HEIGHT} fill={node.accent} />
        {label ? (
          // A light wash of the accent, so a name-only card still reads as its table.
          <rect width={w} height={h - TABLE_HEADER_HEIGHT} y={TABLE_HEADER_HEIGHT} fill={node.accent} opacity={0.15} />
        ) : (
          <text
            {...text}
            data-testid="table-name"
            x={TABLE_STYLE.pad}
            y={TABLE_HEADER_HEIGHT / 2}
            fontSize={nameSize}
            fontWeight={600}
            fill={headerDark ? TABLE_COLORS.onDark : TABLE_COLORS.text}
          >
            {fitText(node.name, w - 2 * TABLE_STYLE.pad, nameSize, CANVAS_FONT_FAMILY, 600)}
          </text>
        )}
        {node.columns.map((c, i) => {
          const y = TABLE_HEADER_HEIGHT + i * TABLE_ROW_HEIGHT;
          const mid = y + TABLE_ROW_HEIGHT / 2;
          const isForeign = foreign?.has(c.id) ?? false;
          // One slot: a key that is also foreign shows both letters (PFK, UFK).
          const key = c.primaryKey ? 'P' : c.unique ? 'U' : '';
          const fullBadge = isForeign ? `${key}FK` : c.primaryKey ? 'PK' : c.unique ? 'UQ' : null;
          // Compact keeps only what says a column is a key of the relationships.
          const badge = compact && !fullBadge?.includes('PK') && !fullBadge?.includes('FK') ? null : fullBadge;
          const isIndexed = !compact && indexed.has(c.id);
          const nameSpace = rowSpace - TABLE_STYLE.gap - (isIndexed ? idxWidth : 0);
          const nameWidth = measureText(c.name, columnSize, CANVAS_FONT_FAMILY).width;
          const type = compact ? '' : fitText(`${c.dataType}${c.nullable ? '?' : ''}`, Math.max(rowSpace / 2, nameSpace - nameWidth), TABLE_STYLE.typeSize, CANVAS_MONO_FAMILY);
          const typeWidth = measureText(type, TABLE_STYLE.typeSize, CANVAS_MONO_FAMILY).width;
          const name = fitText(c.name, nameSpace - typeWidth, columnSize, CANVAS_FONT_FAMILY);
          return (
            <g key={c.id} data-testid="table-column" data-column-id={c.id}>
              {/* The whole row is hit, not just its glyphs, so a click or double-click anywhere in it finds the column. */}
              <rect y={y} width={w} height={TABLE_ROW_HEIGHT} fill="transparent" />
              {/* In the table's stroke, but at most a hairline: a heavy outline shouldn't make heavy rows. */}
              {i > 0 && node.strokeWidth > 0 && (
                <line data-testid="row-divider" x1={0} x2={w} y1={y} y2={y} stroke={node.stroke} strokeWidth={Math.min(node.strokeWidth, 1)} />
              )}
              {!overview && badge && (
                <text
                  {...text}
                  data-testid="column-badge"
                  x={TABLE_STYLE.pad}
                  y={mid}
                  fontSize={badgeSize}
                  fontWeight={700}
                  fill={bodyDark ? TABLE_COLORS.onDarkBadge : TABLE_COLORS.badge}
                >
                  {badge}
                </text>
              )}
              {!overview && isForeign && relations.typeMismatches.has(`${node.id}:${c.id}`) && (
                <TypeMismatchMarker
                  text={relations.typeMismatches.get(`${node.id}:${c.id}`) ?? ''}
                  columnId={c.id}
                  x={TABLE_STYLE.pad + (badge ? measureText(badge, badgeSize, CANVAS_FONT_FAMILY).width : 0) + 7}
                  y={mid}
                />
              )}
              {!overview && (
                <text {...text} data-testid="column-name" x={nameX} y={mid} fontSize={columnSize} fill={ink}>
                  {name}
                </text>
              )}
              {!overview && isIndexed && (
                <text
                  {...text}
                  data-testid="column-index"
                  x={nameX + measureText(name, columnSize, CANVAS_FONT_FAMILY).width + 6}
                  y={mid}
                  fontSize={badgeSize}
                  fill={muted}
                >
                  idx
                </text>
              )}
              {!compact && !overview && (
                <text
                  {...text}
                  data-testid="column-type"
                  x={w - TABLE_STYLE.pad}
                  y={mid}
                  textAnchor="end"
                  fontFamily={CANVAS_MONO_FAMILY}
                  fontSize={TABLE_STYLE.typeSize}
                  fill={muted}
                >
                  {type}
                </text>
              )}
            </g>
          );
        })}
      </g>
      {label && label.lines.some(Boolean) && (
        <OverviewName name={node.name} lines={label.lines} size={label.size} scale={scale} x={w / 2} y={h / 2} fill={node.fill} stroke={node.stroke} ink={ink} />
      )}
      <line x1={0} x2={w} y1={TABLE_HEADER_HEIGHT} y2={TABLE_HEADER_HEIGHT} stroke={node.stroke} strokeWidth={node.strokeWidth} />
      <rect width={w} height={h} rx={TABLE_STYLE.radius} fill="none" stroke={node.strokeWidth > 0 ? node.stroke : 'none'} strokeWidth={node.strokeWidth} />
    </>
  );
}

/**
 * The route, plus a dot at each end: filled when attached, hollow when loose.
 * Dashed when an end lost what it was attached to.
 */
function ConnectorShape({ node }: { node: ConnectorNode }) {
  const local = node.points.map((p) => `${p.x - node.x},${p.y - node.y}`).join(' ');
  const broken = isBroken(node);
  const relations = useContext(RelationsContext);
  // With no stroke the line is hidden, and so is everything drawn on it.
  const drawn = node.strokeWidth > 0;
  // A plain link's 'none' end has nothing to show or click; an end on a table can always be given one.
  const showMarker = (end: 'from' | 'to', c: Cardinality) => drawn && (c !== 'none' || relations.relationalEnds.has(`${node.id}:${end}`));
  const first = node.points[0];
  const last = node.points[node.points.length - 1];
  const ends = [
    { anchor: node.from, at: node.points[0] },
    { anchor: node.to, at: node.points[node.points.length - 1] },
  ];
  return (
    <>
      <polyline points={local} fill="none" stroke="transparent" strokeWidth={LINE_HIT_WIDTH} />
      <polyline
        data-testid="connector-line"
        data-route={node.points.map((p) => `${p.x},${p.y}`).join(' ')}
        data-broken={String(broken)}
        points={local}
        fill="none"
        stroke={node.stroke}
        strokeWidth={node.strokeWidth}
        strokeDasharray={broken ? '6 4' : undefined}
        strokeLinejoin="round"
      />
      {/* Dots first, so a marker squeezed onto a short segment still takes its own clicks. */}
      {drawn && ends.map(
        ({ anchor, at }, i) =>
          at && (
            <circle
              key={i}
              data-testid="connector-end"
              data-attached={String(anchor.kind !== 'point')}
              cx={at.x - node.x}
              cy={at.y - node.y}
              r={2 + node.strokeWidth}
              fill={anchor.kind !== 'point' ? node.stroke : node.fill}
              stroke={node.stroke}
              strokeWidth={node.strokeWidth}
            />
          ),
      )}
      {first && showMarker('from', node.fromCardinality) && (
        <Marker at={first} next={node.points[1]} cardinality={node.fromCardinality} end="from" node={node} />
      )}
      {last && showMarker('to', node.toCardinality) && (
        <Marker at={last} next={node.points[node.points.length - 2]} cardinality={node.toCardinality} end="to" node={node} />
      )}
    </>
  );
}

function Shape({ node, detail, scale }: { node: DesignNode; detail: TableDetail; scale: number }) {
  const stroke = node.strokeWidth > 0 ? node.stroke : 'none';
  const { width: w, height: h } = node;

  switch (node.type) {
    case 'group':
      // No body: a group is drawn by its children and hit through them.
      return null;
    case 'frame':
    case 'rect':
      return (
        <rect
          width={w}
          height={h}
          rx={node.cornerRadius}
          fill={node.fill}
          stroke={stroke}
          strokeWidth={node.strokeWidth}
        />
      );
    case 'ellipse':
      return (
        <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={node.fill} stroke={stroke} strokeWidth={node.strokeWidth} />
      );
    case 'line': {
      const [y1, y2] = node.flipped ? [h, 0] : [0, h];
      return (
        <>
          <line x1={0} y1={y1} x2={w} y2={y2} stroke="transparent" strokeWidth={LINE_HIT_WIDTH} />
          <line x1={0} y1={y1} x2={w} y2={y2} stroke={node.stroke} strokeWidth={node.strokeWidth} />
        </>
      );
    }
    case 'table':
      return <TableShape node={node} detail={detail} scale={scale} />;
    case 'connector':
      return <ConnectorShape node={node} />;
    case 'text':
      return (
        <>
          <rect width={w} height={h} fill="transparent" />
          <text
            fill={node.fill}
            fontSize={node.fontSize}
            fontFamily={CANVAS_FONT_FAMILY}
            dominantBaseline="hanging"
            className={noSelectClass}
          >
            {node.text.split('\n').map((line, i) => (
              <tspan key={i} x={0} y={i * node.fontSize * TEXT_LINE_HEIGHT + node.fontSize * 0.15}>
                {line || ' '}
              </tspan>
            ))}
          </text>
        </>
      );
  }
}

const nodeTransform = (node: DesignNode) =>
  `translate(${node.x} ${node.y}) rotate(${node.rotation} ${node.width / 2} ${node.height / 2})`;

interface NodeViewProps {
  node: DesignNode;
  childrenOf: ReadonlyMap<string | null, DesignNode[]>;
  /** Layers the canvas mounts; the rest are off screen. Changes identity only when the render window, nodes or pinned layers do. */
  mounted: ReadonlySet<string>;
  /** Text node being edited in place; drawn by the editor instead. */
  editingId: string | null;
  /** Level of detail tables draw at; changes only at zoom thresholds, so a wheel tick leaves memoised layers alone. */
  detail: TableDetail;
  /** `overviewScale` of the zoom below full detail, else 1, so it stays steady while tables are at full detail. */
  scale: number;
  /** Table being edited in its cells; always full detail, since the editor sits over its full-size cells. */
  fullDetailId: string | null;
}

/**
 * A container renders as a wrapper holding its own shape and then its children.
 * The shape's `<g>` carries the node's data attributes; the wrapper has none,
 * so hit-testing always finds the innermost layer under the pointer.
 */
export const NodeView = memo(function NodeView({ node, childrenOf, mounted, editingId, detail, scale, fullDetailId }: NodeViewProps) {
  if (!node.visible) return null;
  const shown = node.id === fullDetailId ? 'full' : detail;
  // Structure comes from the full child list, so culling every child doesn't change the container's DOM or opacity.
  const children = childrenOf.get(node.id) ?? [];
  const own = (
    <g
      data-node-id={node.id}
      data-testid={`node-${node.id}`}
      data-node-type={node.type}
      data-from={node.type === 'connector' ? node.from.kind : undefined}
      data-to={node.type === 'connector' ? node.to.kind : undefined}
      transform={nodeTransform(node)}
      opacity={children.length === 0 ? node.opacity : undefined}
      visibility={node.id === editingId ? 'hidden' : undefined}
      data-detail={node.type === 'table' ? shown : undefined}
    >
      <Shape node={node} detail={shown} scale={scale} />
    </g>
  );
  if (children.length === 0) return node.type === 'table' || node.type === 'connector' ? <Dimmable id={node.id}>{own}</Dimmable> : own;

  // Design choice: frames clip their content; groups don't.
  const clipId = node.type === 'frame' ? `clip-${node.id}` : undefined;
  return (
    <g opacity={node.opacity} data-subtree={node.id}>
      {own}
      {clipId && (
        <clipPath id={clipId}>
          <rect width={node.width} height={node.height} rx={node.type === 'frame' ? node.cornerRadius : 0} transform={nodeTransform(node)} />
        </clipPath>
      )}
      <g clipPath={clipId ? `url(#${clipId})` : undefined}>
        {children.filter((c) => mounted.has(c.id)).map((c) => (
          <NodeView key={c.id} node={c} childrenOf={childrenOf} mounted={mounted} editingId={editingId} detail={detail} scale={scale} fullDetailId={fullDetailId} />
        ))}
      </g>
    </g>
  );
});

/**
 * Frame names render above the frame in screen space, like design-tool canvas
 * labels. Only top-level frames get one; nested frames would be clipped.
 */
export function FrameLabel({ node, zoom }: { node: DesignNode; zoom: number }) {
  if (node.type !== 'frame' || node.parentId !== null || !node.visible) return null;
  return (
    <text
      data-node-id={node.id}
      x={node.x}
      y={node.y - 6 / zoom}
      fontSize={11 / zoom}
      fontFamily={CANVAS_FONT_FAMILY}
      fill={FRAME_LABEL_COLOR}
      className={noSelectClass}
    >
      {node.name}
    </text>
  );
}
