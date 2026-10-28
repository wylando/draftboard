import { defineRecipe } from '@pandacss/dev';

export const buttonRecipe = defineRecipe({
  className: 'button',
  description: 'Text button',
  // Lets Panda's extractor see `<Button variant="…">` usages and emit those variants.
  jsx: ['Button'],
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1',
    height: 'control',
    paddingInline: '3',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: 'medium',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    _disabled: { opacity: '0.4', cursor: 'default' },
    _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.selected', outlineOffset: '1px' },
  },
  variants: {
    variant: {
      default: {
        borderColor: 'border.strong',
        bg: 'bg',
        _hover: { bg: 'bg.hover' },
      },
      primary: {
        borderColor: 'transparent',
        bg: 'bg.brand',
        color: 'text.onBrand',
        _hover: { bg: 'bg.brandHover' },
      },
      danger: {
        borderColor: 'transparent',
        bg: 'bg.danger',
        color: 'text.onBrand',
        _hover: { bg: 'bg.dangerHover' },
      },
      ghost: {
        borderColor: 'transparent',
        bg: 'transparent',
        _hover: { bg: 'bg.hover' },
      },
      /** Ghost button on the dark toolbar. */
      toolbar: {
        borderColor: 'transparent',
        bg: 'transparent',
        color: 'text.onToolbar',
        _hover: { bg: 'bg.toolbarHover' },
      },
    },
  },
  defaultVariants: { variant: 'default' },
});
