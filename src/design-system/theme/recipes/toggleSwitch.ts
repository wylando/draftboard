import { defineSlotRecipe } from '@pandacss/dev';

/**
 * On/off setting (Ark UI Switch). Slots match Ark's parts, plus
 * `description` for the secondary line, which sits outside the root so it
 * isn't read as part of the switch's name. Ark marks the on state with
 * `data-state="checked"` on every part.
 */
export const toggleSwitchRecipe = defineSlotRecipe({
  className: 'toggle-switch',
  description: 'A labelled on/off toggle (Ark UI Switch)',
  slots: ['root', 'control', 'thumb', 'label', 'description'],
  base: {
    root: {
      display: 'flex',
      gap: '2',
      alignItems: 'center',
      cursor: 'pointer',
    },
    control: {
      display: 'inline-flex',
      alignItems: 'center',
      width: 'switchWidth',
      height: 'switchHeight',
      paddingInline: '[2px]',
      borderRadius: 'full',
      bg: 'border.strong',
      transition: 'background-color 0.15s ease',
      '&[data-state=checked]': { bg: 'bg.brand' },
      '&[data-focus-visible]': { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.selected', outlineOffset: '1px' },
    },
    thumb: {
      width: 'switchThumb',
      height: 'switchThumb',
      borderRadius: 'full',
      bg: 'bg',
      boxShadow: 'elevation100',
      transition: 'transform 0.15s ease',
      // Track width minus thumb width minus both 2px paddings.
      '&[data-state=checked]': { transform: 'translateX(calc(token(sizes.switchWidth) - token(sizes.switchThumb) - 4px))' },
    },
    label: {
      textStyle: 'body.largeStrong',
    },
    description: {
      margin: '0',
      // Lines up under the label: the track's width plus the root's gap.
      paddingInlineStart: '[calc(token(sizes.switchWidth) + token(spacing.2))]',
      color: 'text.secondary',
    },
  },
});
