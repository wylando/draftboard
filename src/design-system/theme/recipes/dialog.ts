import { defineSlotRecipe } from '@pandacss/dev';

/** Slots match Ark UI's Dialog parts, plus `actions` for the button row. */
export const dialogRecipe = defineSlotRecipe({
  className: 'dialog',
  description: 'Modal dialog (Ark UI Dialog)',
  slots: ['backdrop', 'positioner', 'content', 'title', 'description', 'actions'],
  base: {
    backdrop: {
      position: 'fixed',
      inset: '0',
      zIndex: 'overlay',
      bg: 'bg.backdrop',
    },
    positioner: {
      position: 'fixed',
      inset: '0',
      zIndex: 'overlay',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4',
    },
    content: {
      width: 'dialog',
      maxWidth: 'full',
      padding: '4',
      display: 'grid',
      gap: '2',
      borderRadius: 'large',
      bg: 'bg',
      boxShadow: 'elevation200',
      outline: 'none',
    },
    title: {
      margin: '0',
      textStyle: 'body.largeStrong',
    },
    description: {
      margin: '0',
      color: 'text.secondary',
    },
    actions: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '2',
      marginTop: '2',
    },
  },
});
