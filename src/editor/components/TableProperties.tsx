import { ToggleGroup } from '@ark-ui/react/toggle-group';
import { useState } from 'react';
import { Button, ColorInput, IconButton, icons, Section, TextInput } from '../../design-system';
import { usePreferences } from '../../settings/preferences/PreferencesContext';
import { useEditor } from '../EditorContext';
import { useSectionFold } from '../SectionFoldsContext';
import { createId, nameKey } from '../model/names';
import {
  columnNameTaken,
  COLUMN_TYPES_LIST_ID,
  createColumn,
  indexNameTaken,
  SQL_DIALECTS,
  sqlIdentifier,
  TABLE_ACCENTS,
  uniqueIdentifier,
  type TableEdit,
} from '../model/table';
import type { Column, TableIndex, TableNode } from '../model/types';
import { twoColumnGrid } from '../styles';
import { css } from 'styled-system/css';
import { chipGroup } from 'styled-system/recipes';

const chips = chipGroup();
const editorClass = css({
  display: 'grid',
  gap: '2',
  paddingBlock: '2',
  borderTopWidth: '1px',
  borderTopStyle: 'solid',
  borderTopColor: 'border',
  _first: { borderTopWidth: '0', paddingBlockStart: '0' },
});
const orderClass = css({ margin: '0', color: 'text.secondary' });
const swatchesClass = css({ display: 'flex', flexWrap: 'wrap', gap: '1' });
const swatchClass = css({
  width: 'swatch',
  height: 'swatch',
  padding: '0',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.strong',
  borderRadius: 'small',
  cursor: 'pointer',
  '&[data-state=on]': { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.selected', outlineOffset: '[1px]' },
  _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.selected', outlineOffset: '[1px]' },
});
const flagsRowClass = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2' });

type Flag = 'primaryKey' | 'nullable' | 'unique';
const FLAGS: Array<{ id: Flag; label: string; testId: string }> = [
  { id: 'primaryKey', label: 'PK', testId: 'column-pk' },
  { id: 'nullable', label: 'Null', testId: 'column-nullable' },
  { id: 'unique', label: 'Unique', testId: 'column-unique' },
];

function ColumnEditor({ table, column, edit }: { table: TableNode; column: Column; edit: (e: TableEdit) => void }) {
  const [nameError, setNameError] = useState<string | null>(null);
  const update = (patch: Partial<Omit<Column, 'id'>>) => edit({ kind: 'updateColumn', columnId: column.id, patch });
  return (
    <div className={editorClass} data-testid="column-editor">
      <div className={twoColumnGrid}>
        <TextInput
          value={column.name}
          testId="column-name"
          error={nameError !== null ? `This table already has a column named “${nameError}”.` : undefined}
          onCommit={(value) => {
            const name = value.trim();
            if (columnNameTaken(table, name, column.id)) {
              setNameError(name);
              return;
            }
            setNameError(null);
            update({ name });
          }}
        />
        <TextInput value={column.dataType} list={COLUMN_TYPES_LIST_ID} testId="column-type" onCommit={(dataType) => update({ dataType: dataType.trim() })} />
      </div>
      <div className={flagsRowClass}>
        <ToggleGroup.Root
          className={chips.root}
          multiple
          aria-label={`${column.name} flags`}
          value={FLAGS.filter((f) => column[f.id]).map((f) => f.id)}
          onValueChange={({ value }) => update(Object.fromEntries(FLAGS.map((f) => [f.id, value.includes(f.id)])))}
        >
          {FLAGS.map((f) => (
            <ToggleGroup.Item key={f.id} value={f.id} className={chips.item} data-testid={f.testId}>
              {f.label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        <IconButton
          label={`Delete column ${column.name}`}
          icon={<icons.trash />}
          data-testid="column-delete"
          onClick={() => edit({ kind: 'deleteColumn', columnId: column.id })}
        />
      </div>
    </div>
  );
}

function IndexEditor({ table, index, edit }: { table: TableNode; index: TableIndex; edit: (e: TableEdit) => void }) {
  const [nameError, setNameError] = useState<string | null>(null);
  const update = (patch: Partial<Omit<TableIndex, 'id'>>) => edit({ kind: 'updateIndex', indexId: index.id, patch });
  return (
    <div className={editorClass} data-testid="index-editor">
      <TextInput
        value={index.name}
        testId="index-name"
        error={nameError !== null ? `This table already has an index named “${nameError}”.` : undefined}
        onCommit={(value) => {
          const name = value.trim();
          if (indexNameTaken(table, name, index.id)) {
            setNameError(name);
            return;
          }
          setNameError(null);
          update({ name });
        }}
      />
      <p className={orderClass} data-testid="index-order">
        {index.columnIds.length > 0
          ? index.columnIds.map((id) => table.columns.find((c) => c.id === id)?.name).join(', ')
          : 'Pick its columns, in order:'}
      </p>
      {/* Ark appends a newly pressed value, so the click order becomes the index's column order, shown above. */}
      <ToggleGroup.Root
        className={chips.root}
        multiple
        aria-label={`${index.name} columns`}
        value={index.columnIds}
        onValueChange={({ value }) => update({ columnIds: value })}
      >
        {table.columns.map((c) => (
          <ToggleGroup.Item key={c.id} value={c.id} className={chips.item} data-testid="index-column">
            {c.name}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      <div className={flagsRowClass}>
        <ToggleGroup.Root
          className={chips.root}
          multiple
          aria-label={`${index.name} options`}
          value={index.unique ? ['unique'] : []}
          onValueChange={({ value }) => update({ unique: value.includes('unique') })}
        >
          <ToggleGroup.Item value="unique" className={chips.item} data-testid="index-unique">
            Unique
          </ToggleGroup.Item>
        </ToggleGroup.Root>
        <IconButton
          label={`Delete index ${index.name}`}
          icon={<icons.trash />}
          data-testid="index-delete"
          onClick={() => edit({ kind: 'deleteIndex', indexId: index.id })}
        />
      </div>
    </div>
  );
}

/** Header color, columns and indexes of the selected table. Each change is one undo step. */
export function TableProperties({ table }: { table: TableNode }) {
  const { dispatch } = useEditor();
  const fold = useSectionFold();
  const dialect = SQL_DIALECTS[usePreferences().preferences.sqlDialect];
  const edit = (e: TableEdit) => dispatch({ type: 'editTable', id: table.id, edit: e });

  return (
    <>
      <Section title="Header" {...fold('table-header')}>
        <ToggleGroup.Root
          className={swatchesClass}
          aria-label="Header color"
          value={[table.accent]}
          onValueChange={({ value }) => value[0] && edit({ kind: 'setAccent', accent: value[0] })}
        >
          {TABLE_ACCENTS.map((color, i) => (
            // The swatch's color is its value, so it can only be set inline.
            <ToggleGroup.Item
              key={color}
              value={color}
              aria-label={`Header color ${i + 1}`}
              className={swatchClass}
              style={{ background: color }}
              data-testid="accent-swatch"
            />
          ))}
        </ToggleGroup.Root>
        <ColorInput value={table.accent} testId="prop-accent" onCommit={(accent) => edit({ kind: 'setAccent', accent })} />
      </Section>

      <Section title="Columns" testId="section-columns" {...fold('columns')}>
        <datalist id={COLUMN_TYPES_LIST_ID}>
          {dialect.types.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {table.columns.map((c) => (
          <ColumnEditor key={c.id} table={table} column={c} edit={edit} />
        ))}
        <Button data-testid="add-column" onClick={() => edit({ kind: 'addColumn', column: createColumn('', dialect.defaultType) })}>
          Add column
        </Button>
      </Section>

      <Section title="Indexes" testId="section-indexes" {...fold('indexes')}>
        {table.indexes.map((i) => (
          <IndexEditor key={i.id} table={table} index={i} edit={edit} />
        ))}
        <Button
          data-testid="add-index"
          onClick={() => {
            const name = uniqueIdentifier(`${sqlIdentifier(table.name)}_idx`, new Set(table.indexes.map((i) => nameKey(i.name))));
            edit({ kind: 'addIndex', index: { id: createId(), name, columnIds: [], unique: false } });
          }}
        >
          Add index
        </Button>
      </Section>
    </>
  );
}
