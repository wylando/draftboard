import { defineSlotRecipe } from '@pandacss/dev';

/**
 * Labelled checkbox (Ark UI Checkbox). Slots match Ark's parts. Ark puts
 * `data-state` (checked, unchecked or indeterminate) on root, control and indicator, and
 * `data-focus-visible` on the control.
 */
export const checkboxRecipe = defineSlotRecipe({
  className: 'checkbox',
  jsx: ['Checkbox'],
  description: 'A labelled checkbox (Ark UI Checkbox)',
  slots: ['root', 'control', 'indicator', 'label'],
  base: {
    root: {
      display: 'inline-flex',
      minWidth: '0',
      gap: '2',
      alignItems: 'center',
      cursor: 'pointer',
      '&[data-disabled]': { cursor: 'not-allowed', opacity: '0.5' },
    },
    control: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
      width: 'radio',
      height: 'radio',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'border.control',
      borderRadius: 'small',
      bg: 'bg',
      color: 'text.onBrand',
      '&[data-state=checked], &[data-state=indeterminate]': { borderColor: 'bg.brand', bg: 'bg.brand' },
      '&[data-focus-visible]': { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'border.focus', outlineOffset: '1px' },
    },
    indicator: {
      display: 'inline-flex',
      width: 'full',
      height: 'full',
      // The 16px icon scales to the control's content box so the tick stays inside the border.
      '& svg': { width: 'full', height: 'full' },
      // Ark sets `hidden` on the indicator that doesn't match the state; display above would override it.
      '&[hidden]': { display: 'none' },
    },
    label: {
      minWidth: '0',
      // Names like order_line_items.shipping_address_id have no space to break at.
      overflowWrap: 'anywhere',
      textStyle: 'body.large',
    },
  },
});
