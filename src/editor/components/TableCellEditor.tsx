import { useEffect, useRef, useState } from 'react';
import { usePreferences } from '../../settings/preferences/PreferencesContext';
import { useEditor } from '../EditorContext';
import { worldToScreen } from '../geometry';
import { nameTaken } from '../model/names';
import {
  COLUMN_TYPES_LIST_ID,
  columnNameTaken,
  createColumn,
  SQL_DIALECTS,
  TABLE_HEADER_HEIGHT,
  TABLE_ROW_HEIGHT,
  TABLE_STYLE,
  tableRowTop,
  type TableCell,
} from '../model/table';
import type { Box, TableNode, Viewport } from '../model/types';
import { CANVAS_FONT_FAMILY, CANVAS_MONO_FAMILY } from '../textMetrics';
import { css } from 'styled-system/css';

// Position, size and font follow the cell and the zoom, so they stay inline.
const inputClass = css({
  position: 'absolute',
  margin: '0',
  paddingInline: '1',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'selection',
  borderRadius: 'small',
  outline: 'none',
  bg: 'bg',
  color: 'text',
  boxSizing: 'border-box',
  '&[aria-invalid=true]': { borderColor: 'text.danger' },
});
const errorClass = css({
  position: 'absolute',
  margin: '0',
  paddingBlock: '1',
  paddingInline: '2',
  borderRadius: 'small',
  bg: 'bg',
  boxShadow: 'elevation100',
  color: 'text.danger',
  textStyle: 'body.medium',
  whiteSpace: 'nowrap',
});

/** The cell's box in world px, matching where the canvas draws its text. */
function cellBox(table: TableNode, cell: TableCell): Box | null {
  const { pad, badgeWidth } = TABLE_STYLE;
  if (cell.field === 'table-name') return { x: table.x + pad, y: table.y, width: table.width - 2 * pad, height: TABLE_HEADER_HEIGHT };
  const index = table.columns.findIndex((c) => c.id === cell.columnId);
  if (index < 0) return null;
  const y = tableRowTop(table, index);
  const half = table.width / 2;
  return cell.field === 'column-name'
    ? { x: table.x + pad + badgeWidth, y, width: half - pad - badgeWidth, height: TABLE_ROW_HEIGHT }
    : { x: table.x + half, y, width: half - pad, height: TABLE_ROW_HEIGHT };
}

interface Props {
  table: TableNode;
  cell: TableCell;
  viewport: Viewport;
  /** Moves editing to another cell, or ends it with null; `notice` says why a value wasn't saved. */
  onMove: (cell: TableCell | null, notice?: string) => void;
}

/**
 * An input laid over one table cell. Tab and Shift+Tab move through the
 * header and each row's name and type; Enter on the last row adds a column;
 * Escape leaves without saving; leaving otherwise saves. A refused name keeps
 * the editor open on Enter or Tab; on blur it closes with a notice, because
 * taking focus back would trap the user. Each saved cell is one undo step.
 */
