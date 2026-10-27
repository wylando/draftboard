import { defineSlotRecipe } from '@pandacss/dev';

/** A list of one-line rows that each open into their editor (Ark UI Accordion), such as a long table's columns. */
export const accordionRecipe = defineSlotRecipe({
  className: 'accordion',
  description: 'List of one-line rows that open into an editor (Ark UI Accordion)',
  slots: ['root', 'item', 'itemTrigger', 'itemIndicator', 'itemContent'],
  base: {
    root: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' },
    item: {
      borderTopWidth: '1px',
      borderTopStyle: 'solid',
      borderTopColor: 'border',
      _first: { borderTopWidth: '0' },
    },
    itemTrigger: {
      display: 'flex',
      alignItems: 'center',
      gap: '2',
      width: 'full',
      minHeight: 'control',
      paddingBlock: '1',
      paddingInline: '0',
      border: 'none',
      bg: 'transparent',
      color: 'inherit',
      font: 'inherit',
      textAlign: 'start',
      cursor: 'pointer',
      _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.selected', outlineOffset: '1px' },
    },
    itemIndicator: {
      display: 'flex',
      flex: 'none',
      color: 'icon',
      '[data-part=item-trigger]:hover > &': { color: 'text' },
      // chevronRight points down while the row is open.
      '&[data-state=open]': { transform: 'rotate(90deg)' },
    },
    itemContent: { paddingBlockEnd: '2' },
  },
});
