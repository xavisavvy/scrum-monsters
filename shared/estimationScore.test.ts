import { describe, it, expect } from 'vitest';
import { isValidEstimationScore, ESTIMATION_SCALES } from './gameEvents';

describe('isValidEstimationScore (Security: M-1)', () => {
  it('accepts the abstain sentinel regardless of scale', () => {
    expect(isValidEstimationScore('?')).toBe(true);
    expect(isValidEstimationScore('?', { scaleType: 'doubling' })).toBe(true);
    expect(isValidEstimationScore('?', { scaleType: 'tshirt' })).toBe(true);
  });

  it('accepts every value of each built-in scale deck', () => {
    for (const n of ESTIMATION_SCALES.fibonacci.options) {
      expect(isValidEstimationScore(n)).toBe(true);
    }
    for (const n of ESTIMATION_SCALES.doubling.options) {
      expect(isValidEstimationScore(n, { scaleType: 'doubling' })).toBe(true);
    }
    // T-shirt votes arrive as point-mapped numbers, not the size labels.
    for (const pts of Object.values(ESTIMATION_SCALES.tshirt.pointMapping!)) {
      expect(isValidEstimationScore(pts, { scaleType: 'tshirt' })).toBe(true);
    }
  });

  it('accepts a host-customized T-shirt point value', () => {
    const settings = { scaleType: 'tshirt' as const, customTshirtMapping: { XS: 2, S: 4, M: 7, L: 11, XL: 20 } };
    expect(isValidEstimationScore(20, settings)).toBe(true);
    expect(isValidEstimationScore(7, settings)).toBe(true);
  });

  it('rejects arbitrary / out-of-range / malformed values that corrupt consensus', () => {
    for (const bad of [9999999, -100, 0, 7, 1.5, NaN, Infinity, -Infinity]) {
      expect(isValidEstimationScore(bad)).toBe(false);
    }
  });

  it('rejects non-numeric, non-"?" payloads', () => {
    for (const bad of ['XS', 'abc', '', null, undefined, {}, [], true, () => 1]) {
      expect(isValidEstimationScore(bad)).toBe(false);
    }
  });
});
