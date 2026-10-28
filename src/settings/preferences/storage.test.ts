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

  // The old default was close to the selection blue, so a stored copy of it moves to the distinct default.
  it('moves the retired default #80caff to the current default', () => {
    expect(DEFAULT_PREFERENCES.relationHighlight).not.toBe('#80caff');
    for (const old of ['#80caff', '#80CAFF']) {
      expect(parsePreferences(JSON.stringify({ relationHighlight: old })).relationHighlight).toBe(DEFAULT_PREFERENCES.relationHighlight);
    }
  });
});
