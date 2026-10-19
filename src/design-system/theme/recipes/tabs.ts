import { defineSlotRecipe } from '@pandacss/dev';

/**
 * Vertical tabs used as section navigation (Ark UI Tabs). Ark marks the active
 * trigger with `data-selected`.
 */
export const tabsRecipe = defineSlotRecipe({
  className: 'tabs',
  description: 'Sidebar section navigation (Ark UI Tabs, vertical)',
  slots: ['root', 'list', 'trigger', 'content'],
  base: {
    root: {
      display: 'flex',
      minHeight: '0',
    },
    list: {
      flex: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: '1',
    },
    trigger: {
      display: 'flex',
      alignItems: 'center',
      gap: '2',
      width: 'full',
      height: 'layerRow',
      paddingInline: '3',
      border: 'none',
      borderRadius: 'medium',
      bg: 'transparent',
      textAlign: 'start',
      textStyle: 'body.large',
      cursor: 'pointer',
      _hover: { bg: 'bg.hover' },
      _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.selected', outlineOffset: '1px' },
      '&[data-selected]': { bg: 'bg.selected', textStyle: 'body.largeStrong' },
    },
    content: {
      flex: '1',
      minWidth: '0',
      outline: 'none',
    },
  },
});
