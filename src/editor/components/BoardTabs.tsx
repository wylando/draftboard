import { useEffect, useRef, type MouseEvent } from 'react';
import { Tabs } from '@ark-ui/react/tabs';
import { css } from 'styled-system/css';
import { boardTabs } from 'styled-system/recipes';
import { IconButton, icons, useDialogs } from '../../design-system';
import { useBoards } from '../EditorContext';

const classes = boardTabs();
// The tabs sit on the bar's bottom edge; this lifts the button to their text line.
const addClass = css({ flex: 'none', marginBlockEnd: '1' });

// A mouse click leaves focus on the button; give it back so the arrow keys nudge the selection again.
// Keyboard activation (detail 0) keeps focus, and with it the arrow-key roving between tabs.
const releaseFocusAfterMouse = (e: MouseEvent<HTMLElement>) => {
  if (e.detail > 0) e.currentTarget.blur();
};

export function BoardTabs() {
  const { boards, activeId, dispatch } = useBoards();
  const dialogs = useDialogs();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  const close = async (id: string, name: string, isEmpty: boolean) => {
    if (!isEmpty) {
      const ok = await dialogs.confirm({
        title: `Close "${name}"?`,
        description: "Its design is deleted. This can't be undone.",
        confirmLabel: 'Close board',
      });
      if (!ok) return;
    }
    dispatch({ type: 'closeBoard', id });
  };

  return (
    // Manual activation: arrow keys only move focus between tabs, Enter or Space opens one.
    <Tabs.Root
      className={classes.root}
      value={activeId}
      activationMode="manual"
      onValueChange={({ value }) => dispatch({ type: 'switchBoard', id: value })}
    >
      <Tabs.List
        ref={listRef}
        className={classes.list}
        aria-label="Boards"
        data-testid="board-tabs"
        // A mouse wheel only scrolls vertically; over the strip it scrolls the tabs instead.
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        {boards.map((b) => (
          <div key={b.id} role="presentation" className={classes.tab} data-selected={b.id === activeId || undefined}>
            <Tabs.Trigger
              value={b.id}
              className={classes.trigger}
              title={b.name}
              data-testid={`board-tab-${b.id}`}
              data-board-name={b.name}
              onClick={releaseFocusAfterMouse}
              // There are no tab panels, so zag's reference to one would dangle. It ignores undefined, not null.
              aria-controls={null as unknown as undefined}
            >
              {b.name}
            </Tabs.Trigger>
            {boards.length > 1 && (
              <button
                type="button"
                className={classes.close}
                aria-label={`Close ${b.name}`}
                data-board-close
                data-testid={`board-close-${b.id}`}
                // Closing by keyboard will come with a shortcut; this keeps the tab order to one stop.
                tabIndex={-1}
                onClick={(e) => {
                  releaseFocusAfterMouse(e);
                  void close(b.id, b.name, b.isEmpty);
                }}
              >
                <icons.close />
              </button>
            )}
          </div>
        ))}
      </Tabs.List>
      <IconButton tone="dark" className={addClass} label="New board" data-testid="board-new" icon={<icons.plus />} onClick={() => dispatch({ type: 'newBoard' })} />
    </Tabs.Root>
  );
}
