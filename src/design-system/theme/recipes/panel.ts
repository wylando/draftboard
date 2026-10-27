import { defineRecipe, defineSlotRecipe } from '@pandacss/dev';

export const panelRecipe = defineRecipe({
  className: 'panel',
  description: 'Scrollable sidebar surface',
  base: {
    display: 'flex',
    flexDirection: 'column',
    bg: 'bg',
    overflowY: 'auto',
    // Design choice: a sidebar never scrolls sideways; whatever is too wide (a very deep layer) is cut off.
    overflowX: 'hidden',
  },
});

export const sectionRecipe = defineSlotRecipe({
  className: 'section',
  description: 'Titled group inside a panel; with a trigger it folds as an Ark UI Collapsible',
  jsx: ['Section'],
  slots: ['root', 'title', 'trigger', 'indicator', 'body'],
  base: {
    root: {
      paddingBlock: '3',
      paddingInline: '4',
      borderBottomWidth: '1px',
      borderBottomStyle: 'solid',
      borderBottomColor: 'border',
    },
    title: {
      margin: '0',
      marginBottom: '2',
      textStyle: 'body.mediumStrong',
      '[data-state=closed] > &': { marginBottom: '0' },
    },
    trigger: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '2',
      width: 'full',
      padding: '0',
      border: 'none',
      bg: 'transparent',
      color: 'inherit',
      font: 'inherit',
      textAlign: 'start',
      cursor: 'pointer',
      _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.selected', outlineOffset: '1px' },
    },
    indicator: {
      display: 'flex',
      color: 'icon',
      // chevronRight points down while the section is open.
      '&[data-state=open]': { transform: 'rotate(90deg)' },
    },
    body: {
      display: 'grid',
      // An auto column grows to fit a long unbreakable line (a layer name), and the panel
      // scrolls sideways instead of the line ellipsizing.
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: '2',
    },
  },
});
