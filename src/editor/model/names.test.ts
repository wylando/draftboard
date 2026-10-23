import { describe, expect, it } from 'vitest';
import { nameKey, uniqueName } from './names';

describe('uniqueName', () => {
  it('keeps the desired name when it is free', () => {
    expect(uniqueName('Header', new Set())).toBe('Header');
  });

  it('appends 2 to a taken name, ignoring case', () => {
    expect(uniqueName('Header', new Set([nameKey('header')]))).toBe('Header 2');
  });

  it('raises a trailing number to the first free variant', () => {
    const taken = new Set(['rectangle 1', 'rectangle 2', 'rectangle 4']);
    expect(uniqueName('Rectangle 1', taken)).toBe('Rectangle 3');
  });
});
