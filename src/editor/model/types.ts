/** Node types the user draws by dragging out a box (or clicking for a default size). */
export type DrawableType =
  | 'frame'
  | 'rect'
  | 'ellipse'
  | 'diamond'
  | 'line'
  | 'arrow'
  | 'polygon'
  | 'star'
  | 'sticky'
  | 'text';

/**
 * Groups are made from a selection (Group command), paths by the pencil tool,
 * and images by placing a file; none of them is drawn as a box.
 */
export type NodeType = DrawableType | 'group' | 'path' | 'image';

/** Frames and groups can hold children. */
export type ContainerType = 'frame' | 'group';

export type ToolId = 'select' | 'hand' | 'pencil' | DrawableType;

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Every node is a box in world coordinates, rotated (degrees) about its center.
 * Children keep world coordinates too; `parentId` only records the tree. The
 * document is a flat list kept in tree preorder (see `model/tree.ts`): a parent
 * comes before its descendants, and siblings are z-ordered (earlier = below).
 */
export interface BaseNode extends Box {
  id: string;
  type: NodeType;
  name: string;
  /** Containing frame or group; null at the top level. */
  parentId: string | null;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  visible: boolean;
}

/** Shapes that can carry centered, wrapped text. Optional: older documents have none. */
interface Labeled {
  label?: string;
}

export interface FrameNode extends BaseNode {
  type: 'frame';
  cornerRadius: number;
}

export interface RectNode extends BaseNode, Labeled {
  type: 'rect';
  cornerRadius: number;
}

export interface EllipseNode extends BaseNode, Labeled {
  type: 'ellipse';
}

/** A rhombus touching the middle of each side of its box. */
export interface DiamondNode extends BaseNode, Labeled {
  type: 'diamond';
}

/** A colored note; its text is its label. */
export interface StickyNode extends BaseNode, Labeled {
  type: 'sticky';
}

export interface LineNode extends BaseNode {
  type: 'line';
  /** false: top-left → bottom-right. true: bottom-left → top-right. */
  flipped: boolean;
}

/** A line with an arrowhead at its end point. */
export interface ArrowNode extends BaseNode {
  type: 'arrow';
  flipped: boolean;
}

/** A regular polygon inscribed in the node's box, first vertex at the top. */
export interface PolygonNode extends BaseNode, Labeled {
  type: 'polygon';
  sides: number;
}

export interface StarNode extends BaseNode, Labeled {
  type: 'star';
  /** Number of outer points. */
  points: number;
  /** Inner radius as a fraction of the outer radius, 0–1. */
  innerRatio: number;
}

/** A freehand stroke. Points are fractions (0–1) of the box, so moving and resizing just work. */
export interface PathNode extends BaseNode {
  type: 'path';
  path: Point[];
}

export interface ImageNode extends BaseNode {
  type: 'image';
  /** A `data:image/…` URL; the document stays self-contained and offline. */
  src: string;
}

export interface TextNode extends BaseNode {
  type: 'text';
  text: string;
  fontSize: number;
}

/**
 * Its box is always the union of its children's bounds, recomputed by
 * `normalizeTree`, and its rotation stays 0.
 */
export interface GroupNode extends BaseNode {
  type: 'group';
}

export type DesignNode =
  | FrameNode
  | RectNode
  | EllipseNode
  | DiamondNode
  | StickyNode
  | LineNode
  | ArrowNode
  | PolygonNode
  | StarNode
  | PathNode
  | ImageNode
  | TextNode
  | GroupNode;

/** Fields any node type may carry; used for partial, type-agnostic updates. */
export type NodePatch = Partial<
  Omit<FrameNode, 'id' | 'type'> &
    Labeled &
    Omit<LineNode, 'id' | 'type'> &
    Omit<PolygonNode, 'id' | 'type'> &
    Omit<StarNode, 'id' | 'type'> &
    Omit<PathNode, 'id' | 'type'> &
    Omit<TextNode, 'id' | 'type'>
>;

export interface Viewport {
  /** Screen-space offset of the world origin. */
  x: number;
  y: number;
  zoom: number;
}

export interface DocumentState {
  nodes: DesignNode[];
}
