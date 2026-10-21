import { createContext, memo, useContext } from 'react';
import { TABLE_COLORS, TABLE_HEADER_HEIGHT, TABLE_ROW_HEIGHT, TABLE_STYLE } from '../model/table';
import { isBroken } from '../model/connector';
import type { Cardinality, ConnectorNode, DesignNode, Point, TableNode } from '../model/types';
import { CANVAS_FONT_FAMILY, CANVAS_MONO_FAMILY, measureText, TEXT_LINE_HEIGHT } from '../textMetrics';
import { css } from 'styled-system/css';
import { token } from 'styled-system/tokens';

/**
 * Facts about layers that come from other layers: which table columns are
 * foreign keys, and which connectors join columns of different types. Canvas
 * derives them once per document change.
 */
export interface Relations {
  foreignKeys: ReadonlyMap<string, ReadonlySet<string>>;
  mismatched: ReadonlySet<string>;
  /** Connector ends ("<id>:from") on a table or a row, which always offer a marker to click. */
  relationalEnds: ReadonlySet<string>;
}

export const RelationsContext = createContext<Relations>({ foreignKeys: new Map(), mismatched: new Set(), relationalEnds: new Set() });

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


/** Whether `color` (#rrggbb) is dark enough that white text reads better on it than black. */
function isDark(color: string): boolean {
  const hex = /^#?([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return false;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  // At this relative luminance black and white text have equal contrast.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.179;
}

