import { describe, expect, it } from 'vitest';
import { isDark } from './color';

describe('isDark', () => {
  it('wants white ink on the default violet highlight and black on a yellow one', () => {
    expect(isDark('#7c3aed')).toBe(true);
    expect(isDark('#ffeb3b')).toBe(false);
  });
  it('treats anything that is not #rrggbb as light', () => {
    expect(isDark('red')).toBe(false);
  });
});
