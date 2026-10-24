import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { Menu } from '@ark-ui/react/menu';
import { Portal } from '@ark-ui/react/portal';
import { Tabs } from '@ark-ui/react/tabs';
import { css } from 'styled-system/css';
import { boardTabs, menu } from 'styled-system/recipes';
import { IconButton, icons } from '../../design-system';
import { useCommandTitle } from '../../settings/keybindings/useCommandTitle';
import { useBoards } from '../EditorContext';
import { useCloseBoard } from '../hooks/useCloseBoard';

const classes = boardTabs();
const menuClasses = menu();
// The tabs sit on the bar's bottom edge; this lifts the button to their text line.
const addClass = css({ flex: 'none', marginBlockEnd: '1' });

// Pointer travel before a press on a tab becomes a drag; below it the press is still a click.
const DRAG_THRESHOLD = 4;
// A tab held within this many px of the strip's visible edge (or past it) scrolls the strip that way,
// up to EDGE_SCROLL_SPEED px per frame at the edge itself, so tabs scrolled out of view can be reached.
const EDGE_SCROLL_ZONE = 32;
const EDGE_SCROLL_SPEED = 12;

// A mouse click leaves focus on the button; give it back so the arrow keys nudge the selection again.
// Keyboard activation (detail 0) keeps focus, and with it the arrow-key roving between tabs.
const releaseFocusAfterMouse = (e: MouseEvent<HTMLElement>) => {
  if (e.detail > 0) e.currentTarget.blur();
};

interface Drag {
  id: string;
  pointerId: number;
  startX: number;
  startScroll: number;
  /** The latest pointer x, so edge scrolling can move the tab while the pointer is still. */
  x: number;
  from: number;
  /** Where the tab would land now; kept here, not read from the rendered state, which can lag a quick release. */
  to: number;
  /** Tab boxes in the strip's content coordinates, which scrolling doesn't change; tabs don't reflow while dragging. */
  slots: Array<{ left: number; width: number }>;
  /** Where the last tab ends: the held tab stays between 0 and here. */
  end: number;
  moved: boolean;
  frame: number | null;
}

interface DragView {
  id: string;
  dx: number;
  from: number;
  to: number;
  /** The dragged tab's width: how far the tabs it passes slide. */
  width: number;
}

function RenameInput({ name, onCommit, onDone }: { name: string; onCommit: (name: string) => void; onDone: (refocus: boolean) => void }) {
  // Enter unmounts the focused input, which can blur it again; only the first finish counts.
  const finished = useRef(false);
  // Enter and Escape hand focus back to the tab; a blur means focus already went elsewhere.
  const finish = (commit: string | null, refocus: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (commit !== null) onCommit(commit);
    onDone(refocus);
  };
  return (
    <input
      className={classes.input}
      data-testid="board-rename-input"
      aria-label="Board name"
      defaultValue={name}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => finish(e.currentTarget.value, false)}
      // Right-click here is for the browser's text menu, not the board menu around it.
      onContextMenu={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Home, End and the arrows would otherwise reach the tab list's roving handler.
        e.stopPropagation();
        if (e.key === 'Enter') finish(e.currentTarget.value, true);
        else if (e.key === 'Escape') finish(null, true);
      }}
    />
  );
}

