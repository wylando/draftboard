export type NodeType = 'frame' | 'rect' | 'ellipse' | 'line' | 'text';

export type ToolId = 'select' | 'hand' | NodeType;

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
 * A flat, z-ordered list (index 0 = bottom) keeps the model simple; nesting
 * frames is a planned extension, not something this model supports yet.
 */
export interface BaseNode extends Box {
  id: string;
  type: NodeType;
  name: string;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  visible: boolean;
}

export interface FrameNode extends BaseNode {
  type: 'frame';
  cornerRadius: number;
}

export interface RectNode extends BaseNode {
  type: 'rect';
  cornerRadius: number;
}

export interface EllipseNode extends BaseNode {
  type: 'ellipse';
}

export interface LineNode extends BaseNode {
  type: 'line';
  /** false: top-left → bottom-right. true: bottom-left → top-right. */
  flipped: boolean;
}

export interface TextNode extends BaseNode {
  type: 'text';
  text: string;
  fontSize: number;
}

export type DesignNode = FrameNode | RectNode | EllipseNode | LineNode | TextNode;

/** Fields any node type may carry; used for partial, type-agnostic updates. */
export type NodePatch = Partial<
  Omit<FrameNode, 'id' | 'type'> &
    Omit<LineNode, 'id' | 'type'> &
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
