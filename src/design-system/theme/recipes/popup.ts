import { defineSlotRecipe } from '@pandacss/dev';

/**
 * A non-modal card floating over the canvas (`CanvasPopup`). `positioner` is the area it may take: the canvas
 * minus the collapsed-panel chips and the tool dock. `section` and `label` split the body into titled parts.
 */
export const popupRecipe = defineSlotRecipe({
  className: 'popup',
  description: 'Floating canvas popup in the tool dock\'s dark style',
  jsx: ['CanvasPopup'],
  slots: ['positioner', 'content', 'header', 'title', 'body', 'section', 'label'],
  base: {
    positioner: {
      position: 'absolute',
      top: 'panelChipClearance',
      bottom: 'toolDockClearance',
      insetInline: '2',
      // The area lets presses through to the canvas; only the card takes them.
      pointerEvents: 'none',
    },
    content: {
      position: 'absolute',
      width: 'max-content',
      maxWidth: 'popup',
      // A long route scrolls inside the card rather than running past the tool dock.
      maxHeight: 'full',
      gridTemplateRows: 'auto minmax(0, 1fr)',
      paddingBlock: '2',
      paddingInline: '3',
      display: 'grid',
      gap: '2',
      borderRadius: 'large',
      bg: 'bg.popup',
      backdropFilter: 'blur(12px)',
      color: 'text.onToolbar',
      boxShadow: 'elevation300',
      outlineWidth: '1px',
      outlineStyle: 'solid',
      outlineColor: 'border.onToolbar',
      outlineOffset: '-1px',
      pointerEvents: 'auto',
      cursor: 'default',
      animation: 'popupIn 140ms cubic-bezier(0.2, 0, 0, 1)',
      _motionReduce: { animation: 'none' },
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '2',
      // The close button's own padding lines its icon up with the content edge.
      marginInlineEnd: '-2',
      marginBlock: '-1',
    },
    title: { flex: '1', margin: '0', textStyle: 'body.mediumStrong' },
    body: { display: 'grid', alignContent: 'start', gap: '2', overflowWrap: 'anywhere', overflowY: 'auto', overscrollBehavior: 'contain' },
    section: {
      display: 'grid',
      gap: '1',
      paddingTop: '2',
      borderTopWidth: '1px',
      borderTopStyle: 'solid',
      borderTopColor: 'border.onToolbar',
    },
    label: { margin: '0', textStyle: 'body.mediumStrong' },
  },
});
