/** One SQL statement and the 1-based line its first token starts on. */
export interface SqlStatement {
  sql: string;
  line: number;
  /**
   * 1-based line where a string, quoted identifier, comment or dollar-quoted body began and ran
   * to the end of the input, swallowing whatever followed. When no statement contains the
   * opener, an extra statement with empty `sql` carries it so callers can always warn.
   */
  unterminatedAt?: number;
}

// Anchored at the first real token. Skipping leading comments with a regex backtracked exponentially on dash runs.
const COPY_STDIN = /^copy\b[^;]*?\bfrom\s+stdin\b/i;
const COPY_END = /^\\\.\r?$/gm;

const DOLLAR_TAG = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/;

const DELIMITER_LINE = /delimiter[ \t]+(\S+)[^\n]*/iy;
const WORD = /[A-Za-z_][A-Za-z0-9_]*/y;
const VERSIONED_OPEN = /\/\*!(?:\d{5,6})?/y;

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite';

export function splitStatements(source: string, dialect: SqlDialect = 'postgres'): SqlStatement[] {
  const mysql = dialect === 'mysql';
  const sqlite = dialect === 'sqlite';
  const out: SqlStatement[] = [];
  let delimiter = ';';
  // Ranges of `/*!NNNNN` and `*/` wrapping MySQL versioned comments, removed from the statement text.
  let cuts: Array<[number, number]> = [];
  let inVersioned = false;
  // Where the first quote/comment that never closed began; `pos` is only used to find its statement.
  // Typed via `as` because TS can't see the closures assign it, and narrows it to `null`.
  let open = null as { pos: number; line: number } | null;
  let versionedOpen = null as { pos: number; line: number } | null;
  let lastEnd = 0;
  let start = 0;
  let line = 1;
  let firstLine = 0; // 0 until the statement has a non-comment character
  let firstPos = 0;
  // SQLite trigger bodies hold `;`-terminated statements, so the trigger only ends at the
  // `;` after its closing END. CASE ... END inside the body nests, hence a depth count.
  const head: string[] = [];
  let isTrigger = false;
  let depth = 0;
  let sawBegin = false;

  const flush = (end: number) => {
    let text = '';
    let at = start;
    for (const [a, b] of cuts) {
      if (a < start || b > end) continue;
      text += source.slice(at, a);
      at = b;
    }
    cuts = [];
    const sql = (text + source.slice(at, end)).trim();
    const emit = Boolean(sql && firstLine);
    if (emit) {
      out.push({ sql, line: firstLine });
      lastEnd = end;
    }
    firstLine = 0;
    head.length = 0;
    isTrigger = false;
    depth = 0;
    sawBegin = false;
    return emit && COPY_STDIN.test(source.slice(firstPos, end));
  };

  const skipTo = (from: number, close: string): number => {
    const found = source.indexOf(close, from);
    if (found === -1) open ??= { pos: from, line };
    const end = found === -1 ? source.length : found + close.length;
    for (let k = from; k < end; k++) if (source[k] === '\n') line++;
    return end;
  };

  // MySQL strings take backslash escapes; backtick identifiers never do.
  const skipString = (from: number, quote: string): number => {
    let k = from;
    while (k < source.length && source[k] !== quote) k += source[k] === '\\' && mysql && quote !== '`' ? 2 : 1;
    if (k >= source.length) open ??= { pos: from, line };
    const end = Math.min(k + 1, source.length);
    for (let n = from; n < end; n++) if (source[n] === '\n') line++;
    return end;
  };

  const atLineStart = (at: number): boolean => /(?:^|\n)[ \t]*$/.test(source.slice(Math.max(0, at - 200), at));
  const matchDelimiter = (at: number): boolean => {
    DELIMITER_LINE.lastIndex = at;
    const m = DELIMITER_LINE.exec(source);
    if (m) delimiter = m[1] ?? ';';
    return m !== null;
  };

  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    const next = source[i + 1];

    if (ch === '\n') {
      line++;
      i++;
    } else if (
      (ch === '#' && mysql) ||
      (ch === '-' && next === '-' && (!mysql || i + 2 >= source.length || /\s/.test(source.charAt(i + 2))))
    ) {
      const eol = source.indexOf('\n', i);
      i = eol === -1 ? source.length : eol;
    } else if (mysql && ch === '/' && next === '*' && source[i + 2] === '!') {
      // Versioned comments hold code that MySQL runs, so only the wrapper is dropped.
      VERSIONED_OPEN.lastIndex = i;
      const open = VERSIONED_OPEN.exec(source)?.[0] ?? '/*!';
      cuts.push([i, i + open.length]);
      inVersioned = true;
      versionedOpen = { pos: i, line };
      i += open.length;
    } else if (inVersioned && ch === '*' && next === '/') {
      cuts.push([i, i + 2]);
      inVersioned = false;
      i += 2;
    } else if (ch === '/' && next === '*') {
      i = skipTo(i + 2, '*/');
    } else if (source.startsWith(delimiter, i) && !(isTrigger && depth > 0)) {
      const copyData = flush(i);
      i += delimiter.length;
      if (copyData) {
        // pg_dump rows are raw text: not SQL, and an apostrophe in them would open a string.
        const nl = source.indexOf('\n', i);
        COPY_END.lastIndex = nl + 1;
        const end = nl === -1 ? null : COPY_END.exec(source);
        const stop = end ? end.index + end[0].length : source.length;
        for (let k = i; k < stop; k++) if (source[k] === '\n') line++;
        i = stop;
      }
      start = i;
    } else if (/\s/.test(ch)) {
      i++;
    } else if (mysql && /d/i.test(ch) && !firstLine && atLineStart(i) && matchDelimiter(i)) {
      flush(i);
      i = DELIMITER_LINE.lastIndex;
      start = i;
    } else {
      if (!firstLine) {
        firstLine = line;
        firstPos = i;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        // A doubled quote ("it''s") re-opens the string on the next pass, so no special case.
        i = skipString(i + 1, ch);
      } else if (sqlite && ch === '[') {
        i = skipTo(i + 1, ']');
      } else if (sqlite && /[A-Za-z_]/.test(ch) && !/[A-Za-z0-9_$.]/.test(source[i - 1] ?? '')) {
        WORD.lastIndex = i;
        const word = (WORD.exec(source)?.[0] ?? ch).toLowerCase();
        i += word.length;
        if (head.length < 3) {
          head.push(word);
          isTrigger = head[0] === 'create' && (head[1] === 'trigger' || (/^temp(orary)?$/.test(head[1] ?? '') && head[2] === 'trigger'));
        }
        if (isTrigger) {
          // Only the first BEGIN opens the body; later ones are column names.
          if (word === 'begin' && !sawBegin) {
            sawBegin = true;
            depth = 1;
          } else if (depth > 0) {
            depth += word === 'case' ? 1 : word === 'end' ? -1 : 0;
          }
        }
      } else if (dialect === 'postgres' && ch === '$' && !/[A-Za-z0-9_$]/.test(source[i - 1] ?? '')) {
        // Mid-identifier `$` (t$x$) is part of the name in PostgreSQL, not a quote opener.
        const tag = DOLLAR_TAG.exec(source.slice(i, i + 64))?.[0];
        // The closing tag must equal the opening one: `$$` inside a `$fn$` body is plain text.
        i = tag ? skipTo(i + tag.length, tag) : i + 1;
      } else {
        i++;
      }
    }
  }
  const triggerOpen = isTrigger && depth > 0 ? { pos: firstPos, line: firstLine } : null;
  flush(source.length);
  if (triggerOpen && (!open || triggerOpen.pos < open.pos)) open = triggerOpen;
  if (inVersioned && versionedOpen && (!open || versionedOpen.pos < open.pos)) open = versionedOpen;
  if (open) {
    const last = out[out.length - 1];
    if (last && open.pos < lastEnd) last.unterminatedAt = open.line;
    else out.push({ sql: '', line: open.line, unterminatedAt: open.line });
  }
  return out;
}
