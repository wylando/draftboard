import { defineSlotRecipe } from '@pandacss/dev';

/**
 * The editor body (Ark UI Splitter): Layers, canvas and Design panel side by side. A resize trigger
 * takes no width, so the canvas keeps its size; its grab area is a `::before` reaching into the
 * sidebar only (`[data-side]`), because a canvas press must never land on it. Panel sizes are inline,
 * set by Ark.
 */
export const splitterRecipe = defineSlotRecipe({
  className: 'splitter',
  description: 'Editor body with resizable, collapsible sidebars',
  slots: ['root', 'panel', 'resizeTrigger'],
  base: {
    root: { flex: '1', display: 'flex', minHeight: '0' },
    panel: { display: 'flex', minWidth: '0' },
    resizeTrigger: {
      position: 'relative',
      zIndex: '1',
      width: '0',
      outline: 'none',
      _before: {
        content: '""',
        position: 'absolute',
        insetBlock: '0',
        width: 'resizeGrab',
      },
      '&[data-side=left]::before': { right: '0' },
      '&[data-side=right]::before': { left: '0' },
      // A line over the panel's border while the handle is hovered, dragged or focused.
      _after: {
        content: '""',
        position: 'absolute',
        insetBlock: '0',
        width: '[2px]',
        bg: 'selection',
        opacity: '0',
        pointerEvents: 'none',
      },
      '&[data-side=left]::after': { right: '-1px' },
      '&[data-side=right]::after': { left: '-1px' },
      '&:hover::after, &[data-dragging]::after, &:focus-visible::after': { opacity: '1' },
      // Hover and drag keep the selection blue; the keyboard focus line must meet 3:1, which that blue misses on white.
      '&:focus-visible::after': { bg: 'border.focus' },
    },
  },
});
