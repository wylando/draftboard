const LINE_HEIGHT = 1.4;
let ctx: CanvasRenderingContext2D | null = null;

/** Measure text with a 2D canvas so text boxes hug their content. */
export function measureText(text: string, fontSize: number, fontFamily: string): { width: number; height: number } {
  ctx ??= document.createElement('canvas').getContext('2d');
  const lines = text.split('\n');
  let width = 0;
  if (ctx) {
    ctx.font = `${fontSize}px ${fontFamily}`;
    for (const line of lines) width = Math.max(width, ctx.measureText(line).width);
  }
  return { width: Math.max(1, Math.ceil(width)), height: Math.ceil(lines.length * fontSize * LINE_HEIGHT) };
}

export const TEXT_LINE_HEIGHT = LINE_HEIGHT;
/** Inset (world px) between a shape's edge and its label. */
export const LABEL_PADDING = 8;
export const CANVAS_FONT_FAMILY = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';
