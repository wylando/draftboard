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
    /** Ours: a soft amber for warnings. */
    amber: {
      100: { value: '#fef3c7' },
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
    /** Ours: bottom offset that lifts canvas notices above the floating tool dock (16px gap + 44px dock + 12px air). */
    toolDockClearance: { value: '4.5rem' },
    /** Ours: top offset that keeps canvas popups clear of a collapsed sidebar's chip (8px inset + 36px chip + 4px air). */
    panelChipClearance: { value: '3rem' },
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
    /** Ours: floating canvas popups, lifted further than the dock. */
    elevation300: { value: '0 2px 6px 0 #0000001f, 0 12px 32px 0 #00000033, 0 0 0.5px 0 #0000004d' },
  },
  /** Ours: dialogs and other overlays sit above the editor chrome. */
  zIndex: {
    overlay: { value: 1000 },
  },
  sizes: {
    0: { value: '0' },
    toolbarHeight: { value: '48px' },
    sidebarWidth: { value: '240px' },
    /** A sidebar's title bar, which holds its hide button. */
    panelHeader: { value: '40px' },
    /** How far into a sidebar its resize handle can be grabbed. */
    resizeGrab: { value: '4px' },
    control: { value: '28px' },
    swatch: { value: '16px' },
    layerRow: { value: '32px' },
    /** Layers tree: compact rows and one indent step (chevron width), as in code-editor file trees. */
    treeRow: { value: '24px' },
    treeIndent: { value: '16px' },
    zoomLabel: { value: '48px' },
    /** Board tabs: height, the width they shrink to before the strip scrolls, and their widest. */
    boardTab: { value: '36px' },
    boardTabMin: { value: '96px' },
    boardTabMax: { value: '180px' },
    boardTabClose: { value: '20px' },
    kbd: { value: '20px' },
    content: { value: '760px' },
    dialog: { value: '400px' },
    popup: { value: '280px' },
    radio: { value: '14px' },
    switchWidth: { value: '28px' },
    switchHeight: { value: '16px' },
    switchThumb: { value: '12px' },
    full: { value: '100%' },
  },
});
