import { memo } from 'react';
import { arrowheadPoints, diamondPoints, polygonPoints, starPoints } from '../geometry';
import { LABEL_COLOR, LABEL_FONT_SIZE, labelOf } from '../model/nodes';
import type { DesignNode } from '../model/types';
import { CANVAS_FONT_FAMILY, LABEL_PADDING, TEXT_LINE_HEIGHT } from '../textMetrics';
import { css } from 'styled-system/css';
import { token } from 'styled-system/tokens';

const FRAME_LABEL_COLOR = token.var('colors.text.secondary');
const noSelectClass = css({ userSelect: 'none' });
// Clicks pass through the label to the shape underneath.
const labelClass = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'full',
  height: 'full',
  textAlign: 'center',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  overflow: 'hidden',
  pointerEvents: 'none',
  userSelect: 'none',
});

/** Centered text that wraps inside the node's box. */
function Label({ node }: { node: DesignNode }) {
  const label = labelOf(node);
  if (!label) return null;
  return (
    <foreignObject width={node.width} height={node.height} pointerEvents="none">
      {/* Font and color are document values, not UI tokens. */}
      <div
        className={labelClass}
        style={{
          padding: LABEL_PADDING,
          fontSize: LABEL_FONT_SIZE,
          lineHeight: TEXT_LINE_HEIGHT,
          fontFamily: CANVAS_FONT_FAMILY,
          color: LABEL_COLOR,
        }}
      >
        {label}
      </div>
    </foreignObject>
  );
}

/** Invisible stroke width (world px) that makes thin lines easy to grab. */
const LINE_HIT_WIDTH = 8;

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
    case 'sticky':
      return <rect width={w} height={h} fill={node.fill} stroke={stroke} strokeWidth={node.strokeWidth} />;
    case 'diamond':
      return <polygon points={diamondPoints(w, h)} fill={node.fill} stroke={stroke} strokeWidth={node.strokeWidth} />;
    case 'ellipse':
      return (
        <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={node.fill} stroke={stroke} strokeWidth={node.strokeWidth} />
      );
    case 'line':
    case 'arrow': {
      const [y1, y2] = node.flipped ? [h, 0] : [0, h];
      return (
        <>
          <line x1={0} y1={y1} x2={w} y2={y2} stroke="transparent" strokeWidth={LINE_HIT_WIDTH} />
          <line x1={0} y1={y1} x2={w} y2={y2} stroke={node.stroke} strokeWidth={node.strokeWidth} />
          {node.type === 'arrow' && (
            <polygon
              data-testid="arrowhead"
              points={arrowheadPoints({ x: 0, y: y1 }, { x: w, y: y2 }, node.strokeWidth)}
              fill={node.stroke}
            />
          )}
        </>
      );
    }
    case 'polygon':
      return (
        <polygon points={polygonPoints(w, h, node.sides)} fill={node.fill} stroke={stroke} strokeWidth={node.strokeWidth} />
      );
    case 'star':
      return (
        <polygon
          points={starPoints(w, h, node.points, node.innerRatio)}
          fill={node.fill}
          stroke={stroke}
          strokeWidth={node.strokeWidth}
        />
      );
    case 'path': {
      const d = node.path.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x * w} ${p.y * h}`).join(' ');
      return (
        <>
          <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(LINE_HIT_WIDTH, node.strokeWidth)} />
          <path d={d} fill="none" stroke={node.stroke} strokeWidth={node.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    }
    case 'connector': {
      const [a, b] = node.ends.map((e) => ({ x: e.x * w, y: e.y * h })) as [{ x: number; y: number }, { x: number; y: number }];
      return (
        <>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={LINE_HIT_WIDTH} />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={node.stroke} strokeWidth={node.strokeWidth} />
          <polygon points={arrowheadPoints(a, b, node.strokeWidth)} fill={node.stroke} />
        </>
      );
    }
    case 'image':
      return <image href={node.src} width={w} height={h} preserveAspectRatio="none" />;
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
  /** Text node, or shape whose label, is being edited in place; the editor draws that text instead. */
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
      transform={nodeTransform(node)}
      opacity={children.length === 0 ? node.opacity : undefined}
      visibility={node.id === editingId && node.type === 'text' ? 'hidden' : undefined}
    >
      <Shape node={node} />
      {node.id !== editingId && <Label node={node} />}
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
