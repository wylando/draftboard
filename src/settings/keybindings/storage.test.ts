import { describe, expect, it } from 'vitest';
import { COMMANDS } from './commands';
import { parseOverrides, resolveBindings } from './storage';

describe('parseOverrides', () => {
  it('keeps an empty list as a deliberate unbound and drops unknown commands and invalid bindings', () => {
    const raw = JSON.stringify({ 'tool.rect': [], 'tool.frame': ['Mod+Shift+F', 'bogus', 'Mod+Shift+F'], 'no.such': ['A'], 'tool.select': 'V' });
    expect(parseOverrides(raw)).toEqual({ 'tool.rect': [], 'tool.frame': ['Mod+Shift+F'] });
  });

  it.each([null, '', '{not json', '[]', '"x"', 'null'])('falls back to no overrides for %j', (raw) => {
    expect(parseOverrides(raw)).toEqual({});
  });
});

describe('resolveBindings', () => {
  it('uses defaults unless overridden, and an empty override unbinds', () => {
    const resolved = resolveBindings({ 'tool.rect': [], 'tool.frame': ['Mod+Shift+F'] });
    expect(resolved['tool.rect']).toEqual([]);
    expect(resolved['tool.frame']).toEqual(['Mod+Shift+F']);
    expect(resolved['tool.select']).toEqual(COMMANDS['tool.select'].defaults);
  });
});
