import { gridSpacing } from '../geometry';
import type { Viewport } from '../model/types';
import type { GridStyle } from '../../settings/preferences/storage';
import { token } from 'styled-system/tokens';

const GRID_COLOR = token.var('colors.canvasGrid');
// Fixed id: there is one canvas, and useId's colons are awkward inside url(#…).
const PATTERN_ID = 'canvas-grid-pattern';
const DOT_RADIUS = 1;

/**
 * Background grid in screen space, aligned to the world origin. Each tile
 * draws its mark at the tile center and the pattern is shifted back by half a
 * tile, so dots and lines are never cut at tile edges.
 */
export function CanvasGrid({ viewport, style }: { viewport: Viewport; style: GridStyle }) {
  if (style === 'none') return null;
  const s = gridSpacing(viewport.zoom);
  const h = s / 2;
  return (
    <>
      <defs>
        <pattern
          id={PATTERN_ID}
          width={s}
          height={s}
          patternUnits="userSpaceOnUse"
          x={viewport.x - h}
          y={viewport.y - h}
        >
          {style === 'dots' ? (
            <circle cx={h} cy={h} r={DOT_RADIUS} fill={GRID_COLOR} />
          ) : (
            <path d={`M${h} 0V${s}M0 ${h}H${s}`} stroke={GRID_COLOR} strokeWidth={1} fill="none" />
          )}
        </pattern>
      </defs>
      <rect data-testid="canvas-grid" width="100%" height="100%" fill={`url(#${PATTERN_ID})`} pointerEvents="none" />
    </>
  );
}
