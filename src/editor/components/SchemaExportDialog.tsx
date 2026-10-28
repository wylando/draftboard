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
const previewClass = css({
  width: 'full',
  height: '[320px]',
  padding: '2',
  resize: 'vertical',
  fontFamily: 'mono',
  whiteSpace: 'pre',
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

  // The component stays mounted once opened, so skip the work while closed: drags change nodes every frame.
  const schema = useMemo(() => (open ? collectSchema(state.nodes, state.selection) : null), [open, state.nodes, state.selection]);
  const output = useMemo(
    () => (schema === null ? { text: '', warnings: [] } : format === 'sql' ? toSql(schema, dialect) : toDbml(schema, dialect)),
    [schema, format, dialect],
  );
  const tableCount = schema?.tables.length ?? 0;
  const warnings = [...(schema?.warnings ?? []), ...output.warnings];
  const count = tableCount === 1 ? '1 table' : `${tableCount} tables`;
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
        if (!next) setCopied(false);
        onOpenChange(next);
      }}
      title="Export schema"
      description="Writes the tables, keys, indexes and relationships you drew. Column types are written as typed."
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
        <p className={scopeClass} data-testid="export-scope">
          {tableCount === 0 ? 'No tables to export' : `${count} ${schema?.scope === 'selection' ? 'from the selection' : 'on this board'}`}
        </p>
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
        <Field.Root className={bodyClass}>
          <Field.Label className={labelClass}>Preview</Field.Label>
          <Field.Textarea className={previewClass} data-testid="export-preview" readOnly spellCheck={false} wrap="off" value={output.text} />
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
