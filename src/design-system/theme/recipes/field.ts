import { defineSlotRecipe } from '@pandacss/dev';

/**
 * Shared shell for NumberInput / TextInput / ColorInput (Ark UI Field) and
 * SearchInput. `root` stacks the bordered `control` above any error text.
 */
export const fieldRecipe = defineSlotRecipe({
  className: 'field',
  description: 'Compact labelled input',
  slots: ['root', 'control', 'label', 'input', 'swatch', 'errorText'],
  base: {
    root: {
      display: 'grid',
      gap: '1',
      minWidth: '0',
    },
    control: {
      display: 'flex',
      alignItems: 'center',
      gap: '1',
      height: 'control',
      minWidth: '0',
      paddingInline: '2',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'transparent',
      borderRadius: 'medium',
      bg: 'bg.secondary',
      _hover: { borderColor: 'border' },
      _focusWithin: { borderColor: 'border.selected', bg: 'bg' },
    },
    label: {
      flex: 'none',
      minWidth: '[12px]',
      color: 'text.secondary',
    },
    input: {
      flex: '1',
      width: 'full',
      minWidth: '0',
      padding: '0',
      border: 'none',
      outline: 'none',
      bg: 'transparent',
    },
    swatch: {
      flex: 'none',
      width: 'swatch',
      height: 'swatch',
      padding: '0',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'border',
      borderRadius: 'small',
      bg: 'transparent',
      cursor: 'pointer',
      '&::-webkit-color-swatch-wrapper': { padding: '0' },
      '&::-webkit-color-swatch': { border: 'none', borderRadius: '[1px]' },
    },
    errorText: {
      margin: '0',
      color: 'text.danger',
    },
  },
});
