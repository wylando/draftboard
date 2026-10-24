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
      toolbar: { value: '{colors.grey.900}' },
      toolbarHover: { value: '{colors.grey.700}' },
      /** Board tabs on the dark toolbar: the open one is raised, the rest sit back until hovered. */
      tabActive: { value: '{colors.grey.700}' },
      tabHover: { value: '{colors.grey.800}' },
      canvas: { value: '{colors.grey.100}' },
      /** Dims the app behind a modal dialog. */
      backdrop: { value: '#00000066' },
    },
    text: {
      DEFAULT: { value: '{colors.black.800}' },
      secondary: { value: '{colors.black.500}' },
      onBrand: { value: '{colors.white}' },
      onToolbar: { value: '{colors.white}' },
      tabInactive: { value: '{colors.grey.400}' },
      danger: { value: '{colors.red.500}' },
    },
    border: {
      DEFAULT: { value: '{colors.grey.200}' },
      strong: { value: '{colors.grey.300}' },
      selected: { value: '{colors.blue.500}' },
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
