import { describe, expect, it } from 'vitest';
import { isDark } from './color';

describe('isDark', () => {
  it('splits colours where black and white text read equally well', () => {
    expect(isDark('#000000')).toBe(true);
    expect(isDark('#222222')).toBe(true);
    expect(isDark('#7c3aed')).toBe(true);
    expect(isDark('#ffffff')).toBe(false);
    expect(isDark('#e6e6e6')).toBe(false);
    expect(isDark('#0d99ff')).toBe(false);
    expect(isDark('#ffeb3b')).toBe(false);
  });

  it('treats anything that is not a #rrggbb colour as light', () => {
    expect(isDark('red')).toBe(false);
    expect(isDark('#00000080')).toBe(false);
  });
});
