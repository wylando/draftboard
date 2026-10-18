import { useState, type ReactElement } from 'react';
import { IconButton, icons, Panel, Section } from '../../design-system';
import { useEditor } from '../EditorContext';
import type { DesignNode, NodeType } from '../model/types';
import { emptyHint, sidebarLeft } from '../styles';
import { css, cx } from 'styled-system/css';

const listClass = css({ listStyle: 'none', margin: '0', marginInline: '-4', padding: '0' });
const rowClass = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  height: 'layerRow',
  paddingInlineStart: '4',
  paddingInlineEnd: '2',
  cursor: 'default',
  _hover: { bg: 'bg.hover' },
});
const rowSelectedClass = css({ bg: 'bg.selected', _hover: { bg: 'bg.selected' } });
const iconClass = css({ display: 'inline-flex', color: 'icon.secondary' });
const nameClass = css({ flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
const hiddenNameClass = css({ color: 'text.secondary' });
const renameClass = css({
  flex: '1',
  minWidth: '0',
  paddingBlock: '[2px]',
  paddingInline: '1',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.selected',
  borderRadius: 'small',
  outline: 'none',
});
// Revealed on row hover (via the `group` class) and always shown for hidden layers.
const visibilityClass = css({ opacity: '0', _groupHover: { opacity: '1' } });
const visibilityShownClass = css({ opacity: '1' });

const TYPE_ICONS: Record<NodeType, () => ReactElement> = {
  frame: icons.frame,
  rect: icons.rect,
  ellipse: icons.ellipse,
  line: icons.line,
  text: icons.text,
};

function LayerRow({ node, selected }: { node: DesignNode; selected: boolean }) {
  const { state, dispatch } = useEditor();
  const [renaming, setRenaming] = useState(false);
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
    if (!trimmed || trimmed === node.name) return;
    dispatch({ type: 'checkpoint' });
    dispatch({ type: 'updateNodes', patches: { [node.id]: { name: trimmed } } });
  };

  return (
    <li
      className={cx('group', rowClass, selected && rowSelectedClass)}
      data-testid={`layer-${node.id}`}
      aria-selected={selected}
      onClick={(e) => select(e.shiftKey)}
      onDoubleClick={() => setRenaming(true)}
    >
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
        <span className={cx(nameClass, !node.visible && hiddenNameClass)}>{node.name}</span>
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
  );
}

export function LayersPanel() {
  const { state } = useEditor();
  const selected = new Set(state.selection);
  // Top of the list = top of the z-order, as in most design tools.
  const ordered = [...state.nodes].reverse();

  return (
    <Panel className={sidebarLeft} data-testid="layers-panel">
      <Section title="Layers">
        {ordered.length === 0 ? (
          <p className={emptyHint}>Pick a tool and drag on the canvas to add a layer.</p>
        ) : (
          <ul className={listClass}>
            {ordered.map((n) => (
              <LayerRow key={n.id} node={n} selected={selected.has(n.id)} />
            ))}
          </ul>
        )}
      </Section>
    </Panel>
  );
}
