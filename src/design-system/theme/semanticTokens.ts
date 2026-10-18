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
      canvas: { value: '{colors.grey.100}' },
    },
    text: {
      DEFAULT: { value: '{colors.black.800}' },
      secondary: { value: '{colors.black.500}' },
      onBrand: { value: '{colors.white}' },
      onToolbar: { value: '{colors.white}' },
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
    /** Canvas background grid (Settings → Canvas). */
    canvasGrid: { value: '{colors.grey.300}' },
    /** Canvas chrome: selection outline, handles, marquee. */
    selection: {
      DEFAULT: { value: '{colors.blue.500}' },
      fill: { value: '#0d99ff1a' },
    },
  },
});
