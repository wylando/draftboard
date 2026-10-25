import { Splitter, useSplitter, type SplitterPanelData as PanelData } from '@ark-ui/react/splitter';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { css, cx } from 'styled-system/css';
import { splitter as splitterRecipe } from 'styled-system/recipes';
import { IconButton, icons } from '../../design-system';
import {
  clampPanelWidth,
  loadPanelLayout,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  savePanelLayout,
  type PanelId,
  type PanelLayout,
} from '../panelLayout';

const px = (n: number) => `${n}px`;
const CANVAS_MIN_WIDTH = 320;
// Pixel sizes, so a sidebar keeps its width when the window resizes and only the canvas changes.
const sidebar = (id: PanelId): PanelData => ({
  id,
  minSize: px(PANEL_MIN_WIDTH[id]),
  maxSize: px(PANEL_MAX_WIDTH),
  collapsible: true,
  collapsedSize: px(0),
  resizeBehavior: 'preserve-pixel-size',
});
// Keeps room to draw when both sidebars are at their widest.
const PANELS: PanelData[] = [sidebar('layers'), { id: 'canvas', minSize: px(CANVAS_MIN_WIDTH) }, sidebar('properties')];
const SIDEBAR_INDEX: Record<PanelId, number> = { layers: 0, properties: 2 };
// Ark sizes are percentages with float noise; a collapsed panel is 0.
const COLLAPSED_PERCENT = 0.01;
// Only reached when a toggle changes nothing; until the morph's callback settles, the page doesn't paint.
const MORPH_SETTLE_MS = 300;

const SIDEBARS: Record<PanelId, { title: string; testId: string; side: 'left' | 'right' }> = {
  layers: { title: 'Layers', testId: 'layers-panel', side: 'left' },
  properties: { title: 'Design', testId: 'properties-panel', side: 'right' },
};

const sidebarClass = css({
  flexDirection: 'column',
  bg: 'bg',
  borderColor: 'border',
  borderStyle: 'solid',
  borderWidth: '0',
  '&[data-side=left]': { borderRightWidth: '1px' },
  '&[data-side=right]': { borderLeftWidth: '1px' },
});
// Outside the scrolling panel below it, so it stays put while the panel scrolls.
const headerClass = css({
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: '1',
  height: 'panelHeader',
  paddingInline: '2',
  '[data-side=left] > &': { paddingInlineStart: '4' },
  '[data-side=right] > &': { paddingInlineEnd: '4' },
});
const titleClass = css({ flex: '1', margin: '0', textStyle: 'body.mediumStrong' });
const canvasPanelClass = css({ position: 'relative' });
// Over the canvas but a sibling of it: the canvas starts gestures on pointer-down.
const chipClass = css({
  position: 'absolute',
  top: '2',
  padding: '1',
  borderRadius: 'medium',
  bg: 'bg',
  boxShadow: 'elevation100',
  '&[data-side=left]': { left: '2' },
  '&[data-side=right]': { right: '2' },
});
// One name per panel, held by the open panel or by its collapsed button, never both: a view
// transition between the two morphs one into the other (pseudo-element styles in panda.config.ts).
const morphName: Record<PanelId, string> = {
  layers: css({ viewTransitionName: 'layers-panel' }),
  properties: css({ viewTransitionName: 'properties-panel' }),
};

/** Panel widths and collapse state, saved across sessions, with the Ark splitter that applies them. */
function useSidePanels() {
  const [layout, setLayout] = useState<PanelLayout>(loadPanelLayout);
  const rootRef = useRef<HTMLDivElement>(null);
  const rootWidth = () => rootRef.current?.getBoundingClientRect().width ?? 0;

  useEffect(() => savePanelLayout(layout), [layout]);

  const splitter = useSplitter({
    panels: PANELS,
    // Read once, on mount. The canvas takes what the sidebars leave: 'auto' is no size Ark can
    // parse, so it gets the rest.
    defaultSize: [
      px(layout.layers.collapsed ? 0 : layout.layers.width),
      'auto',
      px(layout.properties.collapsed ? 0 : layout.properties.width),
    ],
    // Percent of the body, not px, despite Ark's docs (zag 1.45 adds it to percentage sizes).
    keyboardResizeBy: 1,
    // Saved once a drag ends, not on every tick. Ark sizes are percentages of the body.
    onResizeEnd: ({ size }) => {
      const width = rootWidth();
      if (width <= 0) return;
      setLayout((prev) => {
        const next = { ...prev };
        for (const id of ['layers', 'properties'] as const) {
          const percent = size[SIDEBAR_INDEX[id]] ?? 0;
          // A drag that ends collapsed keeps the width the panel reopens at.
          if (percent >= COLLAPSED_PERCENT) next[id] = { ...prev[id], width: clampPanelWidth(id, (percent / 100) * width) };
        }
        return next;
      });
    },
    // Read from the sizes, not onCollapse/onExpand: Ark doesn't report expanding a panel that
    // started collapsed.
    onResize: ({ size }) =>
      setLayout((prev) => {
        let next = prev;
        for (const id of ['layers', 'properties'] as const) {
          const collapsed = (size[SIDEBAR_INDEX[id]] ?? 0) < COLLAPSED_PERCENT;
          if (collapsed !== prev[id].collapsed) next = { ...next, [id]: { ...prev[id], collapsed } };
        }
        return next;
      }),
  });

  const toggle = (id: PanelId) => {
    if (!layout[id].collapsed) return splitter.collapsePanel(id);
    splitter.expandPanel(id);
    // Ark reopens at the share of the body the panel had when it collapsed (or its minimum, if it
    // started collapsed); the window may have resized since, so set the saved width.
    const width = rootWidth();
    if (width > 0) splitter.resizePanel(id, (layout[id].width / width) * 100);
  };

  return { splitter, layout, toggle, rootRef };
}

