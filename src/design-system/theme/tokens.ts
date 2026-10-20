import { defineTokens } from '@pandacss/dev';

/**
 * Primitive tokens: raw values. Components never use these directly; they use
 * semantic tokens (./semanticTokens.ts).
 */
export const tokens = defineTokens({
  colors: {
    white: { value: '#ffffff' },
    black: {
      500: { value: '#00000080' },
      800: { value: '#000000e5' },
    },
    grey: {
      100: { value: '#f5f5f5' },
      200: { value: '#e6e6e6' },
      300: { value: '#d9d9d9' },
      400: { value: '#b3b3b3' },
      500: { value: '#757575' },
      600: { value: '#444444' },
      700: { value: '#383838' },
      800: { value: '#2c2c2c' },
      900: { value: '#1e1e1e' },
      1000: { value: '#111111' },
    },
    blue: {
      100: { value: '#f2f9ff' },
      200: { value: '#e5f4ff' },
      300: { value: '#bde3ff' },
      400: { value: '#80caff' },
      500: { value: '#0d99ff' },
      600: { value: '#0a6dc2' },
      700: { value: '#105cad' },
    },
    red: {
      500: { value: '#f24822' },
    },
  },
  fonts: {
    default: {
      value: "'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
  },
  fontWeights: {
    default: { value: '400' },
    strong: { value: '500' },
  },
  fontSizes: {
    bodySmall: { value: '0.5625rem' }, // 9px
    bodyMedium: { value: '0.6875rem' }, // 11px
    bodyLarge: { value: '0.8125rem' }, // 13px
  },
  lineHeights: {
    bodySmall: { value: '0.875rem' },
    bodyMedium: { value: '1rem' },
    bodyLarge: { value: '1.375rem' },
  },
  spacing: {
    0: { value: '0' },
    1: { value: '0.25rem' }, // 4px
    2: { value: '0.5rem' }, // 8px
    3: { value: '0.75rem' }, // 12px
    4: { value: '1rem' }, // 16px
    6: { value: '1.5rem' }, // 24px
  },
  radii: {
    none: { value: '0' },
    small: { value: '0.125rem' },
    medium: { value: '0.3125rem' },
    large: { value: '0.8125rem' },
    full: { value: '9999px' },
  },
  shadows: {
    elevation100: { value: '0 1px 3px 0 #00000026, 0 0 0.5px 0 #0000004d' },
    elevation200: { value: '0 1px 3px 0 #0000001a, 0 3px 8px 0 #0000001a, 0 0 0.5px 0 #0000002e' },
  },
  /** Ours: dialogs and other overlays sit above the editor chrome. */
  zIndex: {
    overlay: { value: 1000 },
  },
  sizes: {
    0: { value: '0' },
    toolbarHeight: { value: '48px' },
    sidebarWidth: { value: '240px' },
    control: { value: '28px' },
    swatch: { value: '16px' },
    layerRow: { value: '32px' },
    /** Layers tree: compact rows and one indent step (chevron width), as in code-editor file trees. */
    treeRow: { value: '24px' },
    treeIndent: { value: '16px' },
    zoomLabel: { value: '48px' },
    kbd: { value: '20px' },
    content: { value: '760px' },
    dialog: { value: '400px' },
    radio: { value: '14px' },
    switchWidth: { value: '28px' },
    switchHeight: { value: '16px' },
    switchThumb: { value: '12px' },
    full: { value: '100%' },
  },
});
