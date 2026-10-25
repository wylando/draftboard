import { Splitter, useSplitter, type SplitterPanelData as PanelData } from '@ark-ui/react/splitter';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { splitter as splitterRecipe } from 'styled-system/recipes';
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
// Pixel sizes, so a sidebar keeps its width when the window resizes and only the canvas changes.
const sidebar = (id: PanelId): PanelData => ({
  id,
  minSize: px(PANEL_MIN_WIDTH[id]),
  maxSize: px(PANEL_MAX_WIDTH),
  collapsible: true,
  collapsedSize: px(0),
  resizeBehavior: 'preserve-pixel-size',
});
const PANELS: PanelData[] = [sidebar('layers'), { id: 'canvas' }, sidebar('properties')];
const SIDEBAR_INDEX: Record<PanelId, number> = { layers: 0, properties: 2 };
// Ark sizes are percentages with float noise; a collapsed panel is 0.
const COLLAPSED_PERCENT = 0.01;

/** Panel widths and collapse state, saved across sessions, with the Ark splitter that applies them. */
export function useSidePanels() {
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
    const width = rootWidth();
    // Reopens at the saved width, which Ark doesn't know when the panel started collapsed.
    splitter.expandPanel(id, width > 0 ? (layout[id].width / width) * 100 : undefined);
  };

  return { splitter, layout, toggle, rootRef };
}

export type SidePanels = ReturnType<typeof useSidePanels>;

interface EditorBodyProps {
  panels: SidePanels;
  layers: ReactNode;
  canvas: ReactNode;
  properties: ReactNode;
}

export function EditorBody({ panels, layers, canvas, properties }: EditorBodyProps) {
  const classes = splitterRecipe();
  const { splitter, layout, rootRef } = panels;
  return (
    <Splitter.RootProvider value={splitter} ref={rootRef} className={classes.root}>
      {/* Inert while collapsed: zero width hides it, but its controls could still take focus. */}
      <Splitter.Panel id="layers" className={classes.panel} inert={layout.layers.collapsed}>
        {layers}
      </Splitter.Panel>
      <Splitter.ResizeTrigger
        id="layers:canvas"
        className={classes.resizeTrigger}
        data-side="left"
        data-testid="resize-layers"
        aria-label="Resize Layers panel"
      />
      <Splitter.Panel id="canvas" className={classes.panel}>
        {canvas}
      </Splitter.Panel>
      <Splitter.ResizeTrigger
        id="canvas:properties"
        className={classes.resizeTrigger}
        data-side="right"
        data-testid="resize-properties"
        aria-label="Resize Design panel"
      />
      <Splitter.Panel id="properties" className={classes.panel} inert={layout.properties.collapsed}>
        {properties}
      </Splitter.Panel>
    </Splitter.RootProvider>
  );
}
