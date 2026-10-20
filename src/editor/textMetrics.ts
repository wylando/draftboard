const LINE_HEIGHT = 1.4;
let ctx: CanvasRenderingContext2D | null = null;

/** Measure text with a 2D canvas so text boxes hug their content. */
export function measureText(text: string, fontSize: number, fontFamily: string, fontWeight = 400): { width: number; height: number } {
  ctx ??= document.createElement('canvas').getContext('2d');
  const lines = text.split('\n');
  let width = 0;
  if (ctx) {
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    for (const line of lines) width = Math.max(width, ctx.measureText(line).width);
  }
  return { width: Math.max(1, Math.ceil(width)), height: Math.ceil(lines.length * fontSize * LINE_HEIGHT) };
}

export const TEXT_LINE_HEIGHT = LINE_HEIGHT;
export const CANVAS_FONT_FAMILY = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';
/** System monospace only: the app loads no web fonts. */
export const CANVAS_MONO_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
