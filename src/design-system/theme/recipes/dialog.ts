import { defineSlotRecipe } from '@pandacss/dev';

/** Slots match Ark UI's Dialog parts, plus `body` (the scrolling content) and `actions` (the button row). */
export const dialogRecipe = defineSlotRecipe({
  className: 'dialog',
  description: 'Modal dialog (Ark UI Dialog)',
  slots: ['backdrop', 'positioner', 'content', 'title', 'description', 'body', 'actions'],
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
      // Backstop: when even the pinned title and actions don't fit, the dialog scrolls as a whole.
      overflowY: 'auto',
    },
    content: {
      width: 'dialog',
      maxWidth: 'full',
      padding: '4',
      // Capped to the positioner so a tall body scrolls instead of pushing the title and actions off screen.
      maxHeight: 'full',
      display: 'flex',
      flexDirection: 'column',
      gap: '2',
      borderRadius: 'large',
      bg: 'bg',
      boxShadow: 'elevation200',
      outline: 'none',
    },
    title: {
      margin: '0',
      flexShrink: '0',
      textStyle: 'body.largeStrong',
    },
    description: {
      margin: '0',
      flexShrink: '0',
      color: 'text.secondary',
    },
    body: {
      display: 'grid',
      gap: '2',
      flex: '1 1 auto',
      minHeight: '0',
      overflowY: 'auto',
      // Room for focus rings at the edges, which overflow would clip; the negative margin keeps alignment.
      padding: '1',
      margin: '-1',
    },
    actions: {
      display: 'flex',
      flexShrink: '0',
      justifyContent: 'flex-end',
      gap: '2',
      marginTop: '2',
    },
  },
});