export function TableCellEditor({ table, cell, viewport, onMove }: Props) {
  const { state, dispatch } = useEditor();
  const dialect = SQL_DIALECTS[usePreferences().preferences.sqlDialect];
  const column = cell.field === 'table-name' ? undefined : table.columns.find((c) => c.id === cell.columnId);
  const index = column ? table.columns.indexOf(column) : -1;
  const initial = cell.field === 'table-name' ? table.name : cell.field === 'column-name' ? (column?.name ?? '') : (column?.dataType ?? '');
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  // A key that moves on also unmounts the input, which may blur it; only the first exit counts.
  const doneRef = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  /** Saves the cell, or returns why the value was refused. */
  const save = (): string | null => {
    const v = value.trim();
    if (cell.field === 'table-name') {
      if (!v || v === table.name) return null;
      if (nameTaken(state.nodes, v, table.id)) return `Another layer is already named “${v}”.`;
      dispatch({ type: 'renameNode', id: table.id, name: v });
      return null;
    }
    if (!column) return null;
    if (cell.field === 'column-name') {
      if (!v || v === column.name) return null;
      if (columnNameTaken(table, v, column.id)) return `This table already has a column named “${v}”.`;
    }
    // An emptied type keeps the old one, as an emptied name does.
    if (cell.field === 'column-type' && !v) return null;
    const patch = cell.field === 'column-name' ? { name: v } : { dataType: v };
    dispatch({ type: 'editTable', id: table.id, edit: { kind: 'updateColumn', columnId: column.id, patch } });
    return null;
  };

  /** Saves for Enter and Tab: a refused value shows its message and keeps editing here. */
  const commit = (): boolean => {
    const refusal = save();
    setError(refusal);
    return refusal === null;
  };

  const leave = (next: TableCell | null, notice?: string) => {
    doneRef.current = true;
    onMove(next, notice);
  };

  const neighbour = (step: 1 | -1): TableCell | null => {
    const at = (i: number, field: 'column-name' | 'column-type'): TableCell | null => {
      const c = table.columns[i];
      return c ? { tableId: table.id, field, columnId: c.id } : null;
    };
    if (cell.field === 'table-name') return step === 1 ? at(0, 'column-name') : null;
    if (cell.field === 'column-name') {
      if (step === 1) return at(index, 'column-type');
      return index === 0 ? { tableId: table.id, field: 'table-name' } : at(index - 1, 'column-type');
    }
    return step === 1 ? at(index + 1, 'column-name') : at(index, 'column-name');
  };

  const box = cellBox(table, cell);
  if (!box) return null;
  const p = worldToScreen(box, viewport);
  const size =
    cell.field === 'table-name' ? TABLE_STYLE.nameSize : cell.field === 'column-name' ? TABLE_STYLE.columnSize : TABLE_STYLE.typeSize;

  return (
    <>
      <input
        ref={ref}
        data-testid="table-cell-editor"
        data-field={cell.field}
        aria-label={cell.field === 'table-name' ? 'Table name' : `${cell.field === 'column-name' ? 'Name' : 'Type'} of column ${column?.name ?? ''}`}
        aria-invalid={error !== null}
        aria-describedby={error ? 'table-cell-error' : undefined}
        list={cell.field === 'column-type' ? COLUMN_TYPES_LIST_ID : undefined}
        className={inputClass}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onBlur={() => {
          if (doneRef.current) return;
          leave(null, save() ?? undefined);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          // Enter and Tab also confirm an IME composition; leave those to the input method.
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Escape') leave(null);
          if (e.key === 'Tab') {
            e.preventDefault();
            if (commit()) leave(neighbour(e.shiftKey ? -1 : 1));
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (!commit()) return;
            if (!column || index !== table.columns.length - 1) return leave(null);
            // No name: the reducer picks the next free one after the save above has applied.
            const added = createColumn('', dialect.defaultType);
            dispatch({ type: 'editTable', id: table.id, edit: { kind: 'addColumn', column: added } });
            leave({ tableId: table.id, field: 'column-name', columnId: added.id });
          }
        }}
        style={{
          left: p.x,
          top: p.y,
          width: box.width * viewport.zoom,
          height: box.height * viewport.zoom,
          fontSize: size * viewport.zoom,
          fontWeight: cell.field === 'table-name' ? 600 : 400,
          fontFamily: cell.field === 'column-type' ? CANVAS_MONO_FAMILY : CANVAS_FONT_FAMILY,
          textAlign: cell.field === 'column-type' ? 'right' : 'left',
        }}
      />
      {error && (
        <p id="table-cell-error" data-testid="table-cell-error" role="alert" className={errorClass} style={{ left: p.x, top: p.y + box.height * viewport.zoom + 4 }}>
          {error}
        </p>
      )}
    </>
  );
}
