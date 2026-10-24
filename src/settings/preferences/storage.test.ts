import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, parsePreferences } from './storage';

describe('parsePreferences: relation highlight', () => {
  it('defaults when nothing is saved, or for documents saved before the setting existed', () => {
    expect(parsePreferences(null).relationHighlight).toBe(DEFAULT_PREFERENCES.relationHighlight);
    expect(parsePreferences(JSON.stringify({ gridStyle: 'lines' })).relationHighlight).toBe(DEFAULT_PREFERENCES.relationHighlight);
  });

  it('keeps a saved #rrggbb colour, lower-cased', () => {
    expect(parsePreferences(JSON.stringify({ relationHighlight: '#FF00AA' })).relationHighlight).toBe('#ff00aa');
  });

  // It ends up in an SVG stroke attribute, so anything but a plain colour is dropped.
  it('falls back to the default for anything else', () => {
    for (const bad of ['red', '#fff', 'url(#x)', 'ff00aa', 12, null]) {
      expect(parsePreferences(JSON.stringify({ relationHighlight: bad })).relationHighlight).toBe(DEFAULT_PREFERENCES.relationHighlight);
    }
  });
});
