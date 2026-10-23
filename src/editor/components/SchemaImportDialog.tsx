import { Field } from '@ark-ui/react/field';
import { useRef, useState } from 'react';
import { Button, Dialog, DialogClose, useDialogs } from '../../design-system';
import { usePreferences } from '../../settings/preferences/PreferencesContext';
import { useEditor } from '../EditorContext';
import { fitBox, rotatedBounds, unionBoxes } from '../geometry';
import { SQL_DIALECTS } from '../model/table';
import { planImport, type ImportPlan } from '../schemaImport/importSchema';
import { parseSql } from '../schemaImport/fromSql';
import { css } from 'styled-system/css';

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
const skippedClass = css({ color: 'text.secondary' });
const problemsClass = css({ color: 'text.danger' });

export function SchemaImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, dispatch } = useEditor();
  const { preferences } = usePreferences();
  const { alert } = useDialogs();
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped on close and on each preview, so a parse that finishes after either is dropped.
  const run = useRef(0);

  // Only PostgreSQL and MySQL grammars are bundled, so a SQLite preference reads as PostgreSQL.
  const dialect = preferences.sqlDialect === 'mysql' ? 'mysql' : 'postgres';

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      run.current++;
      setPlan(null);
      setText('');
      setBusy(false);
    }
  };

  const preview = async () => {
    if (busy) return;
    const mine = ++run.current;
    setBusy(true);
    try {
      const next = await planImport(await parseSql(text, dialect), state.nodes);
      if (mine === run.current) setPlan(next);
    } catch {
      if (mine === run.current) {
        await alert({ title: "Can't read this schema", description: 'Something went wrong while parsing the SQL.' });
      }
    } finally {
      if (mine === run.current) setBusy(false);
    }
  };

  const add = () => {
    if (!plan) return;
    dispatch({ type: 'importNodes', nodes: plan.nodes });
    const tables = plan.nodes.filter((n) => n.type === 'table');
    const bounds = unionBoxes(tables.map((n) => rotatedBounds(n, n.rotation)));
    if (bounds) dispatch({ type: 'setViewport', viewport: fitBox(bounds, state.canvasSize) });
    close(false);
  };

  if (!plan) {
    return (
      <Dialog
        open={open}
        onOpenChange={close}
        title="Import schema"
        description="Paste SQL CREATE TABLE statements."
        actions={
          <>
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
            <Button variant="primary" disabled={text.trim() === '' || busy} aria-busy={busy} onClick={() => void preview()}>
              {busy ? 'Reading…' : 'Preview'}
            </Button>
          </>
        }
      >
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
      </Dialog>
    );
  }

  // Count what Add creates: the parser can report relations that the import then skips.
  const tableNodes = plan.nodes.filter((n) => n.type === 'table');
  const relations = plan.nodes.filter((n) => n.type === 'connector').length;
  const skipped = plan.warnings.filter((w) => w.message.startsWith('Skipped'));
  const problems = plan.warnings.filter((w) => !w.message.startsWith('Skipped'));
  const warningItems = (list: typeof plan.warnings) =>
    list.map((w, i) => <li key={i}>{w.line !== undefined ? `Line ${w.line}: ${w.message}` : w.message}</li>);
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Import schema"
      description="Review what will be added."
      actions={
        <>
          {/* Focus lands on Add, or on Back when there is nothing to add. */}
          <Button key="back" autoFocus={tableNodes.length === 0} onClick={() => setPlan(null)}>
            Back
          </Button>
          {/* Keys make these fresh mounts, which is what lets autoFocus fire. */}
          <Button
            key="add"
            variant="primary"
            data-testid="import-add"
            autoFocus={tableNodes.length > 0}
            disabled={tableNodes.length === 0}
            onClick={add}
          >
            Add to canvas
          </Button>
        </>
      }
    >
      <div className={bodyClass}>
        <div className={summaryClass} data-testid="import-summary">
          <span>{SQL_DIALECTS[dialect].label}</span>
          <span>{tableNodes.length === 1 ? '1 table' : `${tableNodes.length} tables`}</span>
          <span>{relations === 1 ? '1 relationship' : `${relations} relationships`}</span>
        </div>
        <ul className={listClass}>
          {tableNodes.map((t) => (
            <li key={t.id}>{t.name}</li>
          ))}
        </ul>
        <div aria-live="polite" data-testid="import-warnings" className={bodyClass}>
          {skipped.length > 0 && (
            <section className={bodyClass}>
              <h3 className={headingClass}>Skipped</h3>
              <ul className={`${listClass} ${skippedClass}`} data-testid="import-skipped">
                {warningItems(skipped)}
              </ul>
            </section>
          )}
          {problems.length > 0 && (
            <section className={bodyClass}>
              <h3 className={headingClass}>Problems</h3>
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
