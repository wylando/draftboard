import { defineConfig } from '@pandacss/dev';
import {
  buttonRecipe,
  checkboxRecipe,
  chipGroupRecipe,
  dialogRecipe,
  fieldRecipe,
  iconButtonRecipe,
  kbdRecipe,
  panelRecipe,
  radioGroupRecipe,
  sectionRecipe,
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
      radioGroup: radioGroupRecipe,
      toggleSwitch: toggleSwitchRecipe,
      checkbox: checkboxRecipe,
      chipGroup: chipGroupRecipe,
    },
  },
  globalCss: {
    'html, body, #root': { height: 'full', margin: '0' },
    body: {
      textStyle: 'body.medium',
      color: 'text',
      bg: 'bg',
      overflow: 'hidden',
      WebkitFontSmoothing: 'antialiased',
    },
  },
});
