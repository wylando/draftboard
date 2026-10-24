// Detection order (design choice; first match wins). Most specific evidence first:
// 1. SQLite file header bytes: unambiguous, and the text of a binary file is meaningless.
// 2. `.dbml` extension or a leading DBML block: DBML is not SQL, so it must be ruled out before scoring.
// 3. Marker scoring for SQL dialects: dumps are rarely marked by name, so vote on distinctive syntax.
// 4. Otherwise the caller's fallback (the dialect preference); `.sql` says nothing about the dialect.

export type DetectedFormat = 'postgres' | 'mysql' | 'sqlite' | 'dbml' | 'sqlite-db';

const SQLITE_MAGIC = 'SQLite format 3\0';

type Dialect = 'postgres' | 'mysql' | 'sqlite';

// Weight 3 = distinctive to one dialect; 2 = common but also seen elsewhere; 1 = weak hint.
// Each marker counts once however often it appears, so one huge dump table cannot outvote the rest.
// Gaps are bounded: an unbounded lazy gap is quadratic on input like "GENERATED GENERATED ...".
// A winner needs a total of at least MIN_WINNING_SCORE, so weak hints alone never decide.
const MIN_WINNING_SCORE = 2;
const SERIAL_TYPE_ENDS = String.raw`(?=\s*(?:[,);]|$|NOT\b|NULL\b|PRIMARY\b|UNIQUE\b|DEFAULT\b|REFERENCES\b|CONSTRAINT\b))`;

const MARKERS: Record<Dialect, [RegExp, number][]> = {
  mysql: [
    [/\bENGINE\s*=/i, 3],
    [/\bAUTO_INCREMENT\b/i, 3],
    [/\bUNSIGNED\b/i, 2],
    [/\bDEFAULT\s+CHARSET\b/i, 3],
    [/\bLOCK\s+TABLES\b/i, 3],
  ],
  postgres: [
    // After an identifier, never a bare name: MySQL's SERIAL follows a backticked column
    // (stripNoise leaves a lone backtick there), and "CREATE TABLE serial (" is a name.
    [new RegExp(String.raw`[\w"]\s+(?:BIG|SMALL)?SERIAL\b${SERIAL_TYPE_ENDS}`, 'i'), 2],
    [/\bjsonb\b/i, 3],
    [/::/, 2],
    // Only as a function-body quote: MySQL scripts use "DELIMITER $$" and "END$$".
    [/\b(?:AS|DO)\s+\$\$|\$\$\s*LANGUAGE\b/i, 3],
    [/\bpublic\./i, 2],
    [/\bGENERATED\b[^;]{0,200}?\bAS\s+IDENTITY\b/i, 3],
    [/\bOWNER\s+TO\b/i, 3],
    [/\btimestamptz\b/i, 3],
    [/\bCOPY\b[^;]{0,200}?\bFROM\s+stdin\b/i, 3],
    [/\buuid\b(?!\s*\()/i, 2],
    [/\bbytea\b/i, 2],
    [/\b(?:text|int|integer|bigint|varchar|uuid|numeric|boolean)\[\d*\]/i, 2],
    [/\bcharacter\s+varying\b/i, 2],
    [/\bwith(?:out)?\s+time\s+zone\b/i, 2],
    [/\bCREATE\s+(?:EXTENSION|SEQUENCE|TYPE)\b/i, 2],
    // Prisma writes TIMESTAMP(3) for Postgres and DATETIME(3) for MySQL.
    [/\bTIMESTAMP\s*\(\d\)/i, 1],
  ],
  sqlite: [
    [/\bAUTOINCREMENT\b/i, 3],
    [/\bWITHOUT\s+ROWID\b/i, 3],
    [/\bPRAGMA\b/i, 3],
    // Postgres accepts this too, so it only nudges.
    [/\bINTEGER\s+PRIMARY\s+KEY\b/i, 1],
  ],
};

type Stripped = {
  clean: string;
  /** A `/*!` comment: MySQL executes its content, so it is a marker in itself. */
  versioned: boolean;
  /** A paired backtick identifier on one line. A lone or tripled backtick (Markdown fence) doesn't count. */
  backticked: boolean;
  doubleQuoted: boolean;
};

/**
 * Blanks comments and string literals so markers inside them don't score. A backtick
 * identifier is consumed whole, so quotes and comment starts inside it stay inert.
 * Backslash is not an escape: that is MySQL-only, and in Postgres/SQLite `'C:\'` is complete.
 */
function stripNoise(text: string): Stripped {
  const out: Stripped = { clean: '', versioned: false, backticked: false, doubleQuoted: false };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if ((c === '-' && next === '-') || c === '#') {
      i = lineEnd(text, i);
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end;
      if (text[i + 2] === '!') {
        const inner = stripNoise(text.slice(i + 3, stop));
        out.versioned = true;
        out.backticked ||= inner.backticked;
        out.doubleQuoted ||= inner.doubleQuoted;
        out.clean += ` ${inner.clean} `;
      } else {
        out.clean += ' ';
      }
      i = end === -1 ? text.length : end + 2;
    } else if (c === '`') {
      let run = 1;
      while (text[i + run] === '`') run += 1;
      const close = run === 1 ? text.indexOf('`', i + 1) : -1;
      if (close !== -1 && close < lineEnd(text, i)) {
        out.backticked = true;
        out.clean += '`';
        i = close + 1;
      } else {
        out.clean += ' ';
        i += run;
      }
    } else if (c === "'" || c === '"') {
      const end = text.indexOf(c, i + 1);
      if (c === '"' && end !== -1) out.doubleQuoted = true;
      // Keeps a quoted identifier recognizable as an identifier for the SERIAL check.
      out.clean += c === '"' ? '""' : ' ';
      i = end === -1 ? text.length : end + 1;
    } else {
      out.clean += c;
      i += 1;
    }
  }
  return out;
}

