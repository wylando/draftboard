import { css } from 'styled-system/css';

/** Styles shared by several editor components. One-off styles live next to their component. */
export const sidebarLeft = css({
  flex: 'none',
  width: 'sidebarWidth',
  borderRightWidth: '1px',
  borderRightStyle: 'solid',
  borderRightColor: 'border',
});

export const sidebarRight = css({
  flex: 'none',
  width: 'sidebarWidth',
  borderLeftWidth: '1px',
  borderLeftStyle: 'solid',
  borderLeftColor: 'border',
});

export const twoColumnGrid = css({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '2',
});

/** Inline message under a field whose value was refused, e.g. a taken layer name. */
export const fieldError = css({
  margin: '0',
  marginTop: '1',
  color: 'text.danger',
});

export const emptyHint = css({
  margin: '0',
  color: 'text.secondary',
});
