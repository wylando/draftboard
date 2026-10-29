import { defineSemanticTokens } from '@pandacss/dev';

/**
 * A colour with a light value and a dark one, which applies under the OS's dark preference.
 * Chrome only: document colours (shapes, tables, user picks) are data and never switch.
 */
const pair = (light: string, dark: string) => ({ value: { base: light, _osDark: dark } });

/**
 * Semantic tokens: what components use. Re-theme the app by remapping these.
 * The chrome (top bar, tabs, dock, popups) is light, like the panels; the dark theme mirrors it.
 */
export const semanticTokens = defineSemanticTokens({
  colors: {
    bg: {
      DEFAULT: pair('{colors.white}', '{colors.grey.800}'),
      secondary: pair('{colors.grey.100}', '{colors.grey.900}'),
      hover: pair('{colors.grey.100}', '{colors.grey.700}'),
      selected: pair('{colors.blue.200}', '{colors.navy.700}'),
      /** Layers inside a selected frame or group. */
      selectedChild: pair('{colors.blue.100}', '{colors.navy.800}'),
      brand: pair('{colors.blue.600}', '{colors.blue.500}'),
      brandHover: pair('{colors.blue.700}', '{colors.blue.400}'),
      /** Buttons that destroy work; white text holds 5.3:1 (hover 7:1). */
      danger: { value: '{colors.red.600}' },
      dangerHover: { value: '{colors.red.800}' },
      /** The floating tool dock; a hairline and shadow lift it off the light canvas, a lighter grey off the dark one. */
      toolbar: pair('{colors.white}', '{colors.grey.700}'),
      toolbarHover: pair('{colors.grey.200}', '{colors.grey.600}'),
      /** The top bar shares the panels' surface and rests on a hairline. */
      topBar: pair('{colors.white}', '{colors.grey.800}'),
      /** Board tabs on the top bar: the open one takes the canvas's surface, the rest sit back until hovered. */
      tabActive: pair('{colors.grey.100}', '{colors.grey.900}'),
      tabHover: pair('{colors.grey.200}', '{colors.grey.700}'),
      canvas: pair('{colors.grey.100}', '{colors.grey.900}'),
      /** Canvas popups: the panel surface, slightly see-through so the canvas shows faintly behind (blurred). */
      popup: pair('#ffffffe6', '#2c2c2ce6'),
      /** Dims the app behind a modal dialog. */
      backdrop: pair('#00000066', '#000000a6'),
    },
    text: {
      DEFAULT: pair('{colors.black.800}', '{colors.grey.100}'),
      secondary: pair('{colors.slate.600}', '{colors.grey.400}'),
      /** Disabled controls and items; exempt from contrast rules, so deliberately fainter than secondary. */
      disabled: pair('{colors.grey.400}', '{colors.grey.500}'),
      onBrand: pair('{colors.white}', '{colors.grey.1000}'),
      /** Text on the top bar, dock and popups. */
      onToolbar: pair('{colors.black.800}', '{colors.grey.100}'),
      /** Quieter text on the top bar, dock and popups. */
      onToolbarSecondary: pair('{colors.slate.600}', '{colors.grey.400}'),
      tabInactive: pair('{colors.slate.600}', '{colors.grey.400}'),
      danger: pair('{colors.red.700}', '{colors.red.400}'),
    },
    border: {
      DEFAULT: pair('{colors.grey.200}', '{colors.grey.700}'),
      strong: pair('{colors.grey.300}', '{colors.grey.600}'),
      selected: pair('{colors.blue.500}', '{colors.blue.500}'),
      /** The 1px boundary of inputs, checkboxes, radios, switches and toggles; `border` stays for decorative dividers. */
      control: pair('{colors.slate.400}', '{colors.slate.400}'),
      controlHover: pair('{colors.slate.600}', '{colors.grey.400}'),
      /** Every keyboard focus ring (2px) and focused field. */
      focus: pair('{colors.blue.700}', '{colors.blue.400}'),
      /** Kept apart from `focus` for chrome that may differ from the panels; today they match. */
      focusOnToolbar: pair('{colors.blue.700}', '{colors.blue.400}'),
      /** Hairlines on the top bar, dock and popups: a popup's rim and its section dividers. */
      onToolbar: pair('{colors.grey.200}', '{colors.grey.700}'),
      /** Indent guides in the Layers tree. */
      guide: pair('{colors.grey.200}', '{colors.grey.700}'),
    },
    icon: {
      DEFAULT: pair('{colors.black.800}', '{colors.grey.100}'),
      secondary: pair('{colors.slate.600}', '{colors.grey.400}'),
    },
    /** A warning sign or note: a soft amber ground with dark ink, in both themes. */
    warning: {
      bg: { value: '{colors.amber.100}' },
      ink: { value: '{colors.black.800}' },
    },
    /** Canvas background grid (Settings → Canvas). */
    canvasGrid: pair('{colors.grey.300}', '{colors.grey.700}'),
    /** Canvas chrome: selection outline, handles, marquee, smart guides. Selection and guides hold ≥3:1 on both canvases. */
    selection: {
      DEFAULT: pair('{colors.blue.600}', '{colors.blue.500}'),
      fill: { value: '#0d99ff1a' },
      /** Smart guides while a layer snaps; set apart from the selection blue they cross. */
      guide: { value: '{colors.red.500}' },
      /** Distance labels on the guide colour; dark, since white on it falls short of 4.5:1. */
      guideText: { value: '{colors.black.800}' },
    },
  },
});
