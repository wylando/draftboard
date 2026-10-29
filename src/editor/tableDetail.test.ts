import { describe, expect, it } from 'vitest';
import { COMPACT_MIN_ZOOM, FULL_MIN_ZOOM, compactSizes, detailLevel, ellipsize, overviewAvail, overviewLabel, overviewScale } from './tableDetail';

// Stand-in for canvas text measuring, which a node environment doesn't have.
const measure = (text: string, size: number) => text.length * size * 0.55;
const ZOOMS = [0.1, 0.2, 0.25, 0.33, 0.4, 0.49];

describe('detailLevel', () => {
  it('is full from the full threshold up', () => {
    expect(detailLevel(1)).toBe('full');
    expect(detailLevel(FULL_MIN_ZOOM)).toBe('full');
  });

  it('is compact between the thresholds, including the lower one', () => {
    expect(detailLevel(FULL_MIN_ZOOM - 0.01)).toBe('compact');
    expect(detailLevel(COMPACT_MIN_ZOOM)).toBe('compact');
  });

  it('is overview below the compact threshold', () => {
    expect(detailLevel(COMPACT_MIN_ZOOM - 0.01)).toBe('overview');
    expect(detailLevel(0.05)).toBe('overview');
  });
});

describe('overviewScale', () => {
  it('stays within about 5% of the real zoom', () => {
    for (const z of [0.02, 0.1, 0.25, 0.33, 0.49, 0.7]) {
      expect(Math.abs(overviewScale(z) / z - 1)).toBeLessThan(0.06);
    }
  });

  it('is the same for zooms that round to one step, so a wheel tick rarely re-renders tables', () => {
    expect(overviewScale(0.3)).toBe(overviewScale(0.301));
  });
});

describe('compactSizes', () => {
  it('reads about 12 px on screen across the band, within the row height', () => {
    for (const z of [0.5, 0.6, 0.7, FULL_MIN_ZOOM - 0.01]) {
      const { column } = compactSizes(overviewScale(z));
      expect(column).toBeLessThanOrEqual(20);
      if (z >= 0.6) expect(column * z).toBeGreaterThan(11);
      expect(column * z).toBeGreaterThanOrEqual(9.5);
    }
  });
});

describe('ellipsize', () => {
  it('cuts to fit with an ellipsis, or returns the text when it fits', () => {
    expect(ellipsize('abc', 100, (t) => t.length * 10)).toBe('abc');
    expect(ellipsize('abcdefgh', 55, (t) => t.length * 10)).toBe('abcd…');
    expect(ellipsize('abcdefgh', 5, (t) => t.length * 10)).toBe('');
  });
});

describe('overviewLabel', () => {
  const label = (name: string, width = 240, scale = 0.25) => overviewLabel(name, width - 24, scale, measure);

  it('is never smaller than 10 px on screen, whatever the name or zoom', () => {
    for (const z of ZOOMS) {
      for (const name of ['users', 'order_items', 'customer_orders', 'a'.repeat(40)]) {
        expect(label(name, 240, z).size * z).toBeGreaterThanOrEqual(10 - 1e-9);
      }
    }
  });

  it('keeps 13 px on screen when the name fits', () => {
    const l = label('users');
    expect(l.lines).toEqual(['users']);
    expect(l.size * 0.25).toBeCloseTo(13);
  });

  it('shrinks a long name to fit, down to the floor', () => {
    const l = overviewLabel('order_items', 300, 0.25, measure);
    expect(l.lines).toEqual(['order_items']);
    expect(l.size * 0.25).toBeLessThan(13);
    expect(l.size * 0.25).toBeGreaterThanOrEqual(10);
  });

  it('wraps at underscores, dashes, spaces and camelCase once shrinking is not enough', () => {
    expect(label('order_items').lines).toEqual(['order_', 'items']);
    expect(label('customer_orders').lines).toEqual(['customer_', 'orders']);
    expect(label('order-line items', 200).lines).toHaveLength(2);
    expect(label('orderLineItems', 150).lines[0]).toMatch(/^order(Line)?$/);
  });

  it('ellipsizes what still does not fit on two lines', () => {
    const l = label('a_very_long_table_name_for_testing_overview_labels');
    expect(l.lines).toHaveLength(2);
    expect(l.lines.some((line) => line.endsWith('…'))).toBe(true);
    for (const line of l.lines) expect(measure(line, l.size)).toBeLessThanOrEqual(216);
  });

  it('ellipsizes a 40-character name with no break points', () => {
    const l = label('a'.repeat(40));
    expect(l.lines.length).toBeLessThanOrEqual(2);
    expect(l.lines.join('').endsWith('…')).toBe(true);
    for (const line of l.lines) expect(measure(line, l.size)).toBeLessThanOrEqual(216);
  });
});

describe('overviewAvail', () => {
  it('is the card width when that is the roomier, else a screen-pixel budget', () => {
    expect(overviewAvail(2400, 0.25)).toBe(2376);
    expect(overviewAvail(120, 0.2)).toBeGreaterThan(120);
    expect(overviewAvail(120, 0.2) * 0.2).toBeGreaterThanOrEqual(100);
  });

  it('lets names on a narrow card stay readable at tiny zooms', () => {
    for (const z of [0.1, 0.2, 0.3]) {
      for (const name of ['users', 'customer_orders_archive_2024']) {
        const l = overviewLabel(name, overviewAvail(120, z), z, measure);
        const shown = l.lines.join('').replace(/…/g, '');
        expect(shown.length, `${name} at ${z}`).toBeGreaterThanOrEqual(3);
        expect(l.size * z).toBeGreaterThanOrEqual(10 - 1e-9);
      }
    }
  });

  it('shows users whole on a 120-wide card', () => {
    expect(overviewLabel('users', overviewAvail(120, 0.1), 0.1, measure).lines).toEqual(['users']);
  });
});
