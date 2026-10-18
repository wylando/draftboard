import { defineRecipe } from '@pandacss/dev';

export const navItemRecipe = defineRecipe({
  className: 'nav-item',
  description: 'Sidebar navigation entry; `aria-current` marks the active one',
  jsx: ['NavItem'],
  base: {
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
    '&[aria-current=page]': { bg: 'bg.selected', textStyle: 'body.largeStrong' },
  },
});