function lineEnd(text: string, from: number): number {
  const nl = text.indexOf('\n', from);
  return nl === -1 ? text.length : nl;
}

// Text after leading whitespace and DBML comments (line and block).
function skipDbmlComments(text: string): string {
  let rest = text.trimStart();
  for (;;) {
    if (rest.startsWith('//')) {
      rest = rest.slice(lineEnd(rest, 0)).trimStart();
    } else if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2);
      rest = end === -1 ? '' : rest.slice(end + 2).trimStart();
    } else {
      return rest;
    }
  }
}

const DBML_START =
  /^(?:(?:table|tablepartial|tablegroup|enum|project|note|records)\b[^{;]*\{|ref(?:\s+\w+)?\s*[:{])/i;

export function detectFormat(
  input: { name: string; text: string; bytes?: Uint8Array },
  fallback: Dialect,
): DetectedFormat {
  const { name, text, bytes } = input;

  if (bytes && bytes.length >= SQLITE_MAGIC.length) {
    let isDb = true;
    for (let i = 0; i < SQLITE_MAGIC.length; i++) {
      if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) {
        isDb = false;
        break;
      }
    }
    if (isDb) return 'sqlite-db';
  }

  if (/\.dbml$/i.test(name) || DBML_START.test(skipDbmlComments(text))) return 'dbml';

  const { clean, versioned, backticked, doubleQuoted } = stripNoise(text);
  const scores = (Object.keys(MARKERS) as Dialect[]).map((dialect) => {
    let score = MARKERS[dialect].reduce((sum, [re, weight]) => sum + (re.test(clean) ? weight : 0), 0);
    if (dialect === 'mysql' && versioned) score += 3;
    if (dialect === 'mysql' && backticked) score += 3;
    // Double-quoted identifiers are standard SQL (Postgres, SQLite), not MySQL's default; a
    // tie-breaker against a mysql fallback, never enough alone.
    if (dialect !== 'mysql' && doubleQuoted && !backticked) score += 1;
    return { dialect, score };
  });
  const best = Math.max(...scores.map((s) => s.score));
  const leaders = scores.filter((s) => s.score === best);
  const [leader] = leaders;
  return best >= MIN_WINNING_SCORE && leaders.length === 1 && leader ? leader.dialect : fallback;
}
