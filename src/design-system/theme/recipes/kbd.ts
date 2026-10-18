import { defineRecipe } from '@pandacss/dev';

export const kbdRecipe = defineRecipe({
  className: 'kbd',
  description: 'Keyboard key / shortcut chip',
  jsx: ['Kbd'],
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '1',
    minWidth: 'kbd',
    height: 'kbd',
    paddingInline: '1',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'border.strong',
    borderRadius: 'small',
    bg: 'bg',
    textStyle: 'body.medium',
    fontVariantNumeric: 'tabular-nums',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
  },
  variants: {
    state: {
      default: {},
      /** Differs from the shipped default. */
      customized: { borderColor: 'border.selected', bg: 'bg.selected' },
    },
  },
  defaultVariants: { state: 'default' },
});