interface EditorBodyProps {
  layers: ReactNode;
  canvas: ReactNode;
  properties: ReactNode;
}

/** Layers | canvas | Design. Each sidebar collapses into a button in its corner of the canvas. */
export function EditorBody({ layers, canvas, properties }: EditorBodyProps) {
  const classes = splitterRecipe();
  const { splitter, layout, toggle, rootRef } = useSidePanels();
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  // The button to focus once a toggle commits: the one that was clicked is inert or gone by then.
  const focusAfter = useRef<string | null>(null);
  const settleMorph = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    settleMorph.current?.();
    settleMorph.current = null;
    if (focusAfter.current) buttons.current.get(focusAfter.current)?.focus();
    focusAfter.current = null;
  }, [layout]);

  const toggleWithMorph = (id: PanelId) => {
    focusAfter.current = `${layout[id].collapsed ? 'hide' : 'show'}-${id}`;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('startViewTransition' in document)) return toggle(id);
    // The after-snapshot is taken when this settles, so it waits for the toggle to commit.
    document.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          settleMorph.current = resolve;
          toggle(id);
          setTimeout(resolve, MORPH_SETTLE_MS);
        }),
    );
  };

  const toggleButton = (id: PanelId, action: 'hide' | 'show') => (
    <IconButton
      ref={(el) => {
        buttons.current.set(`${action}-${id}`, el);
      }}
      label={`${action === 'hide' ? 'Hide' : 'Show'} ${SIDEBARS[id].title} panel`}
      aria-expanded={action === 'hide'}
      data-testid={`${action}-${SIDEBARS[id].testId}`}
      icon={id === 'layers' ? <icons.panelLeft /> : <icons.panelRight />}
      onClick={() => toggleWithMorph(id)}
    />
  );

  const sidebarPanel = (id: PanelId, content: ReactNode) => {
    const { title, side } = SIDEBARS[id];
    const collapsed = layout[id].collapsed;
    return (
      // Inert while collapsed: zero width hides it, but its controls could still take focus.
      <Splitter.Panel id={id} className={cx(classes.panel, sidebarClass, !collapsed && morphName[id])} data-side={side} inert={collapsed}>
        {/* The button sits on the canvas side, nearest the corner the panel collapses to. */}
        <div className={headerClass}>
          {side === 'right' && toggleButton(id, 'hide')}
          <h2 className={titleClass}>{title}</h2>
          {side === 'left' && toggleButton(id, 'hide')}
        </div>
        {content}
      </Splitter.Panel>
    );
  };

  const chip = (id: PanelId) =>
    layout[id].collapsed && (
      <div className={cx(chipClass, morphName[id])} data-side={SIDEBARS[id].side}>
        {toggleButton(id, 'show')}
      </div>
    );

  return (
    <Splitter.RootProvider value={splitter} ref={rootRef} className={classes.root}>
      {sidebarPanel('layers', layers)}
      <Splitter.ResizeTrigger
        id="layers:canvas"
        className={classes.resizeTrigger}
        data-side="left"
        data-testid="resize-layers"
        aria-label="Resize Layers panel"
      />
      <Splitter.Panel id="canvas" className={cx(classes.panel, canvasPanelClass)}>
        {canvas}
        {chip('layers')}
        {chip('properties')}
      </Splitter.Panel>
      <Splitter.ResizeTrigger
        id="canvas:properties"
        className={classes.resizeTrigger}
        data-side="right"
        data-testid="resize-properties"
        aria-label="Resize Design panel"
      />
      {sidebarPanel('properties', properties)}
    </Splitter.RootProvider>
  );
}
