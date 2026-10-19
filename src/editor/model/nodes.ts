import type { Box, DesignNode, DrawableType, GroupNode, NodeType } from './types';

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
  text: 'Text',
  group: 'Group',
};

/** Layer names are unique across the document, ignoring case: "Rect" and "rect" clash. */
export const nameKey = (name: string) => name.toLowerCase();

/** Whether a layer other than `id` already has `name`. */
export function nameTaken(nodes: DesignNode[], name: string, id: string): boolean {
  return nodes.some((n) => n.id !== id && nameKey(n.name) === nameKey(name));
}

/**
 * `desired` if its `nameKey` isn't in `taken`, otherwise the first free name made by
 * raising its trailing number ("Rectangle 1" → "Rectangle 2") or appending one
 * ("Header" → "Header 2").
 */
export function uniqueName(desired: string, taken: Set<string>): string {
  if (!taken.has(nameKey(desired))) return desired;
  const match = /^(.*) (\d+)$/.exec(desired);
  const base = match ? (match[1] as string) : desired;
  let n = match ? Number(match[2]) + 1 : 2;
  while (taken.has(nameKey(`${base} ${n}`))) n += 1;
  return `${base} ${n}`;
}

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
      return { ...base, type, fill: '#000000', stroke: '#000000', strokeWidth: 1, flipped: false };
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

/** Smallest dimension a node may be resized to. Lines may be flat. */
export const minSizeFor = (type: NodeType) => (type === 'line' ? 0 : 1);
