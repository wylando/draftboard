export type TableDetail = 'full' | 'compact' | 'overview';

/**
 * Design choice: below this zoom a table drops types, `?`, idx and the badges other than PK/FK. Full text
 * (12 world px) reads 10 px on screen here, so a higher threshold would leave the step to compact small.
 */
export const FULL_MIN_ZOOM = 0.85;
/**
 * Design choice: below this zoom a table shows only its name. Compact text is capped at the row height
 * (`COMPACT_MAX_SIZE`), which reads 10 px on screen at this zoom; any lower it would not.
 */
export const COMPACT_MIN_ZOOM = 0.5;

/** World px: the tallest compact row text that still sits in a 28 px row. */
const COMPACT_MAX_SIZE = 20;
/** On-screen px compact text aims for; the world size follows the zoom so the step at `FULL_MIN_ZOOM` stays small. */
const COMPACT_TARGET_PX = 12;
/** On-screen px of the table name in overview, and the least it may shrink to before wrapping. */
export const OVERVIEW_NAME_PX = 13;
export const OVERVIEW_NAME_MIN_PX = 10;
/** On-screen px of text room an overview label always has, so a narrow card's name may reach past the card. */
const OVERVIEW_BUDGET_PX = 140;

export function detailLevel(zoom: number): TableDetail {
  if (zoom >= FULL_MIN_ZOOM) return 'full';
  return zoom >= COMPACT_MIN_ZOOM ? 'compact' : 'overview';
}

/**
 * The zoom rounded to a log-scale step (about 9% wide). Compact and overview text is sized from it, so
 * tables re-render when it changes rather than on every wheel tick.
 */
export function overviewScale(zoom: number): number {
  return 2 ** (Math.round(Math.log2(zoom) * 8) / 8);
}

/** World px for compact text at `scale` (from `overviewScale`): about 12 px on screen, never below full size or above the row. */
export function compactSizes(scale: number): { column: number; badge: number } {
  const column = Math.min(COMPACT_MAX_SIZE, Math.max(12, COMPACT_TARGET_PX / scale));
  return { column, badge: Math.min(12, Math.max(10, column * 0.6)) };
}

/** `text`, cut short with an ellipsis if `width` says it is wider than `max`; '' when not even one letter fits. */
export function ellipsize(text: string, max: number, width: (text: string) => number): string {
  if (width(text) <= max) return text;
  // Binary search for the longest prefix that fits with its ellipsis.
  let lo = 0;
  let hi = text.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (width(`${text.slice(0, mid)}…`) <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo)}…` : '';
}

/** Indexes where a name may break onto a second line: after `_`, `-` or a space, and before a capital that follows a lowercase letter. */
function breakPoints(name: string): number[] {
  const points: number[] = [];
  for (let i = 1; i < name.length; i++) {
    if (/[_\- ]/.test(name[i - 1]!) || (/[a-z0-9]/.test(name[i - 1]!) && /[A-Z]/.test(name[i]!))) points.push(i);
  }
  return points;
}

/** World px of room for an overview label: the card's inside, or the screen budget when that is more. */
export function overviewAvail(cardWidth: number, scale: number, pad = 12): number {
  return Math.max(cardWidth - 2 * pad, OVERVIEW_BUDGET_PX / scale);
}

/**
 * How an overview card writes its table name, as a label the size of the screen, not the card: 13 px on
 * screen, shrunk to fit `avail` world px down to 10 px, then on two lines split at the break point that
 * balances them best, then ellipsized. `size` is in world px; `scale` is the (stepped) zoom.
 */
export function overviewLabel(
  name: string,
  avail: number,
  scale: number,
  measure: (text: string, size: number) => number,
): { lines: string[]; size: number } {
  const full = OVERVIEW_NAME_PX / scale;
  const floor = OVERVIEW_NAME_MIN_PX / scale;
  const oneLine = measure(name, full);
  if (oneLine <= avail) return { lines: [name], size: full };
  const shrunk = full * (avail / oneLine);
  if (shrunk >= floor) return { lines: [name], size: shrunk };

  const fits = (t: string) => measure(t, floor);
  const split = breakPoints(name)
    .map((i) => [name.slice(0, i).trimEnd(), name.slice(i).trimStart()] as const)
    .sort((a, b) => Math.max(fits(a[0]), fits(a[1])) - Math.max(fits(b[0]), fits(b[1])))[0];
  if (!split) return { lines: [ellipsize(name, avail, fits)], size: floor };
  return { lines: split.map((line) => ellipsize(line, avail, fits)), size: floor };
}
