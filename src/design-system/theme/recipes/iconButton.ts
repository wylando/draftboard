import { defineRecipe } from '@pandacss/dev';

export const iconButtonRecipe = defineRecipe({
  className: 'icon-button',
  description: 'Square icon-only button; also styles Ark UI ToggleGroup items, where `data-state=on` marks the active one',
  jsx: ['IconButton'],
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'control',
    height: 'control',
    padding: '0',
    border: 'none',
    borderRadius: 'medium',
    bg: 'transparent',
    cursor: 'pointer',
    '&[data-state=on]': { bg: 'bg.brand', color: 'text.onBrand' },
    _disabled: { opacity: '0.4', cursor: 'default' },
    _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.selected', outlineOffset: '1px' },
  },
  variants: {
    tone: {
      light: { color: 'icon', _hover: { bg: 'bg.hover' } },
      dark: { color: 'text.onToolbar', _hover: { bg: 'bg.toolbarHover' } },
    },
  },
  defaultVariants: { tone: 'light' },
});
