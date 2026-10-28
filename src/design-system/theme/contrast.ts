import { semanticTokens } from './semanticTokens';
import { tokens } from './tokens';

type Tree = { [key: string]: Tree } & { value?: string | { base: string; _osDark: string } };

function lookup(root: Tree, path: string): Tree {
  let node: Tree = root;
  for (const part of path.split('.')) {
    const next: Tree | undefined = node[part];
    if (!next) throw new Error(`No token at ${path}`);
    node = next;
  }
  return node.value === undefined && node.DEFAULT ? node.DEFAULT : node;
}

export type Mode = 'light' | 'dark';

/** Resolves a semantic colour (`text.secondary`) to its hex in a theme, following `{colors.…}` references. */
export function semanticColor(path: string, mode: Mode = 'light'): string {
  const raw = lookup(semanticTokens.colors as unknown as Tree, path).value;
  let value = typeof raw === 'object' ? (mode === 'dark' ? raw._osDark : raw.base) : raw;
  while (value?.startsWith('{')) value = lookup(tokens.colors as unknown as Tree, value.slice(8, -1)).value as string;
  if (!value) throw new Error(`${path} has no value`);
  return value;
}

function channels(hex: string, over: string): [number, number, number] {
  const n = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const alpha = hex.length === 9 ? n(hex, 3) / 255 : 1;
  const base = over.length === 7 ? over : '#ffffff';
  return [0, 1, 2].map((i) => n(hex, i) * alpha + n(base, i) * (1 - alpha)) as [number, number, number];
}

function luminance(hex: string, over: string): number {
  const [r, g, b] = channels(hex, over).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.x contrast ratio of `fg` on `bg`. A translucent `bg` is composited over `under` (default white),
 * then a translucent `fg` over that.
 */
export function contrastRatio(fg: string, bg: string, under = '#ffffff'): number {
  const flat = '#' + channels(bg, under).map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
  const a = luminance(fg, flat);
  const b = luminance(flat, '#ffffff');
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
