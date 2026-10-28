import { defineSlotRecipe } from '@pandacss/dev';

/**
 * Brief feedback over the canvas (`ToastRegion`). Ark positions toasts with the `--x`, `--y`, `--opacity`
 * and `--scale` variables it sets inline; `root` only has to apply them. `group` is the region itself and
 * lets presses through to the canvas; only a toast takes them.
 */
export const toastRecipe = defineSlotRecipe({
  className: 'toast',
  description: 'Transient feedback toast in the popup\'s style',
  jsx: ['ToastRegion'],
  slots: ['group', 'root', 'title', 'actionTrigger'],
  base: {
    group: { pointerEvents: 'none' },
    root: {
      // Ark gives it `position: absolute; bottom: 0` inline, so centring is margin-based.
      insetInline: '0',
      marginInline: 'auto',
      width: 'fit-content',
      maxWidth: 'full',
      display: 'flex',
      alignItems: 'center',
      gap: '3',
      paddingBlock: '2',
      paddingInline: '3',
      borderRadius: 'large',
      bg: 'bg.popup',
      backdropFilter: 'blur(12px)',
      color: 'text.onToolbar',
      boxShadow: 'elevation300',
      outlineWidth: '1px',
      outlineStyle: 'solid',
      outlineColor: 'border.onToolbar',
      outlineOffset: '-1px',
      translate: 'var(--x) var(--y)',
      scale: 'var(--scale)',
      zIndex: 'var(--z-index)',
      height: 'var(--height)',
      opacity: 'var(--opacity)',
      willChange: 'translate, opacity, scale',
      transition: 'translate 250ms, scale 250ms, opacity 250ms',
      _motionReduce: { transition: 'none' },
    },
    title: { margin: '0', textStyle: 'body.medium' },
    actionTrigger: {
      paddingInline: '2',
      height: 'kbd',
      border: 'none',
      borderRadius: 'medium',
      bg: 'transparent',
      color: 'text.onToolbar',
      textStyle: 'body.mediumStrong',
      cursor: 'pointer',
      _hover: { bg: 'bg.toolbarHover' },
      _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.selected', outlineOffset: '1px' },
    },
  },
});
