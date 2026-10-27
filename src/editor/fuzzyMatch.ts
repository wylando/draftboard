// Design choice: an fzf-style match. Every query letter must appear in order; runs of adjacent
// letters score highest, then letters that start a word, and skipped letters cost a little, so
// "crat" finds created_at and "id" ranks user_id above i_d.
const MATCH = 1;
const ADJACENT = 6;
const WORD_START = 3;
const FIRST_LETTER = 2;
const EXACT = 100;
/** Per letter skipped between two matched letters. */
const GAP = 1;

function startsWord(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text.charAt(i - 1);
  if (/[\s_.\-/]/.test(prev)) return true;
  return /[a-z0-9]/.test(prev) && /[A-Z]/.test(text.charAt(i));
}

/** Best score of `query` as an in-order subsequence of `text`, or null when it isn't one. */
function score(text: string, query: string): number | null {
  const hay = text.toLowerCase();
  const n = hay.length;
  const m = query.length;
  if (m > n) return null;
  // prev[i]: best score with the previous query letter matched at text[i]. Names are short, so O(m·n²) is fine.
  let prev: Array<number | null> = Array.from({ length: n }, (_, i) =>
    hay[i] === query[0] ? MATCH + (startsWord(text, i) ? WORD_START : 0) + (i === 0 ? FIRST_LETTER : 0) : null,
  );
  for (let j = 1; j < m; j++) {
    const next: Array<number | null> = new Array<number | null>(n).fill(null);
    for (let i = j; i < n; i++) {
      if (hay[i] !== query[j]) continue;
      let best: number | null = null;
      for (let k = j - 1; k < i; k++) {
        const before = prev[k];
        if (before === null || before === undefined) continue;
        const total = before + MATCH + (k === i - 1 ? ADJACENT : (startsWord(text, i) ? WORD_START : 0) - GAP * (i - k - 1));
        if (best === null || total > best) best = total;
      }
      next[i] = best;
    }
    prev = next;
  }
  let result: number | null = null;
  for (const s of prev) if (s !== null && (result === null || s > result)) result = s;
  if (result !== null && hay === query) result += EXACT;
  return result;
}

/** The items whose text matches `query`, best first; ties keep the shorter text, then the original order. */
export function fuzzyFilter<T>(items: readonly T[], query: string, text: (item: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...items];
  return items
    .flatMap((item, order) => {
      const s = score(text(item), q);
      return s === null ? [] : [{ item, s, length: text(item).length, order }];
    })
    .sort((a, b) => b.s - a.s || a.length - b.length || a.order - b.order)
    .map((r) => r.item);
}
