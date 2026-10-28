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
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'border.control',
      borderRadius: 'full',
      bg: 'bg.secondary',
      transition: 'background-color 0.15s ease',
      '&[data-state=checked]': { bg: 'bg.brand', borderColor: 'bg.brand' },
      '&[data-focus-visible]': { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.focus', outlineOffset: '1px' },
    },
    thumb: {
      width: 'switchThumb',
      height: 'switchThumb',
      borderRadius: 'full',
      // Dark when off so it reads against the pale track; white on the brand track when on.
      bg: 'border.control',
      transition: 'transform 0.15s ease, background-color 0.15s ease',
      // Track width minus thumb width minus the 2px paddings and 1px borders.
      '&[data-state=checked]': { bg: 'text.onBrand', transform: 'translateX(calc(token(sizes.switchWidth) - token(sizes.switchThumb) - 6px))' },
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
