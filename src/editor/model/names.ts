import type { DesignNode } from './types';

/*
 * Ids and unique names. A leaf module: `nodes.ts` and `table.ts` both need
 * these, and importing either from the other would make a cycle.
 */

let counter = 0;
export function createId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

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