export function BoardTabs() {
  const { boards, activeId, dispatch } = useBoards();
  const closeBoard = useCloseBoard();
  const title = useCommandTitle();
  const listRef = useRef<HTMLDivElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dragView, setDragView] = useState<DragView | null>(null);
  // A drag ends in a click on the same button; that click must not open the tab.
  const swallowClick = useRef(false);
  // The menu hands focus back as it closes, which would blur a rename field opened at the same moment.
  const refocusAfterRename = useRef<string | null>(null);
  const renameWhenMenuCloses = useRef<string | null>(null);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  useEffect(() => {
    if (renamingId !== null || refocusAfterRename.current === null) return;
    listRef.current?.querySelector<HTMLElement>(`[data-testid="board-tab-${refocusAfterRename.current}"]`)?.focus();
    refocusAfterRename.current = null;
  }, [renamingId]);

  const startDrag = (e: PointerEvent<HTMLElement>, id: string) => {
    swallowClick.current = false;
    if (e.button !== 0 || !listRef.current) return;
    const list = listRef.current;
    const origin = list.getBoundingClientRect().left - list.scrollLeft;
    const slots = [...list.querySelectorAll<HTMLElement>('[data-board-tab]')].map((t) => {
      const r = t.getBoundingClientRect();
      return { left: r.left - origin, width: r.width };
    });
    drag.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: list.scrollLeft,
      x: e.clientX,
      from: boards.findIndex((b) => b.id === id),
      to: boards.findIndex((b) => b.id === id),
      slots,
      end: Math.max(...slots.map((s) => s.left + s.width)),
      moved: false,
      frame: null,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointer events (the Cypress specs) have no live pointer to capture.
    }
  };

  const placeHeldTab = (d: Drag) => {
    const list = listRef.current;
    if (!list) return;
    const travel = d.x - d.startX + list.scrollLeft - d.startScroll;
    if (!d.moved && Math.abs(travel) < DRAG_THRESHOLD) return;
    d.moved = true;
    const mine = d.slots[d.from] as Drag['slots'][number];
    const dx = Math.min(Math.max(travel, -mine.left), d.end - mine.left - mine.width);
    const center = mine.left + mine.width / 2 + dx;
    // Pinned at either end, the held tab's centre ties with an equal-width end tab; it should pass that tab.
    const passed = (c: number) => (dx > 0 ? c <= center : c < center);
    d.to = d.slots.filter((s, i) => i !== d.from && passed(s.left + s.width / 2)).length;
    setDragView({ id: d.id, dx, from: d.from, to: d.to, width: mine.width });
  };

  const scrollAtEdge = () => {
    const d = drag.current;
    const list = listRef.current;
    if (!d || !list) return;
    d.frame = null;
    if (!d.moved) return;
    const strip = list.getBoundingClientRect();
    const depth = (into: number) => Math.min(Math.max(into / EDGE_SCROLL_ZONE, 0), 1);
    const step = (depth(d.x - (strip.right - EDGE_SCROLL_ZONE)) - depth(strip.left + EDGE_SCROLL_ZONE - d.x)) * EDGE_SCROLL_SPEED;
    const before = list.scrollLeft;
    list.scrollLeft += step;
    if (list.scrollLeft === before) return;
    placeHeldTab(d);
    d.frame = requestAnimationFrame(scrollAtEdge);
  };

  const moveDrag = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX;
    placeHeldTab(d);
    d.frame ??= requestAnimationFrame(scrollAtEdge);
  };

  const endDrag = (e: PointerEvent<HTMLElement>, drop: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    if (d.frame !== null) cancelAnimationFrame(d.frame);
    if (!d.moved) return;
    e.currentTarget.blur();
    setDragView(null);
    if (!drop) return;
    // The click that ends a mouse drag arrives right after pointerup; if none does, don't keep waiting for one.
    swallowClick.current = true;
    setTimeout(() => (swallowClick.current = false), 0);
    dispatch({ type: 'moveBoard', id: d.id, toIndex: d.to });
  };

  // The dragged tab follows the pointer; the tabs it passes slide one tab-width the other way.
  const shift = (id: string, index: number): CSSProperties | undefined => {
    if (!dragView) return undefined;
    const { from, to, width } = dragView;
    if (id === dragView.id) return { transform: `translateX(${dragView.dx}px)` };
    if (index > from && index <= to) return { transform: `translateX(${-width}px)` };
    if (index < from && index >= to) return { transform: `translateX(${width}px)` };
    return undefined;
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
        // A held tab rides along when the strip scrolls under it.
        onScroll={() => drag.current && placeHeldTab(drag.current)}
      >
        {boards.map((b, index) => (
          <Menu.Root
            key={b.id}
            lazyMount
            unmountOnExit
            onExitComplete={() => {
              if (renameWhenMenuCloses.current !== b.id) return;
              renameWhenMenuCloses.current = null;
              setRenamingId(b.id);
            }}
          >
            <Menu.ContextTrigger asChild>
              <div
                role="presentation"
                className={classes.tab}
                data-board-tab
                data-selected={b.id === activeId || undefined}
                data-dragging={dragView?.id === b.id || undefined}
                style={shift(b.id, index)}
              >
                {renamingId === b.id ? (
                  <RenameInput
                    name={b.name}
                    onCommit={(name) => dispatch({ type: 'renameBoard', id: b.id, name })}
                    onDone={(refocus) => {
                      if (refocus) refocusAfterRename.current = b.id;
                      setRenamingId(null);
                    }}
                  />
                ) : (
                  <Tabs.Trigger
                    value={b.id}
                    className={classes.trigger}
                    title={b.name}
                    data-testid={`board-tab-${b.id}`}
                    data-board-name={b.name}
                    onClickCapture={(e) => {
                      const swallow = swallowClick.current;
                      swallowClick.current = false;
                      // Only a pointer click ends a drag; Enter or Space on the tab has detail 0.
                      if (swallow && e.detail > 0) e.stopPropagation();
                    }}
                    onClick={releaseFocusAfterMouse}
                    onDoubleClick={() => setRenamingId(b.id)}
                    onPointerDown={(e) => startDrag(e, b.id)}
                    onPointerMove={moveDrag}
                    onPointerUp={(e) => endDrag(e, true)}
                    onPointerCancel={(e) => endDrag(e, false)}
                    // There are no tab panels, so zag's reference to one would dangle. It ignores undefined, not null.
                    aria-controls={null as unknown as undefined}
                  >
                    {b.name}
                  </Tabs.Trigger>
                )}
                {boards.length > 1 && (
                  <button
                    type="button"
                    className={classes.close}
                    aria-label={`Close ${b.name}`}
                    data-board-close
                    data-testid={`board-close-${b.id}`}
                    // Closing by keyboard is the Close board shortcut; this keeps the tab order to one stop.
                    tabIndex={-1}
                    onClick={(e) => {
                      releaseFocusAfterMouse(e);
                      void closeBoard(b.id);
                    }}
                  >
                    <icons.close />
                  </button>
                )}
              </div>
            </Menu.ContextTrigger>
            <Portal>
              <Menu.Positioner className={menuClasses.positioner}>
                <Menu.Content className={menuClasses.content}>
                  <Menu.Item value="rename" className={menuClasses.item} data-testid="board-menu-rename" onSelect={() => (renameWhenMenuCloses.current = b.id)}>
                    Rename
                  </Menu.Item>
                  <Menu.Item
                    value="duplicate"
                    className={menuClasses.item}
                    data-testid="board-menu-duplicate"
                    onSelect={() => dispatch({ type: 'duplicateBoard', id: b.id })}
                  >
                    Duplicate
                  </Menu.Item>
                  <Menu.Separator className={menuClasses.separator} />
                  <Menu.Item
                    value="close"
                    className={menuClasses.item}
                    data-testid="board-menu-close"
                    disabled={boards.length === 1}
                    onSelect={() => void closeBoard(b.id)}
                  >
                    Close
                  </Menu.Item>
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
        ))}
      </Tabs.List>
      <IconButton
        tone="dark"
        className={addClass}
        label={title('board.new', 'New board')}
        data-testid="board-new"
        icon={<icons.plus />}
        onClick={() => dispatch({ type: 'newBoard' })}
      />
    </Tabs.Root>
  );
}
