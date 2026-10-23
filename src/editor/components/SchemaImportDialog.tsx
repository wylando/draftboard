import { Field } from '@ark-ui/react/field';
import { Tabs } from '@ark-ui/react/tabs';
import { ToggleGroup } from '@ark-ui/react/toggle-group';
import { useRef, useState } from 'react';
import { Button, Dialog, DialogClose, useDialogs } from '../../design-system';
import { usePreferences } from '../../settings/preferences/PreferencesContext';
import { useEditor } from '../EditorContext';
import type { DesignNode } from '../model/types';
import { fitBox, rotatedBounds, unionBoxes } from '../geometry';
import { SQL_DIALECTS } from '../model/table';
import { planImport, type ImportPlan } from '../schemaImport/importSchema';
import { parseSql } from '../schemaImport/fromSql';
import { detectFormat, type DetectedFormat } from '../schemaImport/detectFormat';
import { css } from 'styled-system/css';
import { chipGroup, tabs } from 'styled-system/recipes';

const tabsClasses = tabs({ orientation: 'horizontal' });
const chips = chipGroup();
const rowClass = css({ display: 'flex', alignItems: 'center', gap: '2' });
const fileNameClass = css({ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
const hintTextClass = css({ color: 'text.secondary', textStyle: 'body.small' });

type SqlDialectId = 'postgres' | 'mysql';
interface Source {
  name: string;
  text: string;
  /** Leading bytes of a chosen file, for magic-number detection. Absent for pasted text. */
  bytes?: Uint8Array;
}

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
const listClass = css({ margin: '0', paddingInlineStart: '4', maxHeight: '[160px]', overflowY: 'auto' });
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
  const [planDialect, setPlanDialect] = useState<SqlDialectId>('postgres');
  const [planFormat, setPlanFormat] = useState<DetectedFormat>('postgres');
  const [planSource, setPlanSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped on close, Back and each preview, so a parse, Add or Replace that finishes after any of them is dropped.
  const run = useRef(0);

  const source: Source | null = tab === 'file' ? file : { name: '', text };
  const canPreview = source !== null && source.text.trim() !== '' && !reading;

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

  // Only PostgreSQL and MySQL grammars are bundled, so SQLite reads as PostgreSQL.
  const parseWith = async (src: Source, forced?: SqlDialectId) => {
    const title = src.bytes ? "Can't read this file" : "Can't read this schema";
    const format = forced ?? detectFormat(src, preferences.sqlDialect);
    if (format === 'dbml' || format === 'sqlite-db') {
      await alert({
        title,
        description: src.bytes ? 'Only SQL files (PostgreSQL or MySQL) are supported.' : 'Only SQL (PostgreSQL or MySQL) is supported.',
      });
      return null;
    }
    // Checked after detection because a SQLite database also contains NULs and deserves its own message.
    if (src.text.includes('\0')) {
      await alert({ title, description: "This file isn't text." });
      return null;
    }
    const dialect: SqlDialectId = format === 'mysql' ? 'mysql' : 'postgres';
    return { dialect, format, plan: await planImport(await parseSql(src.text, dialect), state.nodes) };
  };

  const preview = async (src: Source, forced?: SqlDialectId) => {
    if (busy) return;
    const mine = ++run.current;
    setBusy(true);
    try {
      const result = await parseWith(src, forced);
      if (result && mine === run.current) {
        setPlan(result.plan);
        setPlanDialect(result.dialect);
        setPlanFormat(result.format);
        setPlanSource(src);
      }
    } catch {
      if (mine === run.current) {
        await alert({ title: "Can't read this schema", description: 'Something went wrong while parsing the SQL.' });
      }
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
      setFile({
        name: picked.name,
        text: new TextDecoder().decode(buf),
        bytes: new Uint8Array(buf, 0, Math.min(16, buf.byteLength)),
      });
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
        title="Import schema"
        description="Paste SQL or choose a .sql file."
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
                accept=".sql,text/plain"
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
            <span>Dialect</span>
            {/* Not disabled while re-parsing: that would drop keyboard focus from the pressed item. */}
            <ToggleGroup.Root
              className={chips.root}
              aria-label="Dialect"
              data-testid="import-format"
              value={[planDialect]}
              deselectable={false}
              onValueChange={({ value }) => {
                const next = value[0] as SqlDialectId | undefined;
                if (next && planSource) void preview(planSource, next);
              }}
            >
              {(['postgres', 'mysql'] as const).map((d) => (
                <ToggleGroup.Item key={d} value={d} className={chips.item} data-value={d}>
                  {SQL_DIALECTS[d].label}
                </ToggleGroup.Item>
              ))}
            </ToggleGroup.Root>
          </div>
          <span>{tableNodes.length === 1 ? '1 table' : `${tableNodes.length} tables`}</span>
          <span>{relations === 1 ? '1 relationship' : `${relations} relationships`}</span>
        </div>
        {planFormat === 'sqlite' && <small className={hintTextClass}>SQLite is read as PostgreSQL.</small>}
        <ul className={listClass}>
          {tableNodes.map((t) => (
            <li key={t.id}>{t.name}</li>
          ))}
        </ul>
        {tableNodes.length === 0 && (
          <section className={bodyClass}>
            <h3 className={headingClass}>No tables found</h3>
            <p className={hintClass}>Check that the text contains CREATE TABLE statements.</p>
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
