import { css } from 'styled-system/css';

/** Styles shared by several editor components. One-off styles live next to their component. */
/** A sidebar's scrolling body, under its header bar; the splitter panel around it sets the width and border. */
export const sidebar = css({ flex: '1', minWidth: '0', minHeight: '0' });

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
