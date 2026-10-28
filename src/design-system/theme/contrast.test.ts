import { describe, expect, it } from 'vitest';
import { contrastRatio, semanticColor } from './contrast';
import { menuRecipe } from './recipes/menu';
import { comboboxRecipe } from './recipes/combobox';
import { textStyles } from './textStyles';
import { tokens } from './tokens';

const ratio = (fg: string, bg: string) => contrastRatio(semanticColor(fg), semanticColor(bg));

describe('contrast of the chrome tokens (WCAG 2.2)', () => {
  it.each(['bg', 'bg.secondary', 'bg.selected'])('secondary text and icons reach 4.5:1 on %s', (surface) => {
    expect(ratio('text.secondary', surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio('icon.secondary', surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps disabled text distinct from secondary text', () => {
    expect(semanticColor('text.disabled')).not.toBe(semanticColor('text.secondary'));
  });

  it.each(['bg.brand', 'bg.brandHover'])('white text on %s reaches 4.5:1', (fill) => {
    expect(ratio('text.onBrand', fill)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['bg', 'bg.secondary'])('the focus ring reaches 3:1 on %s', (surface) => {
    expect(ratio('border.focus', surface)).toBeGreaterThanOrEqual(3);
  });

  it.each(['bg.toolbar', 'bg.topBar', 'bg.tabActive'])('the focus ring on dark chrome reaches 3:1 on %s', (surface) => {
    expect(ratio('border.focusOnToolbar', surface)).toBeGreaterThanOrEqual(3);
  });

  it.each(['bg', 'bg.secondary'])('a control boundary reaches 3:1 on %s', (surface) => {
    expect(ratio('border.control', surface)).toBeGreaterThanOrEqual(3);
  });

  it.each(['bg', 'bg.secondary'])('error text reaches 4.5:1 on %s', (surface) => {
    expect(ratio('text.danger', surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('menu and combobox highlight', () => {
  it('fills the highlighted item with bg.selected, which differs from the resting surface', () => {
    const highlighted = '&[data-highlighted]';
    expect(menuRecipe.base?.item?.[highlighted]).toMatchObject({ bg: 'bg.selected' });
    expect(comboboxRecipe.base?.item?.[highlighted]).toMatchObject({ bg: 'bg.selected' });
    expect(semanticColor('bg.selected')).not.toBe(semanticColor('bg'));
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
