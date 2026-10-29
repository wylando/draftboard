import { frameAt } from './model/tree';
import type { DesignNode, Point } from './model/types';

/** Default text and line colour on a light background; it is also the model's default. */
export const INK_LIGHT_BACKGROUND = '#000000';
/** Default text and line colour on a dark background: 13.4:1 on the dark canvas (#1e1e1e). */
export const INK_DARK_BACKGROUND = '#e6e6e6';

// Black and white text have equal contrast at relative luminance 0.179, so darker backgrounds take the light ink.
// Not imported from the theme's contrast helper, which pulls the Panda config into the bundle.
function isDark(hex: string): boolean {
  const rgb = /^#([0-9a-f]{6})/i.exec(hex)?.[1];
  if (!rgb) return false;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(rgb.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.179;
}

/**
 * The ink for a new text or line at `point`: set by the frame it lands in, else by the canvas.
 * Frame fills are document colours, so they decide independently of the OS theme.
 */
export function defaultInk(nodes: readonly DesignNode[], point: Point, canvasIsDark: boolean): string {
  const id = frameAt(nodes, point, new Set());
  const frame = id ? nodes.find((n) => n.id === id) : undefined;
  const dark = frame ? isDark(frame.fill) : canvasIsDark;
  return dark ? INK_DARK_BACKGROUND : INK_LIGHT_BACKGROUND;
}

/** Read at creation time, so a later change of the OS theme doesn't recolour existing layers. */
export const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
