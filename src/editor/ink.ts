import { isDark } from './color';
import { isEffectivelyVisible, byIdOf, frameAt } from './model/tree';
import type { DesignNode, Point } from './model/types';

/** Default text and line colour on a light background; it is also the model's default. */
export const INK_LIGHT_BACKGROUND = '#000000';
/** Default text and line colour on a dark background: 13.4:1 on the dark canvas (#1e1e1e). */
export const INK_DARK_BACKGROUND = '#e6e6e6';

/**
 * The ink for a new text or line at `point`: set by the visible table it lands on, else by the frame it
 * lands in, else by the canvas. Those fills are document colours, so they decide independently of the OS theme.
 */
export function defaultInk(nodes: readonly DesignNode[], point: Point, canvasIsDark: boolean): string {
  const byId = byIdOf(nodes);
  // Tables are drawn over frames, and later nodes over earlier ones.
  const table = [...nodes]
    .reverse()
    .find((n) => n.type === 'table' && isEffectivelyVisible(byId, n) && point.x >= n.x && point.x <= n.x + n.width && point.y >= n.y && point.y <= n.y + n.height);
  const id = frameAt(nodes, point, new Set());
  const surface = table ?? (id ? byId.get(id) : undefined);
  const dark = surface ? isDark(surface.fill) : canvasIsDark;
  return dark ? INK_DARK_BACKGROUND : INK_LIGHT_BACKGROUND;
}

/** Read at creation time, so a later change of the OS theme doesn't recolour existing layers. */
export const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
