import { defineConfig } from '@pandacss/dev';
import {
  accordionRecipe,
  boardTabsRecipe,
  buttonRecipe,
  checkboxRecipe,
  comboboxRecipe,
  chipGroupRecipe,
  dialogRecipe,
  fieldRecipe,
  iconButtonRecipe,
  kbdRecipe,
  menuRecipe,
  panelRecipe,
  popupRecipe,
  radioGroupRecipe,
  sectionRecipe,
  splitterRecipe,
  semanticTokens,
  tabsRecipe,
  textStyles,
  toggleSwitchRecipe,
  tokens,
} from './src/design-system/theme';

export default defineConfig({
  // Base utilities and conditions only; the theme is entirely our own (no preset-panda).
  presets: ['@pandacss/preset-base'],
  preflight: true,
  // Only token values are allowed for token-backed properties; escape hatch: '[value]'.
  strictTokens: true,
  include: ['./src/**/*.{ts,tsx}'],
  exclude: [],
  outdir: 'styled-system',
  // Needed so the extractor reads JSX (e.g. `<Button variant="ghost">` → recipe variants).
  // Style props stay off: styling goes through css() and recipes only.
  jsxFramework: 'react',
  jsxStyleProps: 'none',
  theme: {
    tokens,
    semanticTokens,
    textStyles,
    recipes: {
      button: buttonRecipe,
      iconButton: iconButtonRecipe,
      panel: panelRecipe,
      kbd: kbdRecipe,
    },
    slotRecipes: {
      field: fieldRecipe,
      section: sectionRecipe,
      dialog: dialogRecipe,
      tabs: tabsRecipe,
      boardTabs: boardTabsRecipe,
      menu: menuRecipe,
      radioGroup: radioGroupRecipe,
      toggleSwitch: toggleSwitchRecipe,
      checkbox: checkboxRecipe,
      chipGroup: chipGroupRecipe,
      splitter: splitterRecipe,
      accordion: accordionRecipe,
      combobox: comboboxRecipe,
      popup: popupRecipe,
    },
    keyframes: {
      popupIn: {
        from: { opacity: '0', transform: 'translateY(4px) scale(0.98)' },
        to: { opacity: '1', transform: 'none' },
      },
    },
  },
  globalCss: {
    // Native controls, scrollbars and colour pickers follow the OS, like the semantic tokens do.
    ':root': { colorScheme: 'light dark' },
    'html, body, #root': { height: 'full', margin: '0' },
    body: {
      textStyle: 'body.medium',
      color: 'text',
      bg: 'bg',
      overflow: 'hidden',
      WebkitFontSmoothing: 'antialiased',
    },
    // A sidebar morphing into its collapsed button and back (EditorBody). Only the panel animates;
    // the rest of the page swaps at once instead of cross-fading: with no fade, the default
    // plus-lighter blend would show both page snapshots added together. The panel images keep their
    // size and are clipped to the moving box from the button's corner, so the panel isn't squashed.
    '::view-transition-old(root), ::view-transition-new(root)': { animation: 'none', mixBlendMode: 'normal' },
    '::view-transition-group(layers-panel), ::view-transition-group(properties-panel)': {
      animationDuration: '220ms',
      animationTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
      overflow: 'clip',
      borderRadius: 'medium',
    },
    '::view-transition-old(layers-panel), ::view-transition-new(layers-panel), ::view-transition-old(properties-panel), ::view-transition-new(properties-panel)':
      { height: 'full', objectFit: 'none' },
    '::view-transition-old(layers-panel), ::view-transition-new(layers-panel)': { objectPosition: 'left top' },
    '::view-transition-old(properties-panel), ::view-transition-new(properties-panel)': { objectPosition: 'right top' },
  },
});
