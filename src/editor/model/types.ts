export type DrawableType = 'frame' | 'rect' | 'ellipse' | 'line' | 'text' | 'table';

/** Groups are made from a selection (Group command), never drawn. */
export type NodeType = DrawableType | 'group';

export type ContainerType = 'frame' | 'group';

export type ToolId = 'select' | 'hand' | DrawableType;

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

/**
 * Its box is always the union of its children's bounds, recomputed by
 * `normalizeTree`, and its rotation stays 0.
 */
export interface GroupNode extends BaseNode {
  type: 'group';
}

export interface Column {
  /** Stable within its table, so links to the column survive renames and reorders. */
  id: string;
  /** Unique within its table, ignoring case. */
  name: string;
  /** Free text; the SQL dialect setting only suggests values. */
  dataType: string;
  primaryKey: boolean;
  nullable: boolean;
  unique: boolean;
  default?: string;
  note?: string;
}

export interface TableIndex {
  id: string;
  name: string;
  /** In index order, which matters for a composite index. */
  columnIds: string[];
  unique: boolean;
}

/**
 * A database table sketch. Its name is the layer name. Its height is derived
 * from the column count by `normalizeTree`, and its rotation stays 0. Columns
 * change only through the `editTable` action, which keeps names unique.
 */
export interface TableNode extends BaseNode {
  type: 'table';
  /** Array order is display order. */
  columns: Column[];
  indexes: TableIndex[];
  /** Header color, for grouping tables by domain. */
  accent: string;
  note?: string;
}

export type DesignNode = FrameNode | RectNode | EllipseNode | LineNode | TextNode | GroupNode | TableNode;

/**
 * Fields any node type may carry; used for partial, type-agnostic updates.
 * Excludes `name`, which changes only through `renameNode` so names stay unique.
 * A table's own fields change only through `editTable`.
 */
export type NodePatch = Partial<
  Omit<FrameNode, 'id' | 'type' | 'name'> &
    Omit<LineNode, 'id' | 'type' | 'name'> &
    Omit<TextNode, 'id' | 'type' | 'name'>
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
