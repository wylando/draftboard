import { memo } from 'react';
import type { DesignNode } from '../model/types';
import { CANVAS_FONT_FAMILY, TEXT_LINE_HEIGHT } from '../textMetrics';
import { css } from 'styled-system/css';
import { token } from 'styled-system/tokens';

const FRAME_LABEL_COLOR = token.var('colors.text.secondary');
const noSelectClass = css({ userSelect: 'none' });

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
