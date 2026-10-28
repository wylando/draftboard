import { defineSemanticTokens } from '@pandacss/dev';

/**
 * Semantic tokens: what components use. Re-theme the app by remapping these.
 */
export const semanticTokens = defineSemanticTokens({
  colors: {
    bg: {
      DEFAULT: { value: '{colors.white}' },
      secondary: { value: '{colors.grey.100}' },
      hover: { value: '{colors.grey.100}' },
      selected: { value: '{colors.blue.200}' },
      /** Layers inside a selected frame or group. */
      selectedChild: { value: '{colors.blue.100}' },
      brand: { value: '{colors.blue.500}' },
      brandHover: { value: '{colors.blue.600}' },
      /** Buttons that destroy work. */
      danger: { value: '{colors.red.600}' },
      dangerHover: { value: '{colors.red.700}' },
      toolbar: { value: '{colors.grey.900}' },
      toolbarHover: { value: '{colors.grey.600}' },
      /** The top bar sits a step lighter than the open board tab, which shares the tool dock's colour. */
      topBar: { value: '{colors.grey.700}' },
      /** Board tabs on the top bar: the open one is set darker, the rest sit back until hovered. */
      tabActive: { value: '{colors.grey.900}' },
      tabHover: { value: '{colors.grey.800}' },
      canvas: { value: '{colors.grey.100}' },
      /** Canvas popups: the dock's dark, slightly see-through so the canvas shows faintly behind (blurred). */
      popup: { value: '#1e1e1ee6' },
      /** Dims the app behind a modal dialog. */
      backdrop: { value: '#00000066' },
    },
    text: {
      DEFAULT: { value: '{colors.black.800}' },
      secondary: { value: '{colors.black.500}' },
      onBrand: { value: '{colors.white}' },
      onToolbar: { value: '{colors.white}' },
      /** Quieter text on the dark toolbar and popups; about 8:1 on grey.900. */
      onToolbarSecondary: { value: '{colors.grey.400}' },
      tabInactive: { value: '{colors.grey.400}' },
      danger: { value: '{colors.red.500}' },
    },
    border: {
      DEFAULT: { value: '{colors.grey.200}' },
      strong: { value: '{colors.grey.300}' },
      selected: { value: '{colors.blue.500}' },
      /** Hairlines on the dark toolbar and popups: a popup's rim and its section dividers. */
      onToolbar: { value: '#ffffff1f' },
      /** Indent guides in the Layers tree. */
      guide: { value: '{colors.grey.200}' },
    },
    icon: {
      DEFAULT: { value: '{colors.black.800}' },
      secondary: { value: '{colors.black.500}' },
    },
    /** A warning sign or note: a soft amber ground with dark ink. */
    warning: {
      bg: { value: '{colors.amber.100}' },
      ink: { value: '{colors.black.800}' },
    },
    /** Canvas background grid (Settings → Canvas). */
    canvasGrid: { value: '{colors.grey.300}' },
    /** Canvas chrome: selection outline, handles, marquee, smart guides. */
    selection: {
      DEFAULT: { value: '{colors.blue.500}' },
      fill: { value: '#0d99ff1a' },
      /** Smart guides while a layer snaps; set apart from the selection blue they cross. */
      guide: { value: '{colors.red.500}' },
      /** Distance labels on the guide colour; dark, since white on it falls short of 4.5:1. */
      guideText: { value: '{colors.black.800}' },
    },
  },
});
