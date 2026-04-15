/**
 * Feature: tauri-hardware-controller, Property 7: Correctitud de métricas derivadas (min, max, promedio)
 *
 * Validates: Requirements 7.4
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeMetrics } from '../utils/metrics';

/**
 * Arbitrary generator for non-empty arrays of finite doubles.
 */
const nonEmptyFiniteDoublesArb = fc.array(
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  { minLength: 1 },
);

describe('Property 7: Correctitud de métricas derivadas (min, max, promedio)', () => {
  it('min <= every value in the array', () => {
    fc.assert(
      fc.property(nonEmptyFiniteDoublesArb, (values) => {
        const { min } = computeMetrics(values);
        for (const v of values) {
          expect(min).toBeLessThanOrEqual(v);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('max >= every value in the array', () => {
    fc.assert(
      fc.property(nonEmptyFiniteDoublesArb, (values) => {
        const { max } = computeMetrics(values);
        for (const v of values) {
          expect(max).toBeGreaterThanOrEqual(v);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('avg equals sum of all values / count (within floating point tolerance)', () => {
    fc.assert(
      fc.property(nonEmptyFiniteDoublesArb, (values) => {
        const { avg } = computeMetrics(values);
        const expectedAvg = values.reduce((sum, v) => sum + v, 0) / values.length;
        expect(avg).toBeCloseTo(expectedAvg, 10);
      }),
      { numRuns: 100 },
    );
  });
});
