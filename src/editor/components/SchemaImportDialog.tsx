import { Field } from '@ark-ui/react/field';
import { Tabs } from '@ark-ui/react/tabs';
import { ToggleGroup } from '@ark-ui/react/toggle-group';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, DialogClose, useDialogs } from '../../design-system';
import { usePreferences } from '../../settings/preferences/PreferencesContext';
import { useEditor } from '../EditorContext';
import type { DesignNode } from '../model/types';
import { fitBox, rotatedBounds, unionBoxes } from '../geometry';
import { SQL_DIALECTS } from '../model/table';
import type { ImportedSchema } from '../schemaImport/types';
import { inferRelations } from '../schemaImport/inferRelations';
import { planImport, type ImportPlan } from '../schemaImport/importSchema';
import { parseSql } from '../schemaImport/fromSql';
import { detectFormat } from '../schemaImport/detectFormat';
import { css } from 'styled-system/css';
import { chipGroup, tabs } from 'styled-system/recipes';

const tabsClasses = tabs({ orientation: 'horizontal' });
const chips = chipGroup();
const rowClass = css({ display: 'flex', alignItems: 'center', gap: '2' });
const fileNameClass = css({ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
const hintTextClass = css({ color: 'text.secondary', textStyle: 'body.small' });

/** What the preview was parsed as. `sqlite-db` is a binary database file, which has no SQL text to re-parse. */
type SqlKind = 'postgres' | 'mysql' | 'sqlite';
type ParsedAs = SqlKind | 'sqlite-db' | 'dbml';
interface Source {
  name: string;
  text: string;
  /** Leading bytes of a chosen file, for magic-number detection. Absent for pasted text. */
  bytes?: Uint8Array;
  /** The whole file, kept only for a SQLite database (its `text` is empty then). */
  data?: Uint8Array;
}

/** Guesses listed before "Show more"; a wide schema can have dozens. */
const GUESSES_SHOWN = 8;

/** Lists past this many items add nothing a reader will scan, and thousands of nodes slow the dialog. */
const MAX_LISTED = 100;

const bodyClass = css({ display: 'grid', gap: '2', minWidth: '0' });
const labelClass = css({ color: 'text.secondary' });
const textareaClass = css({
  width: 'full',
  height: '[240px]',
  padding: '2',
  resize: 'vertical',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border',
  borderRadius: 'medium',
  bg: 'bg.secondary',
  _focus: { outline: 'none', borderColor: 'border.selected', bg: 'bg' },
});
const summaryClass = css({ display: 'flex', gap: '3', textStyle: 'body.mediumStrong' });
const listClass = css({ margin: '0', paddingInlineStart: '4' });
const countsClass = css({ display: 'flex', gap: '3' });
const headingClass = css({ margin: '0', textStyle: 'body.mediumStrong' });
const hintClass = css({ margin: '0', color: 'text.secondary' });
const skippedClass = css({ color: 'text.secondary' });
const problemsClass = css({ color: 'text.danger' });

export function SchemaImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, dispatch } = useEditor();
  const { preferences } = usePreferences();
  const { alert, confirm } = useDialogs();
  const [text, setText] = useState('');
  const [tab, setTab] = useState<'paste' | 'file'>('paste');
  const [file, setFile] = useState<Source | null>(null);
  const [reading, setReading] = useState(false);
  // Separate from `run`: picking a file mustn't cancel a parse, but closing the dialog cancels both.
  const fileRead = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [planDialect, setPlanDialect] = useState<ParsedAs>('postgres');
  const [planSource, setPlanSource] = useState<Source | null>(null);
  // DBML is parsed once; changing "Column types" re-maps this schema instead of parsing again.
  const [dbmlSchema, setDbmlSchema] = useState<ImportedSchema | null>(null);
  const [typeDialect, setTypeDialect] = useState<SqlKind>('postgres');
  // The parsed schema before any guess is ticked: ticks are applied on top of it, so unticking restores it exactly.
  const [baseSchema, setBaseSchema] = useState<ImportedSchema | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set());
  const [guessesShown, setGuessesShown] = useState(GUESSES_SHOWN);
  const guessesRef = useRef<HTMLElement>(null);
  // Set when "Show more" is pressed; the effect below moves focus once the new rows exist.
  const focusGuess = useRef<number | null>(null);
  const guessesTitleId = useId();
  const guessesHintId = useId();
  const guesses = useMemo(() => (baseSchema ? inferRelations(baseSchema) : []), [baseSchema]);
  const [busy, setBusy] = useState(false);
  // Bumped on close, Back and each preview, so a parse, Add or Replace that finishes after any of them is dropped.
  const run = useRef(0);

  const source: Source | null = tab === 'file' ? file : { name: '', text };
  const canPreview = source !== null && (source.data !== undefined || source.text.trim() !== '') && !reading;

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      run.current++;
      fileRead.current++;
      setReading(false);
      setPlan(null);
      setText('');
      setFile(null);
      setTab('paste');
      setBusy(false);
    }
  };

  // A fresh plan means fresh guesses, so earlier ticks no longer refer to anything.
  const showPlan = (next: ImportPlan) => {
    setPlan(next);
    setBaseSchema(next.schema);
    setTicked(new Set());
    setGuessesShown(GUESSES_SHOWN);
  };

  useEffect(() => {
    if (focusGuess.current === null) return;
    guessesRef.current?.querySelector<HTMLInputElement>(`[data-testid="guess-${focusGuess.current}"] input`)?.focus();
    focusGuess.current = null;
  }, [guessesShown]);

  const applyTicks = async (next: ReadonlySet<number>) => {
    if (!baseSchema || busy) return;
    const mine = ++run.current;
    setBusy(true);
    try {
      const relations = [...baseSchema.relations, ...guesses.filter((_, i) => next.has(i))];
      const replanned = await planImport({ ...baseSchema, relations }, state.nodes);
      if (mine === run.current) {
        setPlan(replanned);
        setTicked(next);
      }
    } catch {
      if (mine === run.current) await alert({ title: "Can't read this schema", description: 'Something went wrong while updating the relationships.' });
    } finally {
      if (mine === run.current) setBusy(false);
    }
  };

  const toggleGuess = (index: number, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(index);
    else next.delete(index);
    return applyTicks(next);
  };

  const toggleAllGuesses = (on: boolean) => applyTicks(on ? new Set(guesses.keys()) : new Set());

  const parseWith = async (src: Source, forced?: SqlKind) => {
    const title = src.bytes ? "Can't read this file" : "Can't read this schema";
    const format = forced ?? detectFormat(src, preferences.sqlDialect);
    // sql.js, its wasm and the DBML compiler are large, so they load only on their own paths.
    if (format === 'sqlite-db') {
      const { parseSqliteDb } = await import('../schemaImport/fromSqlite');
      // A detected database always came from a file, which keeps its bytes in `data`.
      return { dialect: format, plan: await planImport(await parseSqliteDb(src.data ?? new Uint8Array()), state.nodes) };
    }
    if (src.text.includes('\0')) {
      await alert({ title, description: "This file isn't text." });
      return null;
    }
    if (format === 'dbml') {
      const [{ parseDbml }, { mapSchemaTypes }] = await Promise.all([import('../schemaImport/fromDbml'), import('../schemaImport/mapTypes')]);
      const schema = await parseDbml(src.text);
      return { dialect: format, schema, plan: await planImport(mapSchemaTypes(schema, preferences.sqlDialect), state.nodes) };
    }
    if (format === 'sqlite') {
      const { parseSqliteSql } = await import('../schemaImport/fromSqlite');
      return { dialect: format, plan: await planImport(await parseSqliteSql(src.text), state.nodes) };
    }
    return { dialect: format, plan: await planImport(await parseSql(src.text, format), state.nodes) };
  };

  const preview = async (src: Source, forced?: SqlKind) => {
    if (busy) return;
    const mine = ++run.current;
    setBusy(true);
    try {
      const result = await parseWith(src, forced);
      if (result && mine === run.current) {
        showPlan(result.plan);
        setPlanDialect(result.dialect);
        setPlanSource(src);
        setDbmlSchema(result.dialect === 'dbml' ? result.schema : null);
        setTypeDialect(preferences.sqlDialect);
      }
    } catch {
      if (mine === run.current) {
        await alert({ title: "Can't read this schema", description: 'Something went wrong while parsing the SQL.' });
      }
    } finally {
      if (mine === run.current) setBusy(false);
    }
  };

  const remapTypes = async (next: SqlKind) => {
    if (!dbmlSchema || busy) return;
    const mine = ++run.current;
    setBusy(true);
    try {
      const { mapSchemaTypes } = await import('../schemaImport/mapTypes');
      const mapped = await planImport(mapSchemaTypes(dbmlSchema, next), state.nodes);
      if (mine === run.current) {
        showPlan(mapped);
        setTypeDialect(next);
      }
    } catch {
      if (mine === run.current) await alert({ title: "Can't read this schema", description: 'Something went wrong while mapping the column types.' });
    } finally {
      if (mine === run.current) setBusy(false);
    }
  };

  const chooseFile = async (picked: File | undefined) => {
    if (!picked) return;
    const mine = ++fileRead.current;
    setReading(true);
    try {
      const buf = await picked.arrayBuffer();
      if (mine !== fileRead.current) return;
      const bytes = new Uint8Array(buf, 0, Math.min(16, buf.byteLength));
      // A database is parsed from its bytes; decoding megabytes of binary as text would be wasted work.
      const isDb = detectFormat({ name: picked.name, text: '', bytes }, 'postgres') === 'sqlite-db';
      setFile(
        isDb
          ? { name: picked.name, text: '', bytes, data: new Uint8Array(buf) }
          : { name: picked.name, text: new TextDecoder().decode(buf), bytes },
      );
    } catch {
      if (mine === fileRead.current) await alert({ title: "Can't read this file", description: 'The browser could not read that file.' });
    } finally {
      if (mine === fileRead.current) setReading(false);
    }
  };

  const showTables = (nodes: DesignNode[]) => {
    const tables = nodes.filter((n) => n.type === 'table');
    const bounds = unionBoxes(tables.map((n) => rotatedBounds(n, n.rotation)));
    if (bounds) dispatch({ type: 'setViewport', viewport: fitBox(bounds, state.canvasSize) });
  };

  const add = () => {
    if (!plan) return;
    dispatch({ type: 'importNodes', nodes: plan.nodes });
    showTables(plan.nodes);
    close(false);
  };

  const replace = async () => {
    if (!plan || busy) return;
    const mine = run.current;
    setBusy(true);
    try {
      // Loading clears undo history, so replacing anything, even an emptied canvas with history, can't be taken back.
      if (state.nodes.length > 0 || state.past.length > 0) {
        const ok = await confirm({
          title: 'Replace the current design?',
          description: 'Importing replaces everything on the canvas and clears undo history. Export first to keep a copy.',
          confirmLabel: 'Replace',
        });
        if (!ok || mine !== run.current) return;
      }
      // Planned against an empty document: nothing to rename around, and the block starts at the origin.
      const fresh = await planImport(plan.schema, []);
      if (mine !== run.current) return;
      dispatch({ type: 'loadDocument', nodes: fresh.nodes });
      showTables(fresh.nodes);
      close(false);
    } catch {
      if (mine === run.current) {
        await alert({ title: "Can't read this schema", description: 'Something went wrong while building the tables.' });
      }
    } finally {
      if (mine === run.current) setBusy(false);
    }
  };

  const back = () => {
    run.current++;
    setBusy(false);
    setPlan(null);
  };

  if (!plan) {
    return (
      <Dialog
        open={open}
        onOpenChange={close}
        bodyKey="source"
        title="Import schema"
        description="Paste SQL or DBML, or choose a .sql or .dbml file or SQLite database."
        actions={
          <>
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
            <Button
              variant="primary"
              disabled={!canPreview || busy}
              aria-busy={busy}
              onClick={() => source && void preview(source)}
            >
              {busy ? 'Reading…' : 'Preview'}
            </Button>
          </>
        }
      >
        <Tabs.Root
          className={tabsClasses.root}
          value={tab}
          onValueChange={({ value }) => setTab(value as 'paste' | 'file')}
          lazyMount
          unmountOnExit
        >
          <Tabs.List className={tabsClasses.list} aria-label="Schema source">
            <Tabs.Trigger value="paste" className={tabsClasses.trigger} data-testid="schema-tab-paste">
              Paste
            </Tabs.Trigger>
            <Tabs.Trigger value="file" className={tabsClasses.trigger} data-testid="schema-tab-file">
              File
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="paste" className={tabsClasses.content}>
            <Field.Root className={bodyClass}>
              <Field.Label className={labelClass}>Schema</Field.Label>
              <Field.Textarea
                className={textareaClass}
                data-testid="schema-source"
                spellCheck={false}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field.Root>
          </Tabs.Content>
          <Tabs.Content value="file" className={tabsClasses.content}>
            <div className={rowClass}>
              <Button onClick={() => fileInput.current?.click()}>Choose file…</Button>
              <span className={fileNameClass}>{reading ? 'Reading…' : file ? file.name : 'No file chosen'}</span>
              <input
                ref={fileInput}
                type="file"
                accept=".sql,.dbml,.db,.sqlite,.sqlite3,text/plain"
                hidden
                data-testid="schema-file"
                onChange={(e) => {
                  void chooseFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            <small className={hintTextClass}>The file is read in this browser. Nothing is uploaded.</small>
          </Tabs.Content>
        </Tabs.Root>
      </Dialog>
    );
  }

  // Count what Add creates: the parser can report relations that the import then skips.
  const tableNodes = plan.nodes.filter((n) => n.type === 'table');
  const relations = plan.nodes.filter((n) => n.type === 'connector').length;
  const skipped = plan.warnings.filter((w) => w.message.startsWith('Skipped'));
  const problems = plan.warnings.filter((w) => !w.message.startsWith('Skipped'));
  const warningItems = (list: typeof plan.warnings) => [
    ...list
      .slice(0, MAX_LISTED)
      .map((w, i) => <li key={i}>{w.line !== undefined ? `Line ${w.line}: ${w.message}` : w.message}</li>),
    ...(list.length > MAX_LISTED ? [<li key="more">…and {(list.length - MAX_LISTED).toLocaleString('en-US')} more</li>] : []),
  ];
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      bodyKey="preview"
      title="Import schema"
      description="Add to canvas keeps your layers and renames clashing tables. Replace document loads only these tables, with their own names."
      actions={
        <>
          {/* Focus lands on Add, or on Back when there is nothing to add. */}
          <Button key="back" autoFocus={tableNodes.length === 0} disabled={busy} onClick={back}>
            Back
          </Button>
          {/* Keys make these fresh mounts, which is what lets autoFocus fire. */}
          <Button key="replace" data-testid="import-replace" disabled={tableNodes.length === 0 || busy} onClick={() => void replace()}>
            Replace document…
          </Button>
          <Button
            key="add"
            variant="primary"
            data-testid="import-add"
            autoFocus={tableNodes.length > 0}
            disabled={tableNodes.length === 0 || busy}
            onClick={add}
          >
            Add to canvas
          </Button>
        </>
      }
    >
      <div className={bodyClass}>
        <div className={summaryClass} data-testid="import-summary">
          <div className={rowClass}>
            {planDialect === 'dbml' && <span>DBML</span>}
            <span>{planDialect === 'dbml' ? 'Column types' : 'Dialect'}</span>
            {planDialect === 'sqlite-db' ? (
              <span>SQLite database</span>
            ) : (
              /* Not disabled while re-parsing: that would drop keyboard focus from the pressed item. */
              <ToggleGroup.Root
                className={chips.root}
                aria-label={planDialect === 'dbml' ? 'Column types' : 'Dialect'}
                data-testid="import-format"
                value={[planDialect === 'dbml' ? typeDialect : planDialect]}
                deselectable={false}
                onValueChange={({ value }) => {
                  const next = value[0] as SqlKind | undefined;
                  if (!next) return;
                  if (planDialect === 'dbml') void remapTypes(next);
                  else if (planSource) void preview(planSource, next);
                }}
              >
                {(['postgres', 'mysql', 'sqlite'] as const).map((d) => (
                  <ToggleGroup.Item key={d} value={d} className={chips.item} data-value={d}>
                    {SQL_DIALECTS[d].label}
                  </ToggleGroup.Item>
                ))}
              </ToggleGroup.Root>
            )}
          </div>
          {/* A live region, so a tick's change to the relationship count is announced. */}
          <div role="status" aria-live="polite" data-testid="import-counts" className={countsClass}>
            <span>{tableNodes.length === 1 ? '1 table' : `${tableNodes.length} tables`}</span>
            <span>{relations === 1 ? '1 relationship' : `${relations} relationships`}</span>
          </div>
        </div>
        <ul className={listClass}>
          {tableNodes.map((t) => (
            <li key={t.id}>{t.name}</li>
          ))}
        </ul>
        {guesses.length > 0 && (
          <section
            ref={guessesRef}
            role="group"
            aria-labelledby={guessesTitleId}
            aria-describedby={guessesHintId}
            data-testid="guess-group"
            className={bodyClass}
          >
            <h3 id={guessesTitleId} className={headingClass}>
              Guessed relationships ({guesses.length.toLocaleString('en-US')})
            </h3>
            <p id={guessesHintId} className={hintClass}>
              Matched by column names, like user_id → users. Not foreign keys in the source.
            </p>
            {/* Not disabled while re-planning: that would drop keyboard focus from the checkbox. */}
            <Checkbox
              data-testid="guess-all"
              checked={ticked.size === guesses.length ? true : ticked.size > 0 ? 'indeterminate' : false}
              onCheckedChange={(on) => void toggleAllGuesses(on)}
            >
              Select all
            </Checkbox>
            {guesses.slice(0, guessesShown).map((g, i) => (
              <Checkbox key={i} data-testid={`guess-${i}`} checked={ticked.has(i)} onCheckedChange={(on) => void toggleGuess(i, on)}>
                {`${g.fromTable}.${g.fromColumn} → ${g.toTable}.${g.toColumn}`}
              </Checkbox>
            ))}
            {guessesShown < guesses.length && (
              <Button
                onClick={() => {
                  focusGuess.current = guessesShown;
                  setGuessesShown(guessesShown + MAX_LISTED);
                }}
              >
                Show more ({(guesses.length - guessesShown).toLocaleString('en-US')} left)
              </Button>
            )}
          </section>
        )}
        {tableNodes.length === 0 && (
          <section className={bodyClass}>
            <h3 className={headingClass}>No tables found</h3>
            <p className={hintClass}>
              {planDialect === 'sqlite-db'
                ? "The database has no tables, or it isn't a readable SQLite file."
                : planDialect === 'dbml'
                  ? // Only a syntax error carries a line; a valid file with just enums or notes has none.
                    plan.warnings.some((w) => w.line !== undefined)
                    ? 'Fix the DBML errors listed below.'
                    : 'Check that the text contains Table blocks.'
                  : 'Check that the text contains CREATE TABLE statements.'}
            </p>
          </section>
        )}
        <div aria-live="polite" data-testid="import-warnings" className={bodyClass}>
          {skipped.length > 0 && (
            <section className={bodyClass}>
              <h3 className={headingClass}>Skipped ({skipped.length.toLocaleString('en-US')})</h3>
              <ul className={`${listClass} ${skippedClass}`} data-testid="import-skipped">
                {warningItems(skipped)}
              </ul>
            </section>
          )}
          {problems.length > 0 && (
            <section className={bodyClass}>
              <h3 className={headingClass}>Problems ({problems.length.toLocaleString('en-US')})</h3>
              <ul className={`${listClass} ${problemsClass}`} data-testid="import-problems">
                {warningItems(problems)}
              </ul>
            </section>
          )}
        </div>
      </div>
    </Dialog>
  );
}
