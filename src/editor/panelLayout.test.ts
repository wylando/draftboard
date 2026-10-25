import { describe, expect, it } from 'vitest';
import { clampPanelWidth, DEFAULT_PANEL_LAYOUT, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH, parsePanelLayout } from './panelLayout';

describe('clampPanelWidth', () => {
  it("rounds to whole pixels and stays within each panel's limits", () => {
    expect(clampPanelWidth('layers', 300.6)).toBe(301);
    expect(clampPanelWidth('layers', 170)).toBe(170);
    expect(clampPanelWidth('properties', 170)).toBe(PANEL_MIN_WIDTH.properties);
    expect(clampPanelWidth('layers', 0)).toBe(PANEL_MIN_WIDTH.layers);
    expect(clampPanelWidth('properties', PANEL_MAX_WIDTH + 50)).toBe(PANEL_MAX_WIDTH);
  });
});

describe('parsePanelLayout', () => {
  it('uses the defaults when nothing usable is saved', () => {
    for (const raw of [null, '', 'not json', '[]', '7', 'null']) {
      expect(parsePanelLayout(raw)).toEqual(DEFAULT_PANEL_LAYOUT);
    }
  });

  it('keeps a valid layout, ignoring unknown keys', () => {
    const layout = { layers: { width: 320, collapsed: true }, properties: { width: 260, collapsed: false } };
    expect(parsePanelLayout(JSON.stringify({ ...layout, extra: 1 }))).toEqual(layout);
  });

  it('falls back per panel and per field', () => {
    const raw = JSON.stringify({ layers: { width: 300, collapsed: 'yes' }, properties: 'wide' });
    expect(parsePanelLayout(raw)).toEqual({
      layers: { width: 300, collapsed: false },
      properties: DEFAULT_PANEL_LAYOUT.properties,
    });
  });

  it('clamps saved widths and rejects non-numbers', () => {
    const raw = JSON.stringify({ layers: { width: 5000 }, properties: { width: 12.4 } });
    expect(parsePanelLayout(raw)).toEqual({
      layers: { width: PANEL_MAX_WIDTH, collapsed: false },
      properties: { width: PANEL_MIN_WIDTH.properties, collapsed: false },
    });
    for (const bad of ['300', null, true]) {
      expect(parsePanelLayout(JSON.stringify({ layers: { width: bad } })).layers.width).toBe(DEFAULT_PANEL_LAYOUT.layers.width);
    }
  });
});
