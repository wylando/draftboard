import { createId, nameKey, uniqueName } from './names';
import { createColumn, MIN_TABLE_WIDTH, TABLE_ACCENTS, tableHeight } from './table';
import type { Box, DesignNode, DrawableType, GroupNode, NodeType } from './types';

const LABELS: Record<NodeType, string> = {
  frame: 'Frame',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  text: 'Text',
  group: 'Group',
  table: 'Table',
  connector: 'Connector',
};

/** Lowest free "<Label> <n>" name, so a deleted layer's number is reused. */
export function nextName(type: NodeType, existing: DesignNode[]): string {
  return uniqueName(`${LABELS[type]} 1`, new Set(existing.map((n) => nameKey(n.name))));
}

export const DEFAULT_SIZE: Record<DrawableType, { width: number; height: number }> = {
  frame: { width: 320, height: 240 },
  rect: { width: 100, height: 100 },
  ellipse: { width: 100, height: 100 },
  line: { width: 100, height: 0 },
  text: { width: 120, height: 22 },
  table: { width: 240, height: tableHeight(1) },
};

/**
 * `idType` types the `id` primary key a new table starts with. `ink` colours new text and lines; the UI
 * passes a light one on dark backgrounds, so loaders and tests keep the black default.
 */
export function createNode(type: DrawableType, box: Box, existing: DesignNode[], idType = 'uuid', ink = '#000000'): DesignNode {
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
      return { ...base, type, fill: ink, stroke: ink, strokeWidth: 1, flipped: false };
    case 'text':
      return { ...base, type, fill: ink, stroke: ink, strokeWidth: 0, text: 'Text', fontSize: 16 };
    case 'table':
      return {
        ...base,
        type,
        height: tableHeight(1),
        fill: '#ffffff',
        stroke: '#d9d9d9',
        strokeWidth: 1,
        accent: TABLE_ACCENTS[0],
        columns: [createColumn('id', idType, true)],
        indexes: [],
      };
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
 * Smallest size a node may be resized to. Lines may be flat. A table needs
 * room for a row's text; its height follows its rows, so only width is held.
 */
export function minSizeFor(type: NodeType): { width: number; height: number } {
  if (type === 'line') return { width: 0, height: 0 };
  if (type === 'table') return { width: MIN_TABLE_WIDTH, height: 1 };
  return { width: 1, height: 1 };
}
