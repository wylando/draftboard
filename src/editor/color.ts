/** Whether `color` (#rrggbb) is dark enough that white text reads better on it than black. */
export function isDark(color: string): boolean {
  const hex = /^#?([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return false;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  // At this relative luminance black and white text have equal contrast.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.179;
}
