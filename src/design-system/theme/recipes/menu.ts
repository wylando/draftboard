import { defineSlotRecipe } from '@pandacss/dev';

/** Slots match Ark UI's Menu parts: a light floating list whose highlighted item follows hover and the arrow keys. */
export const menuRecipe = defineSlotRecipe({
  className: 'menu',
  description: 'Context or dropdown menu (Ark UI Menu)',
  jsx: ['Menu'],
  slots: ['positioner', 'content', 'item', 'separator'],
  base: {
    positioner: {
      zIndex: 'overlay',
    },
    content: {
      minWidth: '160px',
      padding: '1',
      borderRadius: 'medium',
      bg: 'bg',
      boxShadow: 'elevation200',
      outline: 'none',
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      paddingBlock: '1',
      paddingInline: '2',
      borderRadius: 'small',
      textStyle: 'body.medium',
      cursor: 'pointer',
      userSelect: 'none',
      '&[data-highlighted]': { bg: 'bg.hover' },
      '&[data-disabled]': { color: 'text.secondary', cursor: 'default', pointerEvents: 'none' },
    },
    separator: {
      height: '1px',
      marginBlock: '1',
      bg: 'border',
    },
  },
});
