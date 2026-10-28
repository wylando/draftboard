import { defineSlotRecipe } from '@pandacss/dev';

/**
 * A wrapping row of small text toggles (Ark UI ToggleGroup with `multiple`),
 * for flags such as a column's PK / Null / Unique. Slots match Ark's parts.
 * Ark marks a pressed item with `data-state="on"`.
 */
export const chipGroupRecipe = defineSlotRecipe({
  className: 'chip-group',
  description: 'Wrapping row of small text toggles (Ark UI ToggleGroup)',
  slots: ['root', 'item'],
  base: {
    root: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '1',
    },
    item: {
      paddingBlock: '[2px]',
      paddingInline: '2',
      borderWidth: '1px',
      borderStyle: 'solid',
      minHeight: 'target',
      borderColor: 'border.control',
      borderRadius: 'medium',
      bg: 'bg',
      color: 'text.secondary',
      textStyle: 'body.medium',
      cursor: 'pointer',
      _hover: { bg: 'bg.hover' },
      '&[data-state=on]': { borderColor: 'border.selected', bg: 'bg.selected', color: 'text' },
      _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.focus', outlineOffset: '1px' },
    },
  },
});
