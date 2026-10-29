import { defineSlotRecipe } from '@pandacss/dev';

/**
 * Card-style radio options (Ark UI RadioGroup). Slots match Ark's parts, plus
 * `itemDescription` for the secondary line. Ark marks the chosen item with
 * `data-state="checked"`.
 */
export const radioGroupRecipe = defineSlotRecipe({
  className: 'radio-group',
  description: 'Radio options shown as bordered cards (Ark UI RadioGroup)',
  slots: ['root', 'label', 'item', 'itemControl', 'itemText', 'itemDescription'],
  base: {
    root: {
      display: 'grid',
      gap: '2',
    },
    label: {
      textStyle: 'body.largeStrong',
    },
    item: {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      columnGap: '2',
      alignItems: 'center',
      paddingBlock: '2',
      paddingInline: '3',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'border',
      borderRadius: 'medium',
      cursor: 'pointer',
      _hover: { bg: 'bg.hover' },
      '&[data-state=checked]': { borderColor: 'border.selected', bg: 'bg.selected', _hover: { bg: 'bg.selected' } },
    },
    itemControl: {
      width: 'radio',
      height: 'radio',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'border.control',
      borderRadius: 'full',
      bg: 'bg',
      '&[data-state=checked]': { borderWidth: '4px', borderColor: 'bg.brand' },
      '&[data-focus-visible]': { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.focus', outlineOffset: '1px' },
    },
    itemText: {
      textStyle: 'body.largeStrong',
    },
    itemDescription: {
      gridColumn: '2',
      color: 'text.secondary',
    },
  },
});
