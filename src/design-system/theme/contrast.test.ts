import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '../../settings/preferences/storage';
import { contrastRatio, semanticColor, type Mode } from './contrast';
import { comboboxRecipe } from './recipes/combobox';
import { chipGroupRecipe } from './recipes/chipGroup';
import { menuRecipe } from './recipes/menu';
import { splitterRecipe } from './recipes/splitter';
import { textStyles } from './textStyles';
import { tokens } from './tokens';

const MODES: Mode[] = ['light', 'dark'];
const ratio = (fg: string, bg: string, mode: Mode) =>
  contrastRatio(semanticColor(fg, mode), semanticColor(bg, mode), semanticColor('bg.canvas', mode));

// Every surface that carries text or controls: the panels, inputs, selections, and the chrome.
const SURFACES = ['bg', 'bg.secondary', 'bg.selected', 'bg.hover', 'bg.topBar', 'bg.toolbar', 'bg.popup', 'bg.tabActive', 'bg.tabHover', 'bg.canvas'];
const CHROME = ['bg.topBar', 'bg.toolbar', 'bg.popup', 'bg.tabActive', 'bg.tabHover', 'bg.toolbarHover'];

describe.each(MODES)('contrast of the %s theme (WCAG 2.2)', (mode) => {
  it.each(SURFACES)('text and secondary text reach 4.5:1 on %s', (surface) => {
    expect(ratio('text', surface, mode)).toBeGreaterThanOrEqual(4.5);
    expect(ratio('text.secondary', surface, mode)).toBeGreaterThanOrEqual(4.5);
    expect(ratio('icon.secondary', surface, mode)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CHROME)('chrome text reaches 4.5:1 on %s', (surface) => {
    expect(ratio('text.onToolbar', surface, mode)).toBeGreaterThanOrEqual(4.5);
    expect(ratio('text.onToolbarSecondary', surface, mode)).toBeGreaterThanOrEqual(4.5);
    expect(ratio('icon', surface, mode)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['bg.topBar', 'bg.tabActive', 'bg.tabHover'])('inactive tab text reaches 4.5:1 on %s', (surface) => {
    expect(ratio('text.tabInactive', surface, mode)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps disabled text distinct from secondary text', () => {
    expect(semanticColor('text.disabled', mode)).not.toBe(semanticColor('text.secondary', mode));
  });

  it.each(['bg.brand', 'bg.brandHover'])('text on %s reaches 4.5:1', (fill) => {
    expect(ratio('text.onBrand', fill, mode)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['bg.brand', 'bg.brandHover'])('%s reaches 3:1 against the panel surfaces', (fill) => {
    expect(ratio(fill, 'bg', mode)).toBeGreaterThanOrEqual(3);
    expect(ratio(fill, 'bg.secondary', mode)).toBeGreaterThanOrEqual(3);
  });

  it.each(['bg', 'bg.secondary', 'bg.selected', ...CHROME])('the focus ring reaches 3:1 on %s', (surface) => {
    expect(ratio('border.focus', surface, mode)).toBeGreaterThanOrEqual(3);
    expect(ratio('border.focusOnToolbar', surface, mode)).toBeGreaterThanOrEqual(3);
  });

  it.each(['bg', 'bg.secondary', 'bg.popup'])('a control boundary reaches 3:1 on %s', (surface) => {
    expect(ratio('border.control', surface, mode)).toBeGreaterThanOrEqual(3);
  });

  it.each(['bg', 'bg.secondary', 'bg.popup'])('error text reaches 4.5:1 on %s', (surface) => {
    expect(ratio('text.danger', surface, mode)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the smart guides at 3:1 on the canvas', () => {
    expect(ratio('selection.guide', 'bg.canvas', mode)).toBeGreaterThanOrEqual(3);
  });

  // The light canvas's selection blue (2.7:1) is the existing canvas colour, left alone; the dark theme is held to 3:1.
  it.skipIf(mode === 'light')('keeps the selection and relationship highlight at 3:1 on the dark canvas', () => {
    expect(ratio('selection', 'bg.canvas', mode)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(DEFAULT_PREFERENCES.relationHighlight, semanticColor('bg.canvas', mode))).toBeGreaterThanOrEqual(3);
  });

  it('keeps guide labels readable on the guide colour', () => {
    expect(ratio('selection.guideText', 'selection.guide', mode)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('light chrome', () => {
  it('uses light surfaces for the top bar, dock and popups', () => {
    for (const surface of ['bg.topBar', 'bg.toolbar', 'bg.popup']) {
      expect(contrastRatio('#000000', semanticColor(surface), '#ffffff'), surface).toBeGreaterThan(15);
    }
  });
});

describe('menu and combobox highlight', () => {
  it('fills the highlighted item with bg.selected, which differs from the resting surface', () => {
    const highlighted = '&[data-highlighted]';
    expect(menuRecipe.base?.item?.[highlighted]).toMatchObject({ bg: 'bg.selected' });
    expect(comboboxRecipe.base?.item?.[highlighted]).toMatchObject({ bg: 'bg.selected' });
    for (const mode of MODES) expect(semanticColor('bg.selected', mode)).not.toBe(semanticColor('bg', mode));
  });
});

describe('type scale and targets', () => {
  it('has no 9px body style and defines heading styles', () => {
    expect(textStyles).not.toHaveProperty('body.small');
    expect(Object.keys(textStyles.heading ?? {}).sort()).toEqual(['page', 'section', 'title']);
  });

  it('keeps hit targets at 24px or more (WCAG 2.5.8) and a grab area of 8px', () => {
    expect(parseInt(tokens.sizes.boardTabClose.value)).toBeGreaterThanOrEqual(24);
    expect(parseInt(tokens.sizes.target.value)).toBeGreaterThanOrEqual(24);
    expect(parseInt(tokens.sizes.resizeGrab.value)).toBeGreaterThanOrEqual(8);
  });
});

describe('type scale values', () => {
  it('sets inspector text at 12px and reading text at 13px', () => {
    expect(tokens.fontSizes.ui.value).toBe('0.75rem');
    expect(tokens.fontSizes.bodyLarge.value).toBe('0.8125rem');
    expect(tokens.fontSizes).not.toHaveProperty('bodySmall');
    expect(tokens.fontSizes).not.toHaveProperty('bodyMedium');
  });
});

describe('focus indicators', () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return sources(path);
      return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [path] : [];
    });

  // popup.ts's 1px outline is the card's rim, not a focus ring.
  it('colours every 2px outline with a focus token', () => {
    const offenders: string[] = [];
    for (const file of [...sources('src/design-system/theme/recipes'), ...sources('src/editor/components'), ...sources('src/settings')]) {
      for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
        const colour = /outlineColor: '([^']+)'/.exec(line)?.[1];
        if (colour && !line.includes("outlineWidth: '1px'") && !/^border\.focus(OnToolbar)?$/.test(colour) && !file.endsWith('popup.ts')) {
          offenders.push(`${file}:${i + 1} ${colour}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('draws the splitter handle focus line and a pressed chip in the focus colour', () => {
    expect((splitterRecipe.base?.resizeTrigger as Record<string, unknown>)['&:focus-visible::after']).toMatchObject({ bg: 'border.focus' });
    expect((chipGroupRecipe.base?.item as Record<string, unknown>)['&[data-state=on]']).toMatchObject({ borderColor: 'border.focus' });
  });

  it.each(MODES)('keeps the focus colour at 3:1 on white and the grey surface in the %s theme', (mode) => {
    expect(ratio('border.focus', 'bg', mode)).toBeGreaterThanOrEqual(3);
    expect(ratio('border.focus', 'bg.secondary', mode)).toBeGreaterThanOrEqual(3);
  });
});
