import { Field } from '@ark-ui/react/field';
import { ToggleGroup } from '@ark-ui/react/toggle-group';
import { useMemo, useState } from 'react';
import { Button, Dialog, DialogClose, useDialogs } from '../../design-system';
import { usePreferences } from '../../settings/preferences/PreferencesContext';
import { useBoards, useEditor } from '../EditorContext';
import { SQL_DIALECTS, sqlIdentifier, type SqlDialect } from '../model/table';
import { downloadText } from '../persistence';
import { collectSchema, toDbml, toSql } from '../schemaExport/exportSchema';
import { css } from 'styled-system/css';
import { chipGroup } from 'styled-system/recipes';

type Format = 'sql' | 'dbml';

const chips = chipGroup();
const bodyClass = css({ display: 'grid', gap: '2', minWidth: '0' });
const rowClass = css({ display: 'flex', alignItems: 'center', gap: '2', flexWrap: 'wrap' });
const labelClass = css({ color: 'text.secondary' });
const scopeClass = css({ margin: '0', textStyle: 'body.mediumStrong' });
const noticeClass = css({ display: 'grid', gap: '1', padding: '2', borderRadius: 'medium', bg: 'warning.bg', color: 'warning.ink' });
const noticeHeadingClass = css({ margin: '0', textStyle: 'body.mediumStrong' });
const noticeListClass = css({ margin: '0', paddingInlineStart: '4' });
// The notice stays amber in both themes, so its button takes the notice's own ink rather than the theme's button colours.
const noticeActionClass = css({ justifySelf: 'start', bg: 'warning.ink', color: 'warning.bg', borderColor: 'warning.ink', _hover: { bg: 'warning.ink', opacity: '0.85' } });
const previewClass = css({
  width: 'full',
  height: '[320px]',
  padding: '2',
  resize: 'vertical',
  fontFamily: 'mono',
  // Long lines wrap rather than clip; the value, and so Copy and Download, is unchanged.
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border',
  borderRadius: 'medium',
  bg: 'bg.secondary',
  _focus: { outline: 'none', borderColor: 'border.selected', bg: 'bg' },
});
const listClass = css({ margin: '0', paddingInlineStart: '4', color: 'text.secondary' });
const statusClass = css({ color: 'text.secondary', marginInlineEnd: 'auto' });

