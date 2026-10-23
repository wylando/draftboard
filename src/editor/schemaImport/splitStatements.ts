/** One SQL statement and the 1-based line its first token starts on. */
export interface SqlStatement {
  sql: string;
  line: number;
}

const COPY_STDIN = /^(?:\s+|--[^\n]*|\/\*[\s\S]*?\*\/)*copy\b[\s\S]*\bfrom\s+stdin\b/i;
const COPY_END = /^\\\.\r?$/gm;

const DOLLAR_TAG = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/;

export function splitStatements(source: string): SqlStatement[] {
  const out: SqlStatement[] = [];
  let start = 0;
  let line = 1;
  let firstLine = 0; // 0 until the statement has a non-comment character

  const flush = (end: number) => {
    const sql = source.slice(start, end).trim();
    const emit = Boolean(sql && firstLine);
    if (emit) out.push({ sql, line: firstLine });
    firstLine = 0;
    return emit && COPY_STDIN.test(sql);
  };

  const skipTo = (from: number, close: string): number => {
    const found = source.indexOf(close, from);
    const end = found === -1 ? source.length : found + close.length;
    for (let k = from; k < end; k++) if (source[k] === '\n') line++;
    return end;
  };

  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    const next = source[i + 1];

    if (ch === '\n') {
      line++;
      i++;
    } else if (ch === '-' && next === '-') {
      const eol = source.indexOf('\n', i);
      i = eol === -1 ? source.length : eol;
    } else if (ch === '/' && next === '*') {
      i = skipTo(i + 2, '*/');
    } else if (ch === ';') {
      const copyData = flush(i);
      i++;
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
    } else {
      if (!firstLine) firstLine = line;
      if (ch === "'" || ch === '"' || ch === '`') {
        // A doubled quote ("it''s") re-opens the string on the next pass, so no special case.
        i = skipTo(i + 1, ch);
      } else if (ch === '$' && !/[A-Za-z0-9_$]/.test(source[i - 1] ?? '')) {
        // Mid-identifier `$` (t$x$) is part of the name in PostgreSQL, not a quote opener.
        const tag = DOLLAR_TAG.exec(source.slice(i, i + 64))?.[0];
        // The closing tag must equal the opening one: `$$` inside a `$fn$` body is plain text.
        i = tag ? skipTo(i + tag.length, tag) : i + 1;
      } else {
        i++;
      }
    }
  }
  flush(source.length);
  return out;
}
