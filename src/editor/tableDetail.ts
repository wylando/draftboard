export type TableDetail = 'full' | 'compact' | 'overview';

/** Design choice: below this zoom a table drops types, `?`, idx and the badges other than PK/FK. */
export const FULL_MIN_ZOOM = 0.75;
/**
 * Design choice: below this zoom a table shows only its name. Compact text is drawn at a fixed world size
 * (`COMPACT_COLUMN_SIZE`), which reads about 10 px on screen at this zoom; any lower it would not.
 */
export const COMPACT_MIN_ZOOM = 0.5;

/** World px of compact row text and header name, sized to read about 10 px at `COMPACT_MIN_ZOOM` and fit a 28 px row. */
export const COMPACT_COLUMN_SIZE = 20;
export const COMPACT_BADGE_SIZE = 12;
/** On-screen px of the table name in overview. */
export const OVERVIEW_NAME_PX = 13;

export function detailLevel(zoom: number): TableDetail {
  if (zoom >= FULL_MIN_ZOOM) return 'full';
  return zoom >= COMPACT_MIN_ZOOM ? 'compact' : 'overview';
}

/**
 * The zoom rounded to a log-scale step (about 9% wide). Overview names are sized from it, so tables
 * re-render when it changes rather than on every wheel tick.
 */
export function overviewScale(zoom: number): number {
  return 2 ** (Math.round(Math.log2(zoom) * 8) / 8);
}
