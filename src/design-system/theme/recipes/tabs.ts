import { defineSlotRecipe } from '@pandacss/dev';

/**
 * Tabs (Ark UI Tabs). `vertical` (the default) is section navigation; `horizontal`
 * is a row of tabs above their panel. Ark marks the active trigger with `data-selected`.
 */
export const tabsRecipe = defineSlotRecipe({
  className: 'tabs',
  description: 'Tabs (Ark UI Tabs), vertical sidebar or horizontal row',
  slots: ['root', 'list', 'trigger', 'content'],
  base: {
    root: {
      display: 'flex',
      minHeight: '0',
    },
    list: {
      flex: 'none',
      display: 'flex',
      gap: '1',
    },
    trigger: {
      display: 'flex',
      alignItems: 'center',
      gap: '2',
      height: 'layerRow',
      paddingInline: '3',
      border: 'none',
      borderRadius: 'medium',
      bg: 'transparent',
      textAlign: 'start',
      textStyle: 'body.large',
      cursor: 'pointer',
      _hover: { bg: 'bg.hover' },
      _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.focus', outlineOffset: '1px' },
      '&[data-selected]': { bg: 'bg.selected', textStyle: 'body.largeStrong' },
    },
    content: {
      flex: '1',
      minWidth: '0',
      outline: 'none',
    },
  },
  variants: {
    orientation: {
      vertical: {
        list: { flexDirection: 'column' },
        trigger: { width: 'full' },
      },
      horizontal: {
        root: { flexDirection: 'column', gap: '2' },
        list: { flexDirection: 'row' },
        trigger: { width: 'auto' },
      },
    },
  },
  defaultVariants: { orientation: 'vertical' },
});
