import { ToggleGroup } from '@ark-ui/react/toggle-group';
import type { ReactElement } from 'react';
import { IconButton, icons } from '../../design-system';
import { useEditor } from '../EditorContext';
import type { ToolId } from '../model/types';
import type { CommandId } from '../../settings/keybindings/commands';
import { useCommandTitle } from '../../settings/keybindings/useCommandTitle';
import { css } from 'styled-system/css';
import { iconButton } from 'styled-system/recipes';

// A sibling of the canvas element, not a child: the canvas blurs editors and starts gestures on pointer-down.
// Centered on the editor body, so resizing, hiding or showing a side panel doesn't move it: the
// spacer on the narrower panel's side starts at how much wider the other is (EditorBody sets them),
// and they share the rest equally. Where that doesn't fit, they shrink in proportion, so the dock stays whole on the
// canvas. The row lets presses through.
const dockRowClass = css({
  position: 'absolute',
  insetInline: '0',
  bottom: '4',
  display: 'flex',
  pointerEvents: 'none',
  _before: { content: '""', flex: '[1 1 var(--dock-inset-start, 0px)]', minWidth: '0' },
  _after: { content: '""', flex: '[1 1 var(--dock-inset-end, 0px)]', minWidth: '0' },
});
const dockClass = css({
  flex: 'none',
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: '1',
  padding: '1',
  borderRadius: 'large',
  bg: 'bg.toolbar',
  color: 'text.onToolbar',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.strong',
  boxShadow: 'elevation200',
});
const groupClass = css({ display: 'flex', alignItems: 'center', gap: '1' });
const dividerClass = css({ alignSelf: 'stretch', width: '[1px]', marginBlock: '1', bg: 'bg.toolbarHover' });
const toolItemClass = iconButton({ tone: 'dark' });

const TOOLS: Array<{ id: ToolId; command: CommandId; icon: () => ReactElement }> = [
  { id: 'select', command: 'tool.select', icon: icons.select },
  { id: 'frame', command: 'tool.frame', icon: icons.frame },
  { id: 'rect', command: 'tool.rect', icon: icons.rect },
  { id: 'ellipse', command: 'tool.ellipse', icon: icons.ellipse },
  { id: 'line', command: 'tool.line', icon: icons.line },
  { id: 'text', command: 'tool.text', icon: icons.text },
  { id: 'table', command: 'tool.table', icon: icons.table },
  { id: 'connector', command: 'tool.connector', icon: icons.connector },
  { id: 'hand', command: 'tool.hand', icon: icons.hand },
];

export function ToolDock() {
  const { state, dispatch } = useEditor();
  const title = useCommandTitle();

  return (
    <div className={dockRowClass}>
      <div className={dockClass} role="group" aria-label="Tools" data-testid="tool-dock">
        {/* Exactly one tool is always active, so the group can't be emptied. */}
        <ToggleGroup.Root
          className={groupClass}
          aria-label="Drawing tools"
          value={[state.tool]}
          deselectable={false}
          onValueChange={({ value }) => {
            const tool = value[0] as ToolId | undefined;
            if (tool) dispatch({ type: 'setTool', tool });
          }}
        >
          {TOOLS.map((t) => (
            <ToggleGroup.Item
              key={t.id}
              value={t.id}
              className={toolItemClass}
              aria-label={title(t.command)}
              title={title(t.command)}
              data-testid={`tool-${t.id}`}
            >
              <t.icon />
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        <span className={dividerClass} aria-hidden="true" />
        <div className={groupClass}>
          <IconButton
            tone="dark"
            label={title('edit.undo')}
            data-testid="undo"
            icon={<icons.undo />}
            disabled={state.past.length === 0}
            onClick={() => dispatch({ type: 'undo' })}
          />
          <IconButton
            tone="dark"
            label={title('edit.redo')}
            data-testid="redo"
            icon={<icons.redo />}
            disabled={state.future.length === 0}
            onClick={() => dispatch({ type: 'redo' })}
          />
        </div>
      </div>
    </div>
  );
}