export function SchemaExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state } = useEditor();
  const { boards, activeId } = useBoards();
  const { preferences } = usePreferences();
  const { alert } = useDialogs();
  const [format, setFormat] = useState<Format>('sql');
  // Null follows the SQL dialect setting until the user picks one here.
  const [picked, setDialect] = useState<SqlDialect | null>(null);
  const dialect = picked ?? preferences.sqlDialect;
  const [copied, setCopied] = useState(false);
  const [scope, setScope] = useState<'selection' | 'board'>('selection');
  // Tables added to the selection by "Include linked tables".
  const [linked, setLinked] = useState<string[]>([]);

  // The component stays mounted once opened, so skip the work while closed: drags change nodes every frame.
  const selectionSchema = useMemo(
    () => (open ? collectSchema(state.nodes, [...state.selection, ...linked]) : null),
    [open, state.nodes, state.selection, linked],
  );
  const boardSchema = useMemo(() => (open ? collectSchema(state.nodes, []) : null), [open, state.nodes]);
  const hasSelection = selectionSchema?.scope === 'selection';
  const schema = hasSelection && scope === 'selection' ? selectionSchema : boardSchema;
  const output = useMemo(
    () => (schema === null ? { text: '', warnings: [] } : format === 'sql' ? toSql(schema, dialect) : toDbml(schema, dialect)),
    [schema, format, dialect],
  );
  const tableCount = schema?.tables.length ?? 0;
  const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  const warnings = [...(schema?.warnings ?? []), ...output.warnings];
  const skipped = schema?.skippedLinks ?? [];
  const missing = [...new Set(skipped.flatMap((l) => (l.missingTableId ? [l.missingTableId] : [])))];
  const boardName = boards.find((b) => b.id === activeId)?.name ?? 'schema';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output.text);
      setCopied(true);
    } catch {
      await alert({ title: "Couldn't copy", description: 'The browser blocked clipboard access. Select the text and copy it, or download it instead.' });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCopied(false);
          setScope('selection');
          setLinked([]);
        }
        onOpenChange(next);
      }}
      title="Export schema"
      description="Choose a format. Copy the result or download it."
      actions={
        <>
          {/* A live region, so a screen reader hears that the copy worked. */}
          <span role="status" data-testid="export-status" className={statusClass}>
            {copied ? 'Copied to clipboard' : ''}
          </span>
          <DialogClose asChild>
            <Button>Close</Button>
          </DialogClose>
          <Button data-testid="export-copy" disabled={!output.text} onClick={() => void copy()}>
            Copy
          </Button>
          <Button
            variant="primary"
            data-testid="export-download"
            disabled={!output.text}
            onClick={() => downloadText(output.text, `${sqlIdentifier(boardName)}.${format}`, format === 'sql' ? 'application/sql' : 'text/plain')}
          >
            Download
          </Button>
        </>
      }
    >
      <div className={bodyClass}>
        {hasSelection ? (
          <ToggleGroup.Root
            className={chips.root}
            aria-label="Scope"
            data-testid="export-scope"
            value={[scope]}
            deselectable={false}
            onValueChange={({ value }) => {
              if (value[0]) setScope(value[0] as 'selection' | 'board');
              setCopied(false);
            }}
          >
            <ToggleGroup.Item value="selection" className={chips.item} data-value="selection">
              Selection ({plural(selectionSchema?.tables.length ?? 0, 'table')})
            </ToggleGroup.Item>
            <ToggleGroup.Item value="board" className={chips.item} data-value="board">
              Whole board ({plural(boardSchema?.tables.length ?? 0, 'table')})
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        ) : (
          <p className={scopeClass} data-testid="export-scope">
            {tableCount === 0 ? 'No tables to export' : `${plural(tableCount, 'table')} on this board`}
          </p>
        )}
        <div className={rowClass}>
          <span className={labelClass}>Format</span>
          <ToggleGroup.Root
            className={chips.root}
            aria-label="Format"
            data-testid="export-format"
            value={[format]}
            deselectable={false}
            onValueChange={({ value }) => {
              if (value[0]) setFormat(value[0] as Format);
              setCopied(false);
            }}
          >
            <ToggleGroup.Item value="sql" className={chips.item} data-value="sql">
              SQL
            </ToggleGroup.Item>
            <ToggleGroup.Item value="dbml" className={chips.item} data-value="dbml">
              DBML
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>
        {format === 'sql' && (
          <div className={rowClass}>
            <span className={labelClass}>Dialect</span>
            <ToggleGroup.Root
              className={chips.root}
              aria-label="Dialect"
              data-testid="export-dialect"
              value={[dialect]}
              deselectable={false}
              onValueChange={({ value }) => {
                if (value[0]) setDialect(value[0] as SqlDialect);
                setCopied(false);
              }}
            >
              {(['postgres', 'mysql', 'sqlite'] as const).map((d) => (
                <ToggleGroup.Item key={d} value={d} className={chips.item} data-value={d}>
                  {SQL_DIALECTS[d].label}
                </ToggleGroup.Item>
              ))}
            </ToggleGroup.Root>
          </div>
        )}
        {skipped.length > 0 && (
          <section className={noticeClass} data-testid="export-notice">
            <h3 className={noticeHeadingClass}>{plural(skipped.length, 'relationship')} left out</h3>
            <ul className={noticeListClass} data-testid="export-skipped">
              {skipped.map((l, i) => (
                <li key={i}>
                  {l.ends}: {l.reason}
                </li>
              ))}
            </ul>
            {missing.length > 0 && hasSelection && scope === 'selection' && (
              <Button className={noticeActionClass} data-testid="export-include-linked" onClick={() => setLinked([...linked, ...missing])}>
                Include linked tables
              </Button>
            )}
          </section>
        )}
        <Field.Root className={bodyClass}>
          <Field.Label className={labelClass}>Preview</Field.Label>
          <Field.Textarea className={previewClass} data-testid="export-preview" readOnly spellCheck={false} value={output.text} />
        </Field.Root>
        {warnings.length > 0 && (
          <ul className={listClass} data-testid="export-warnings">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
