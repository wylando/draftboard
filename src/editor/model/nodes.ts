import type { Box, DesignNode, DrawableType, GroupNode, ImageNode, NodeType, PathNode, Point } from './types';

let counter = 0;
export function createId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

const LABELS: Record<NodeType, string> = {
  frame: 'Frame',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  arrow: 'Arrow',
  polygon: 'Polygon',
  star: 'Star',
  path: 'Path',
  image: 'Image',
  text: 'Text',
  group: 'Group',
};

/** Next free "<Label> <n>" name, mirroring how design tools auto-number layers. */
export function nextName(type: NodeType, existing: DesignNode[]): string {
  const label = LABELS[type];
  const used = existing.filter((n) => n.type === type).length;
  return `${label} ${used + 1}`;
}

export const DEFAULT_SIZE: Record<DrawableType, { width: number; height: number }> = {
  frame: { width: 320, height: 240 },
  rect: { width: 100, height: 100 },
  ellipse: { width: 100, height: 100 },
  line: { width: 100, height: 0 },
  arrow: { width: 100, height: 0 },
  polygon: { width: 100, height: 100 },
  star: { width: 100, height: 100 },
  text: { width: 120, height: 22 },
};

export function createNode(type: DrawableType, box: Box, existing: DesignNode[]): DesignNode {
  const base = {
    id: createId(),
    name: nextName(type, existing),
    parentId: null,
    ...box,
    rotation: 0,
    opacity: 1,
    visible: true,
  };
  switch (type) {
    case 'frame':
      return { ...base, type, fill: '#ffffff', stroke: '#e6e6e6', strokeWidth: 0, cornerRadius: 0 };
    case 'rect':
      return { ...base, type, fill: '#d9d9d9', stroke: '#000000', strokeWidth: 0, cornerRadius: 0 };
    case 'ellipse':
      return { ...base, type, fill: '#d9d9d9', stroke: '#000000', strokeWidth: 0 };
    case 'line':
    case 'arrow':
      return { ...base, type, fill: '#000000', stroke: '#000000', strokeWidth: 1, flipped: false };
    case 'polygon':
      return { ...base, type, fill: '#d9d9d9', stroke: '#000000', strokeWidth: 0, sides: 3 };
    case 'star':
      return { ...base, type, fill: '#d9d9d9', stroke: '#000000', strokeWidth: 0, points: 5, innerRatio: 0.382 };
    case 'text':
      return { ...base, type, fill: '#000000', stroke: '#000000', strokeWidth: 0, text: 'Text', fontSize: 16 };
  }
}

/** An empty group; `normalizeTree` sizes it once children point at it. */
export function createGroup(parentId: string | null, existing: DesignNode[]): GroupNode {
  return {
    id: createId(),
    type: 'group',
    name: nextName('group', existing),
    parentId,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    fill: '#000000',
    stroke: '#000000',
    strokeWidth: 0,
    opacity: 1,
    visible: true,
  };
}

/**
 * A pencil stroke from world-space points: the box is their bounds and the
 * points become fractions of it. A flat stroke keeps 0.5 on its flat axis.
 */
export function createPath(world: Point[], existing: DesignNode[]): PathNode {
  const xs = world.map((p) => p.x);
  const ys = world.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  return {
    id: createId(),
    type: 'path',
    name: nextName('path', existing),
    parentId: null,
    x,
    y,
    width,
    height,
    rotation: 0,
    fill: '#000000',
    stroke: '#000000',
    strokeWidth: 2,
    opacity: 1,
    visible: true,
    path: world.map((p) => ({ x: width ? (p.x - x) / width : 0.5, y: height ? (p.y - y) / height : 0.5 })),
  };
}

export function createImage(src: string, box: Box, existing: DesignNode[]): ImageNode {
  return {
    id: createId(),
    type: 'image',
    name: nextName('image', existing),
    parentId: null,
    ...box,
    rotation: 0,
    fill: '#000000',
    stroke: '#000000',
    strokeWidth: 0,
    opacity: 1,
    visible: true,
    src,
  };
}

/** Smallest dimension a node may be resized to. Lines, arrows and strokes may be flat. */
export const minSizeFor = (type: NodeType) => (type === 'line' || type === 'arrow' || type === 'path' ? 0 : 1);
