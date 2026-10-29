import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindingFromEvent, formatBinding, formatBindingText, isValidBinding } from './keys';

const press = (code: string, key: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  code,
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('bindingFromEvent', () => {
  it('builds the canonical string from the physical key, in Mod, Alt, Shift order', () => {
    expect(bindingFromEvent(press('KeyZ', 'z', { metaKey: true, shiftKey: true }))).toBe('Mod+Shift+Z');
    expect(bindingFromEvent(press('KeyZ', 'Z', { ctrlKey: true, altKey: true, shiftKey: true }))).toBe('Mod+Alt+Shift+Z');
  });

  // Shift and Alt rewrite `key` (Shift+0 gives ")", Alt+] gives a curly quote), so the code must win.
  it('ignores what Shift and Alt did to the key character', () => {
    expect(bindingFromEvent(press('Digit0', ')', { shiftKey: true }))).toBe('Shift+0');
    expect(bindingFromEvent(press('KeyZ', '\u03a9', { altKey: true }))).toBe('Alt+Z');
    expect(bindingFromEvent(press('BracketRight', '\u2018', { metaKey: true, altKey: true }))).toBe('Mod+Alt+]');
  });

  it('falls back to key when there is no code, and gives nothing for a bare modifier', () => {
    expect(bindingFromEvent(press('', 'v'))).toBe('V');
    expect(bindingFromEvent(press('', ' '))).toBe('Space');
    expect(bindingFromEvent(press('', 'Backspace'))).toBe('Backspace');
    expect(bindingFromEvent(press('ShiftLeft', 'Shift', { shiftKey: true }))).toBeNull();
  });
});

describe('isValidBinding', () => {
  it('accepts canonical strings and rejects misordered modifiers or unknown keys', () => {
    expect(isValidBinding('Mod+Shift+Z')).toBe(true);
    expect(isValidBinding('Shift+Mod+Z')).toBe(false);
    expect(isValidBinding('Mod+Mod+Z')).toBe(false);
    expect(isValidBinding('Mod+z')).toBe(false);
    expect(isValidBinding('Mod+')).toBe(false);
    expect(isValidBinding('')).toBe(false);
    expect(isValidBinding(42)).toBe(false);
  });
});

describe('formatBinding', () => {
  afterEach(() => vi.unstubAllGlobals());

  // The platform comes from the global `navigator`, which the module doesn't let us inject.
  it.each([
    ['MacIntel', ['\u2318', '\u21e7', 'Z'], '\u2318\u21e7Z'],
    ['Win32', ['Ctrl', 'Shift', 'Z'], 'Ctrl+Shift+Z'],
  ])('on %s', (platform, parts, text) => {
    vi.stubGlobal('navigator', { platform });
    expect(formatBinding('Mod+Shift+Z')).toEqual(parts);
    expect(formatBindingText('Mod+Shift+Z')).toBe(text);
  });

  it('labels named keys', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    expect(formatBinding('Mod+Backspace')).toEqual(['Ctrl', '\u232b']);
    expect(formatBinding('Alt+ArrowLeft')).toEqual(['Alt', '\u2190']);
  });
});