/** `text`, cut short with an ellipsis if it is wider than `max` world px. */
function fitText(text: string, max: number, size: number, family: string, weight = 400): string {
  const width = (t: string) => measureText(t, size, family, weight).width;
  if (width(text) <= max) return text;
  // Binary search for the longest prefix that fits with its ellipsis.
  let lo = 0;
  let hi = text.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (width(`${text.slice(0, mid)}…`) <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo)}…` : '';
}

/**
 * Header with the table's name on its accent, then one row per column: key
 * badge, name, an index marker for indexed columns, and the type (with `?`
 * when nullable) right-aligned. When name and type don't both fit, the type
 * keeps what the name leaves (at least half the row) and the name the rest,
 * each cut short with an ellipsis rather than overlapping.
 */
function TableShape({ node }: { node: TableNode }) {
  const { width: w, height: h } = node;
  const clipId = `table-clip-${node.id}`;
  const indexed = new Set(node.indexes.flatMap((i) => i.columnIds));
  const foreign = useContext(RelationsContext).foreignKeys.get(node.id);
  const headerDark = isDark(node.accent);
  const bodyDark = isDark(node.fill);
  const ink = bodyDark ? TABLE_COLORS.onDark : TABLE_COLORS.text;
  const muted = bodyDark ? TABLE_COLORS.onDarkMuted : TABLE_COLORS.muted;
  const text = { fontFamily: CANVAS_FONT_FAMILY, dominantBaseline: 'central', className: noSelectClass } as const;
  const nameX = TABLE_STYLE.pad + TABLE_STYLE.badgeWidth;
  const rowSpace = w - TABLE_STYLE.pad - nameX;
  const idxWidth = measureText('idx', TABLE_STYLE.badgeSize, CANVAS_FONT_FAMILY).width + TABLE_STYLE.gap;
  return (
    <>
      <clipPath id={clipId}>
        <rect width={w} height={h} rx={TABLE_STYLE.radius} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect data-testid="table-body" width={w} height={h} fill={node.fill} />
        <rect data-testid="table-header" width={w} height={TABLE_HEADER_HEIGHT} fill={node.accent} />
        <text
          {...text}
          data-testid="table-name"
          x={TABLE_STYLE.pad}
          y={TABLE_HEADER_HEIGHT / 2}
          fontSize={TABLE_STYLE.nameSize}
          fontWeight={600}
          fill={headerDark ? TABLE_COLORS.onDark : TABLE_COLORS.text}
        >
          {fitText(node.name, w - 2 * TABLE_STYLE.pad, TABLE_STYLE.nameSize, CANVAS_FONT_FAMILY, 600)}
        </text>
        {node.columns.map((c, i) => {
          const y = TABLE_HEADER_HEIGHT + i * TABLE_ROW_HEIGHT;
          const mid = y + TABLE_ROW_HEIGHT / 2;
          const isForeign = foreign?.has(c.id) ?? false;
          // One slot: a key that is also foreign shows both letters (PFK, UFK).
          const key = c.primaryKey ? 'P' : c.unique ? 'U' : '';
          const badge = isForeign ? `${key}FK` : c.primaryKey ? 'PK' : c.unique ? 'UQ' : null;
          const isIndexed = indexed.has(c.id);
          const nameSpace = rowSpace - TABLE_STYLE.gap - (isIndexed ? idxWidth : 0);
          const nameWidth = measureText(c.name, TABLE_STYLE.columnSize, CANVAS_FONT_FAMILY).width;
          const type = fitText(`${c.dataType}${c.nullable ? '?' : ''}`, Math.max(rowSpace / 2, nameSpace - nameWidth), TABLE_STYLE.typeSize, CANVAS_MONO_FAMILY);
          const typeWidth = measureText(type, TABLE_STYLE.typeSize, CANVAS_MONO_FAMILY).width;
          const name = fitText(c.name, nameSpace - typeWidth, TABLE_STYLE.columnSize, CANVAS_FONT_FAMILY);
          return (
            <g key={c.id} data-testid="table-column" data-column-id={c.id}>
              {/* The whole row is hit, not just its glyphs, so a click or double-click anywhere in it finds the column. */}
              <rect y={y} width={w} height={TABLE_ROW_HEIGHT} fill="transparent" />
              {/* In the table's stroke, but at most a hairline: a heavy outline shouldn't make heavy rows. */}
              {i > 0 && node.strokeWidth > 0 && (
                <line data-testid="row-divider" x1={0} x2={w} y1={y} y2={y} stroke={node.stroke} strokeWidth={Math.min(node.strokeWidth, 1)} />
              )}
              {badge && (
                <text
                  {...text}
                  data-testid="column-badge"
                  x={TABLE_STYLE.pad}
                  y={mid}
                  fontSize={TABLE_STYLE.badgeSize}
                  fontWeight={700}
                  fill={bodyDark ? TABLE_COLORS.onDarkBadge : TABLE_COLORS.badge}
                >
                  {badge}
                </text>
              )}
              <text {...text} data-testid="column-name" x={nameX} y={mid} fontSize={TABLE_STYLE.columnSize} fill={ink}>
                {name}
              </text>
              {isIndexed && (
                <text
                  {...text}
                  data-testid="column-index"
                  x={nameX + measureText(name, TABLE_STYLE.columnSize, CANVAS_FONT_FAMILY).width + 6}
                  y={mid}
                  fontSize={TABLE_STYLE.badgeSize}
                  fill={muted}
                >
                  idx
                </text>
              )}
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
            </g>
          );
        })}
      </g>
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
  const mismatched = drawn && relations.mismatched.has(node.id);
  // A plain link's 'none' end has nothing to show or click; an end on a table can always be given one.
  const showMarker = (end: 'from' | 'to', c: Cardinality) => drawn && (c !== 'none' || relations.relationalEnds.has(`${node.id}:${end}`));
  const first = node.points[0];
  const last = node.points[node.points.length - 1];
  // The warning sits on the middle segment, where the eye looks for the link's label.
  const middle = Math.floor((node.points.length - 1) / 2);
  const m0 = node.points[middle];
  const m1 = node.points[middle + 1] ?? m0;
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
      {mismatched && m0 && m1 && (
        <g
          data-testid="connector-warning"
          role="img"
          aria-label="The two columns’ types differ"
          transform={`translate(${(m0.x + m1.x) / 2 - node.x} ${(m0.y + m1.y) / 2 - node.y})`}
        >
          <title>The two columns’ types differ</title>
          <path d="M0 -7L7 6H-7Z" fill={WARNING_BG} stroke={node.stroke} strokeWidth={1} strokeLinejoin="round" />
          <path d="M0 -2.5V1.5M0 3.5V3.6" stroke={WARNING_INK} strokeWidth={1.4} strokeLinecap="round" />
        </g>
      )}
    </>
  );
}

function Shape({ node }: { node: DesignNode }) {
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
      return <TableShape node={node} />;
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
  /** Text node being edited in place; drawn by the editor instead. */
  editingId: string | null;
}

/**
 * A container renders as a wrapper holding its own shape and then its children.
 * The shape's `<g>` carries the node's data attributes; the wrapper has none,
 * so hit-testing always finds the innermost layer under the pointer.
 */
export const NodeView = memo(function NodeView({ node, childrenOf, editingId }: NodeViewProps) {
  if (!node.visible) return null;
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
    >
      <Shape node={node} />
    </g>
  );
  if (children.length === 0) return own;

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
        {children.map((c) => (
          <NodeView key={c.id} node={c} childrenOf={childrenOf} editingId={editingId} />
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
