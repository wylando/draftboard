import { semanticTokens } from './semanticTokens';
import { tokens } from './tokens';

type Tree = { [key: string]: Tree } & { value?: string };

function lookup(root: Tree, path: string): Tree {
  let node: Tree = root;
  for (const part of path.split('.')) {
    const next: Tree | undefined = node[part];
    if (!next) throw new Error(`No token at ${path}`);
    node = next;
  }
  return node.value === undefined && node.DEFAULT ? node.DEFAULT : node;
}

/** Resolves a semantic colour (`text.secondary`) to its hex, following `{colors.…}` references. */
export function semanticColor(path: string): string {
  let value = lookup(semanticTokens.colors as unknown as Tree, path).value;
  while (value?.startsWith('{')) value = lookup(tokens.colors as unknown as Tree, value.slice(8, -1)).value;
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

/** WCAG 2.x contrast ratio of `fg` on `bg`; a translucent `fg` is composited over `bg` first. */
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg, bg);
  const b = luminance(bg, '#ffffff');
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
