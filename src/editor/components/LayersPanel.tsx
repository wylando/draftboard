import { useState, type DragEvent, type ReactElement } from 'react';
import { IconButton, icons, Panel, Section } from '../../design-system';
import { useEditor } from '../EditorContext';
import { nameTaken } from '../model/names';
import { ancestorIds, byIdOf, childrenByParent, isContainer, topLevelIds } from '../model/tree';
import type { DesignNode, NodeType } from '../model/types';
import { emptyHint, fieldError, sidebarLeft } from '../styles';
import { css, cx } from 'styled-system/css';

type DropPosition = 'above' | 'below' | 'inside';

const listClass = css({ listStyle: 'none', margin: '0', marginInline: '-4', padding: '0' });
const rowClass = css({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  height: 'treeRow',
  paddingInlineStart: '2',
  paddingInlineEnd: '1',
  cursor: 'default',
  _hover: { bg: 'bg.hover' },
});
const rowSelectedClass = css({ bg: 'bg.selected', _hover: { bg: 'bg.selected' } });
const rowInSelectionClass = css({ bg: 'bg.selectedChild' });
const rowDraggingClass = css({ opacity: '0.5' });
// One indent step per level, with a vertical guide centered under the parent's chevron.
const guideClass = css({
  flex: 'none',
  alignSelf: 'stretch',
  width: 'treeIndent',
  position: 'relative',
  _before: {
    content: '""',
    position: 'absolute',
    insetBlock: '0',
    left: '[50%]',
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'border.guide',
  },
});
const twistieClass = css({
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'treeIndent',
  height: 'treeIndent',
  padding: '0',
  border: 'none',
  bg: 'transparent',
  color: 'icon.secondary',
  cursor: 'pointer',
  '&[aria-expanded=true] svg': { transform: 'rotate(90deg)' },
});
const twistieSpacerClass = css({ flex: 'none', width: 'treeIndent' });
const iconClass = css({ display: 'inline-flex', flex: 'none', color: 'icon.secondary', marginInlineEnd: '1' });
const nameClass = css({ flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
const containerNameClass = css({ fontWeight: 'strong' });
const hiddenNameClass = css({ color: 'text.secondary' });
const renameErrorClass = css({ paddingInline: '2', paddingBottom: '1' });
const renameClass = css({
  flex: '1',
  minWidth: '0',
  paddingBlock: '0',
  paddingInline: '1',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.selected',
  borderRadius: 'small',
  outline: 'none',
});
// Revealed on row hover (via the `group` class) and always shown for hidden layers.
const visibilityClass = css({ width: 'treeRow', height: 'treeRow', opacity: '0', _groupHover: { opacity: '1' } });
const visibilityShownClass = css({ width: 'treeRow', height: 'treeRow', opacity: '1' });
// Drop indicators: a line between rows, or an outline around a container.
const dropAboveClass = css({
  _after: { content: '""', position: 'absolute', insetInline: '0', top: '0', borderTopWidth: '2px', borderTopStyle: 'solid', borderTopColor: 'selection', pointerEvents: 'none' },
});
const dropBelowClass = css({
  _after: { content: '""', position: 'absolute', insetInline: '0', bottom: '0', borderBottomWidth: '2px', borderBottomStyle: 'solid', borderBottomColor: 'selection', pointerEvents: 'none' },
});
const dropInsideClass = css({
  _after: { content: '""', position: 'absolute', inset: '0', borderWidth: '2px', borderStyle: 'solid', borderColor: 'selection', pointerEvents: 'none' },
});
const DROP_CLASSES: Record<DropPosition, string> = {
  above: dropAboveClass,
  below: dropBelowClass,
  inside: dropInsideClass,
};

const TYPE_ICONS: Record<NodeType, () => ReactElement> = {
  frame: icons.frame,
  group: icons.group,
  rect: icons.rect,
  ellipse: icons.ellipse,
  line: icons.line,
  text: icons.text,
  table: icons.table,
  connector: icons.connector,
};

interface Row {
  node: DesignNode;
  depth: number;
  hasChildren: boolean;
  /** Inside a selected frame or group (but not selected itself). */
  inSelection: boolean;
}

/** Visible rows, top of the z-order first, skipping collapsed subtrees. */
function buildRows(nodes: DesignNode[], collapsed: ReadonlySet<string>, selected: ReadonlySet<string>): Row[] {
  const children = childrenByParent(nodes);
  const rows: Row[] = [];
  const visit = (parentId: string | null, depth: number, inSelection: boolean) => {
    const list = children.get(parentId) ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const node = list[i] as DesignNode;
      const hasChildren = (children.get(node.id)?.length ?? 0) > 0;
      rows.push({ node, depth, hasChildren, inSelection: inSelection && !selected.has(node.id) });
      if (hasChildren && !collapsed.has(node.id)) visit(node.id, depth + 1, inSelection || selected.has(node.id));
    }
  };
  visit(null, 0, false);
  return rows;
}

/** Leaves split into above/below; containers also accept a drop in their middle half. */
function dropPositionFor(e: DragEvent<HTMLElement>, node: DesignNode): DropPosition {
  const rect = e.currentTarget.getBoundingClientRect();
  const t = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5;
  if (isContainer(node)) return t < 0.25 ? 'above' : t > 0.75 ? 'below' : 'inside';
  return t < 0.5 ? 'above' : 'below';
}

interface LayerRowProps {
  row: Row;
  selected: boolean;
  dragging: boolean;
  expanded: boolean;
  onToggle: () => void;
  drop: DropPosition | null;
  dragHandlers: {
    onDragStart: (e: DragEvent<HTMLLIElement>) => void;
    onDragOver: (e: DragEvent<HTMLLIElement>) => void;
    onDragLeave: () => void;
    onDrop: (e: DragEvent<HTMLLIElement>) => void;
    onDragEnd: () => void;
  };
}

function LayerRow({ row, selected, dragging, expanded, onToggle, drop, dragHandlers }: LayerRowProps) {
  const { node, depth, hasChildren } = row;
  const { state, dispatch } = useEditor();
  const [renaming, setRenaming] = useState(false);
  // Shown under this row, so it stays in view however long the tree is.
  const [renameError, setRenameError] = useState<string | null>(null);
  if (renameError !== null && !selected) setRenameError(null);
  const Icon = TYPE_ICONS[node.type];

  const select = (additive: boolean) => {
    const ids = additive
      ? selected
        ? state.selection.filter((id) => id !== node.id)
        : [...state.selection, node.id]
      : [node.id];
    dispatch({ type: 'select', ids });
  };

  const rename = (name: string) => {
    setRenaming(false);
    const trimmed = name.trim();
    if (nameTaken(state.nodes, trimmed, node.id)) {
      setRenameError(trimmed);
      return;
    }
    setRenameError(null);
    dispatch({ type: 'renameNode', id: node.id, name: trimmed });
  };

  return (
    <>
      <li
        className={cx(
          'group',
          rowClass,
          selected && rowSelectedClass,
          row.inSelection && rowInSelectionClass,
          dragging && rowDraggingClass,
          drop && DROP_CLASSES[drop],
        )}
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={selected}
        data-testid={`layer-${node.id}`}
        data-depth={depth}
        data-drop={drop ?? undefined}
        data-dragging={dragging || undefined}
        data-in-selection={row.inSelection || undefined}
        draggable={!renaming}
        onClick={(e) => select(e.shiftKey)}
        onDoubleClick={() => setRenaming(true)}
        {...dragHandlers}
      >
        {Array.from({ length: depth }, (_, i) => (
          <span key={i} className={guideClass} aria-hidden="true" data-testid="layer-guide" />
        ))}
        {hasChildren ? (
          <button
            type="button"
            className={twistieClass}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            data-testid={`toggle-${node.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <icons.chevronRight />
          </button>
        ) : (
          <span className={twistieSpacerClass} />
        )}
        <span className={iconClass}>
          <Icon />
        </span>
        {renaming ? (
          <input
            className={renameClass}
            defaultValue={node.name}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => rename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <span className={cx(nameClass, isContainer(node) && containerNameClass, !node.visible && hiddenNameClass)}>
            {node.name}
          </span>
        )}
        <IconButton
          className={node.visible ? visibilityClass : visibilityShownClass}
          label={node.visible ? 'Hide layer' : 'Show layer'}
          icon={node.visible ? <icons.eye /> : <icons.eyeOff />}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'checkpoint' });
            dispatch({ type: 'updateNodes', patches: { [node.id]: { visible: !node.visible } } });
          }}
        />
      </li>
      {renameError !== null && (
        <li role="none" className={renameErrorClass}>
          <p className={fieldError} role="alert">
            Another layer is already named “{renameError}”.
          </p>
        </li>
      )}
    </>
  );
}

export function LayersPanel() {
  const { state, dispatch } = useEditor();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);

  // Reveal layers selected on the canvas: expand their ancestors. Adjusting state
  // while rendering (rather than in an effect) avoids a flash of collapsed rows.
  const [revealedFor, setRevealedFor] = useState(state.selection);
  if (revealedFor !== state.selection) {
    setRevealedFor(state.selection);
    const byId = byIdOf(state.nodes);
    const ancestors = new Set(state.selection.flatMap((id) => ancestorIds(byId, id)));
    if ([...ancestors].some((id) => collapsed.has(id))) {
      setCollapsed(new Set([...collapsed].filter((id) => !ancestors.has(id))));
    }
  }

  const selected = new Set(state.selection);
  const rows = buildRows(state.nodes, collapsed, selected);

  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  };

  // A drag never targets the dragged layers or anything inside them.
  const invalidTargets = (() => {
    if (!dragIds) return new Set<string>();
    const byId = byIdOf(state.nodes);
    const dragged = new Set(dragIds);
    return new Set(
      state.nodes.filter((n) => dragged.has(n.id) || ancestorIds(byId, n.id).some((a) => dragged.has(a))).map((n) => n.id),
    );
  })();

  const handlersFor = (node: DesignNode): LayerRowProps['dragHandlers'] => ({
    onDragStart: (e) => {
      // Dragging a selected row drags the whole selection.
      const ids = selected.has(node.id) ? topLevelIds(byIdOf(state.nodes), state.selection) : [node.id];
      setDragIds(ids);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.name);
    },
    onDragOver: (e) => {
      if (!dragIds || invalidTargets.has(node.id)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const position = dropPositionFor(e, node);
      if (dropTarget?.id !== node.id || dropTarget.position !== position) setDropTarget({ id: node.id, position });
    },
    onDragLeave: () => setDropTarget((t) => (t?.id === node.id ? null : t)),
    onDrop: (e) => {
      e.preventDefault();
      if (dragIds && !invalidTargets.has(node.id)) {
        dispatch({ type: 'moveLayers', ids: dragIds, targetId: node.id, position: dropPositionFor(e, node) });
      }
      setDragIds(null);
      setDropTarget(null);
    },
    onDragEnd: () => {
      setDragIds(null);
      setDropTarget(null);
    },
  });

  return (
    <Panel className={sidebarLeft} data-testid="layers-panel">
      <Section title="Layers">
        {rows.length === 0 ? (
          <p className={emptyHint}>Pick a tool and drag on the canvas to add a layer.</p>
        ) : (
          <ul className={listClass} role="tree" aria-label="Layers" aria-multiselectable="true">
            {rows.map((row) => (
              <LayerRow
                key={row.node.id}
                row={row}
                selected={selected.has(row.node.id)}
                dragging={dragIds?.includes(row.node.id) ?? false}
                expanded={!collapsed.has(row.node.id)}
                onToggle={() => toggle(row.node.id)}
                drop={dropTarget?.id === row.node.id ? dropTarget.position : null}
                dragHandlers={handlersFor(row.node)}
              />
            ))}
          </ul>
        )}
      </Section>
    </Panel>
  );
}
