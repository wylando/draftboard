import { Accordion } from '@ark-ui/react/accordion';
import { Combobox, createListCollection } from '@ark-ui/react/combobox';
import { ToggleGroup } from '@ark-ui/react/toggle-group';
import { Fragment, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, ColorInput, IconButton, icons, Section, TextInput } from '../../design-system';
import { usePreferences } from '../../settings/preferences/PreferencesContext';
import { useEditor } from '../EditorContext';
import { fuzzyFilter } from '../fuzzyMatch';
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
import { accordion, chipGroup, combobox } from 'styled-system/recipes';

const chips = chipGroup();
const rows = accordion();
const picker = combobox();
// Design choice: past this many columns each one folds to a one-line row.
const FOLD_COLUMNS_AFTER = 3;
// Design choice: past this many, the rest wait behind "Show more".
const LISTED_COLUMNS = 5;
const editorClass = css({
  display: 'grid',
  gap: '2',
  paddingBlock: '2',
  borderTopWidth: '1px',
  borderTopStyle: 'solid',
  borderTopColor: 'border',
  _first: { borderTopWidth: '0', paddingBlockStart: '0' },
});
const swatchesClass = css({ display: 'flex', flexWrap: 'wrap', gap: '1' });
const swatchClass = css({
  width: 'swatch',
  height: 'swatch',
  padding: '0',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.control',
  borderRadius: 'small',
  cursor: 'pointer',
  '&[data-state=on]': { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.focus', outlineOffset: '[1px]' },
  _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.focus', outlineOffset: '[1px]' },
});
const rowNameClass = css({ flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
const rowTypeClass = css({ maxWidth: '[50%]', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'text.secondary' });
const rowBadgeClass = css({ flex: 'none', textStyle: 'body.medium', color: 'text.secondary' });
const newColumnLabel = css({ margin: '0', textStyle: 'body.medium', color: 'text.secondary' });
const flagsRowClass = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2' });

type Flag = 'primaryKey' | 'nullable' | 'unique';
const FLAGS: Array<{ id: Flag; label: string; testId: string }> = [
  { id: 'primaryKey', label: 'PK', testId: 'column-pk' },
  { id: 'nullable', label: 'Null', testId: 'column-nullable' },
  { id: 'unique', label: 'Unique', testId: 'column-unique' },
];

function ColumnEditor({
  table,
  column,
  edit,
  picked,
  autoSelect,
  onAutoSelected,
}: {
  table: TableNode;
  column: Column;
  edit: (e: TableEdit) => void;
  /** Picked on the canvas: scrolls into view, with its row when folded, so the pick visibly lands. */
  picked: boolean;
  autoSelect?: boolean;
  onAutoSelected?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  // Here, not in the list: Ark mounts a row's editor a render after it opens, and the editor is what must be seen.
  useEffect(() => {
    if (!picked) return;
    const el = root.current;
    (el?.closest('[data-part=item]') ?? el)?.scrollIntoView({ block: 'nearest' });
  }, [picked]);
  const [nameError, setNameError] = useState<string | null>(null);
  const update = (patch: Partial<Omit<Column, 'id'>>) => edit({ kind: 'updateColumn', columnId: column.id, patch });
  return (
    <div ref={root} className={editorClass} data-testid="column-editor">
      <div className={twoColumnGrid}>
        <TextInput
          value={column.name}
          autoSelect={autoSelect}
          onAutoSelected={onAutoSelected}
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

const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** Picks an index's columns with a fuzzy search; the chips show their order, and dragging one reorders them. */
function IndexColumnPicker({ table, index, update }: { table: TableNode; index: TableIndex; update: (patch: Partial<Omit<TableIndex, 'id'>>) => void }) {
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState<{ id: string; order: string[] } | null>(null);
  const chipEls = useRef(new Map<string, HTMLElement>());
  // Ends a drag still held when the picker goes away (selection changed, index deleted), without committing.
  const cancelDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelDrag.current?.(), []);
  const options = fuzzyFilter(table.columns, query, (c) => c.name);
  const collection = createListCollection({ items: options, itemToValue: (c) => c.id, itemToString: (c) => c.name });
  const nameOf = (id: string) => table.columns.find((c) => c.id === id)?.name ?? '';

  const startDrag = (id: string) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault();
    const start = index.columnIds;
    // Measured once, so the preview reshuffling the chips doesn't move the targets under the pointer.
    const rects = new Map(start.map((other) => [other, chipEls.current.get(other)?.getBoundingClientRect()]));
    let order = start;
    const move = (ev: PointerEvent) => {
      const others = start.filter((other) => other !== id);
      // Reading order: a chip comes before the pointer when its row is above, or it is on the pointer's row and left of it.
      const before = others.filter((other) => {
        const r = rects.get(other);
        return r !== undefined && (r.bottom < ev.clientY || (ev.clientY >= r.top && r.left + r.width / 2 < ev.clientX));
      }).length;
      order = [...others.slice(0, before), id, ...others.slice(before)];
      setDragging({ id, order });
    };
    const end = (commit: boolean) => () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      cancelDrag.current = null;
      setDragging(null);
      if (commit && !sameOrder(order, start)) update({ columnIds: order });
    };
    const onUp = end(true);
    const onCancel = end(false);
    cancelDrag.current = onCancel;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  // Stopped here so the editor's window shortcuts (nudge, delete the selection) don't see these keys.
  const chipKeys = (id: string) => (e: ReactKeyboardEvent) => {
    const at = index.columnIds.indexOf(id);
    const to = e.altKey && e.key === 'ArrowLeft' ? at - 1 : e.altKey && e.key === 'ArrowRight' ? at + 1 : null;
    if (to !== null) {
      e.preventDefault();
      e.stopPropagation();
      if (to < 0 || to >= index.columnIds.length) return;
      const order = index.columnIds.filter((other) => other !== id);
      order.splice(to, 0, id);
      update({ columnIds: order });
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      e.stopPropagation();
      update({ columnIds: index.columnIds.filter((other) => other !== id) });
    }
  };

  return (
    <Combobox.Root
      className={picker.root}
      collection={collection}
      multiple
      openOnClick
      inputValue={query}
      onInputValueChange={({ inputValue }) => setQuery(inputValue)}
      value={index.columnIds}
      onValueChange={({ value }) => update({ columnIds: value })}
      // Fixed, so the scrolling panel doesn't clip the list.
      positioning={{ strategy: 'fixed', sameWidth: true }}
      lazyMount
      unmountOnExit
    >
      <Combobox.Control className={picker.control}>
        {(dragging?.order ?? index.columnIds).map((id) => (
          <span
            key={id}
            ref={(el) => {
              if (el) chipEls.current.set(id, el);
              else chipEls.current.delete(id);
            }}
            className={picker.chip}
            data-testid="index-chip"
            data-dragging={dragging?.id === id ? '' : undefined}
            tabIndex={0}
            aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Backspace"
            onPointerDown={startDrag(id)}
            onKeyDown={chipKeys(id)}
          >
            {nameOf(id)}
            <button
              type="button"
              className={picker.chipRemove}
              aria-label={`Remove ${nameOf(id)} from ${index.name}`}
              onClick={() => update({ columnIds: index.columnIds.filter((other) => other !== id) })}
            >
              <icons.close />
            </button>
          </span>
        ))}
        <Combobox.Input
          className={picker.input}
          placeholder={index.columnIds.length > 0 ? 'Add column' : 'Search columns'}
          aria-label={`${index.name} columns`}
          data-testid="index-column-search"
        />
      </Combobox.Control>
      <Combobox.Positioner className={picker.positioner}>
        <Combobox.Content className={picker.content}>
          {options.length === 0 && <p className={picker.empty}>No matching columns</p>}
          {options.map((c) => (
            <Combobox.Item key={c.id} item={c} className={picker.item} data-testid="index-column-option">
              <Combobox.ItemText>{c.name}</Combobox.ItemText>
              <Combobox.ItemIndicator className={picker.itemIndicator}>
                <icons.check />
              </Combobox.ItemIndicator>
            </Combobox.Item>
          ))}
        </Combobox.Content>
      </Combobox.Positioner>
    </Combobox.Root>
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
      <IndexColumnPicker table={table} index={index} update={update} />
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
  const { state, dispatch } = useEditor();
  const fold = useSectionFold();
  const dialect = SQL_DIALECTS[usePreferences().preferences.sqlDialect];
  const edit = (e: TableEdit) => dispatch({ type: 'editTable', id: table.id, edit: e });

  const [openColumns, setOpenColumns] = useState<string[]>([]);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [newColumn, setNewColumn] = useState<string | null>(null);
  const [draftColumn, setDraftColumn] = useState<string | null>(null);
  // Only a folded list sets a column apart; a shorter one shows every column's editor anyway.
  const draft = table.columns.length > FOLD_COLUMNS_AFTER ? table.columns.find((c) => c.id === draftColumn) : undefined;
  if (draftColumn !== null && !draft) setDraftColumn(null);
  // Cleared once the new name field has taken focus, so a later remount (redo, the list unfolding) doesn't take it again.
  const columnEditor = (c: Column) => (
    <ColumnEditor
      table={table}
      column={c}
      edit={edit}
      picked={c.id === picked}
      autoSelect={c.id === newColumn}
      onAutoSelected={() => setNewColumn(null)}
    />
  );
  // Design choice: a column picked on the canvas opens in its place, showing the whole list if it was hidden.
  const picked = state.selectedColumn?.tableId === table.id ? state.selectedColumn.columnId : null;
  const [seenPick, setSeenPick] = useState<string | null>(null);
  if (picked !== seenPick) {
    setSeenPick(picked);
    if (picked) {
      if (!openColumns.includes(picked)) setOpenColumns([...openColumns, picked]);
      if (table.columns.filter((c) => c !== draft).findIndex((c) => c.id === picked) >= LISTED_COLUMNS) setShowAllColumns(true);
    }
  }
  const [openIndexId, setOpenIndex] = useState<string | null>(null);
  // An id left over from a deleted index must not reopen it on undo.
  const openIndex = table.indexes.some((i) => i.id === openIndexId) ? openIndexId : null;
  if (openIndexId !== null && openIndex === null) setOpenIndex(null);
  // Design choice: an index is edited in place and folds back to one line on a press outside it
  // (or focus moving elsewhere). Capture, because the canvas handles its own presses.
  useEffect(() => {
    if (!openIndex) return;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-index-id]')?.getAttribute('data-index-id') === openIndex) return;
      // Fields commit their draft on blur; folding unmounts them before the press would move focus.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.closest(`[data-index-id="${openIndex}"]`)) focused.blur();
      setOpenIndex(null);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [openIndex]);
  const columnName = (id: string) => table.columns.find((c) => c.id === id)?.name;
  const foldColumns = table.columns.length > FOLD_COLUMNS_AFTER;
  const filedColumns = draft ? table.columns.filter((c) => c !== draft) : table.columns;
  const headColumns = filedColumns.slice(0, LISTED_COLUMNS);
  const restColumns = filedColumns.slice(LISTED_COLUMNS);
  const tailColumns = showAllColumns ? restColumns : [];
  const hiddenColumns = restColumns.length - tailColumns.length;
  const columnRow = (c: Column) => (
    <Accordion.Item key={c.id} value={c.id} className={rows.item}>
      <Accordion.ItemTrigger className={rows.itemTrigger} data-testid="column-row">
        <span className={rowNameClass}>{c.name}</span>
        <span className={rowTypeClass}>
          {c.dataType}
          {c.nullable && '?'}
        </span>
        {(c.primaryKey || c.unique) && <span className={rowBadgeClass}>{c.primaryKey ? 'PK' : 'UQ'}</span>}
        <Accordion.ItemIndicator className={rows.itemIndicator}>
          <icons.chevronRight />
        </Accordion.ItemIndicator>
      </Accordion.ItemTrigger>
      <Accordion.ItemContent className={rows.itemContent}>
        {columnEditor(c)}
      </Accordion.ItemContent>
    </Accordion.Item>
  );

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
        {foldColumns ? (
          <Accordion.Root
            className={rows.root}
            multiple
            collapsible
            lazyMount
            unmountOnExit
            value={openColumns}
            onValueChange={({ value }) => setOpenColumns(value)}
          >
            {headColumns.map(columnRow)}
            {hiddenColumns > 0 && (
              <Button data-testid="show-more-columns" onClick={() => setShowAllColumns(true)}>
                {`Show ${hiddenColumns} more column${hiddenColumns === 1 ? '' : 's'}`}
              </Button>
            )}
            {tailColumns.map(columnRow)}
          </Accordion.Root>
        ) : (
          table.columns.map((c) => <Fragment key={c.id}>{columnEditor(c)}</Fragment>)
        )}
        {showAllColumns && table.columns.length > LISTED_COLUMNS && (
          <Button
            data-testid="show-more-columns"
            onClick={() => setShowAllColumns(false)}
          >
            Show fewer columns
          </Button>
        )}
        {draft ? (
          <div
            data-testid="new-column"
            // Enter blurs a field without moving focus, which finishes the column too.
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setDraftColumn(null);
            }}
          >
            <h3 className={newColumnLabel}>New column</h3>
            {columnEditor(draft)}
          </div>
        ) : (
          <Button
            data-testid="add-column"
            onClick={() => {
              const column = createColumn('', dialect.defaultType);
              edit({ kind: 'addColumn', column });
              setNewColumn(column.id);
              // Design choice: in a folded list the new column is edited in the Add button's place, then filed with
              // the rest (behind "Show more" if past the first few), so new columns never pile up below the gap.
              if (table.columns.length + 1 > FOLD_COLUMNS_AFTER) setDraftColumn(column.id);
            }}
          >
            Add column
          </Button>
        )}
      </Section>

      <Section title="Indexes" testId="section-indexes" {...fold('indexes')}>
        {table.indexes.length > 0 && (
          <Accordion.Root
            className={rows.root}
            collapsible
            lazyMount
            unmountOnExit
            value={openIndex ? [openIndex] : []}
            onValueChange={({ value }) => setOpenIndex(value[0] ?? null)}
          >
            {table.indexes.map((i) => (
              <Accordion.Item
                key={i.id}
                value={i.id}
                className={rows.item}
                data-index-id={i.id}
                // Enter blurs a field without moving focus anywhere, and the index stays open for its next field.
                onBlur={(e) => {
                  if (openIndex === i.id && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpenIndex(null);
                }}
              >
                <Accordion.ItemTrigger className={rows.itemTrigger} data-testid="index-row">
                  <span className={rowNameClass}>{i.name}</span>
                  <span className={rowTypeClass}>{i.columnIds.length > 0 ? i.columnIds.map(columnName).join(', ') : 'no columns'}</span>
                  {i.unique && <span className={rowBadgeClass}>UQ</span>}
                  <Accordion.ItemIndicator className={rows.itemIndicator}>
                    <icons.chevronRight />
                  </Accordion.ItemIndicator>
                </Accordion.ItemTrigger>
                <Accordion.ItemContent className={rows.itemContent}>
                  <IndexEditor table={table} index={i} edit={edit} />
                </Accordion.ItemContent>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        )}
        <Button
          data-testid="add-index"
          onClick={() => {
            const name = uniqueIdentifier(`${sqlIdentifier(table.name)}_idx`, new Set(table.indexes.map((i) => nameKey(i.name))));
            const index = { id: createId(), name, columnIds: [], unique: false };
            edit({ kind: 'addIndex', index });
            setOpenIndex(index.id);
          }}
        >
          Add index
        </Button>
      </Section>
    </>
  );
}
