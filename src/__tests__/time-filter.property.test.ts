/**
 * Feature: tauri-hardware-controller, Property 6: Filtrado de datos por rango temporal
 *
 * Validates: Requirements 6.2
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { filterByTimeRange } from '../utils/validation';
import type { SignalSample } from '../store/signal-store';

/**
 * Arbitrary generator for a SignalSample with a random timestamp and value.
 */
const signalSampleArb = fc
  .record({
    timestamp: fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1e12 }),
    value: fc.double({ noNaN: true, noDefaultInfinity: true }),
  });

/**
 * Arbitrary generator for an array of SignalSamples and a time range [tStart, tEnd].
 * Ensures tStart <= tEnd by sorting the pair.
 */
const samplesAndRangeArb = fc
  .tuple(
    fc.array(signalSampleArb, { minLength: 0, maxLength: 50 }),
    fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1e12 }),
    fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1e12 }),
  )
  .map(([samples, a, b]) => ({
    samples,
    tStart: Math.min(a, b),
    tEnd: Math.max(a, b),
  }));

describe('Property 6: Filtrado de datos por rango temporal', () => {
  it('all returned samples have timestamps within [tStart, tEnd]', () => {
    fc.assert(
      fc.property(samplesAndRangeArb, ({ samples, tStart, tEnd }) => {
        const result = filterByTimeRange(samples, tStart, tEnd);

        for (const sample of result) {
          expect(sample.timestamp).toBeGreaterThanOrEqual(tStart);
          expect(sample.timestamp).toBeLessThanOrEqual(tEnd);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('all input samples within [tStart, tEnd] are included in the result (completeness)', () => {
    fc.assert(
      fc.property(samplesAndRangeArb, ({ samples, tStart, tEnd }) => {
        const result = filterByTimeRange(samples, tStart, tEnd);

        const expectedInRange = samples.filter(
          (s) => s.timestamp >= tStart && s.timestamp <= tEnd,
        );

        expect(result).toHaveLength(expectedInRange.length);

        for (const expected of expectedInRange) {
          expect(result).toContainEqual(expected);
        }
      }),
      { numRuns: 100 },
    );
  });
});
