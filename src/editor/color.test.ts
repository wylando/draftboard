import { describe, expect, it } from 'vitest';
import { isDark } from './color';

describe('isDark', () => {
  // The split sits where black and white text read equally well; anything that is not #rrggbb counts as light.
  it.each([
    ['#000000', true],
    ['#222222', true],
    ['#7c3aed', true],
    ['#ffffff', false],
    ['#e6e6e6', false],
    ['#0d99ff', false],
    ['#ffeb3b', false],
    ['red', false],
    ['#00000080', false],
  ])('isDark(%s) is %s', (color, dark) => {
    expect(isDark(color)).toBe(dark);
  });
});
