import { describe, expect, it } from 'vitest';
import { COMPACT_MIN_ZOOM, FULL_MIN_ZOOM, detailLevel, overviewScale } from './tableDetail';

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
    for (const z of [0.02, 0.1, 0.25, 0.33, 0.49]) {
      expect(Math.abs(overviewScale(z) / z - 1)).toBeLessThan(0.06);
    }
  });

  it('is the same for zooms that round to one step, so a wheel tick rarely re-renders tables', () => {
    expect(overviewScale(0.3)).toBe(overviewScale(0.301));
  });
});
