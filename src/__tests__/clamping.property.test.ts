/**
 * Feature: tauri-hardware-controller, Property 3: Clamping de valores de actuador dentro de límites
 *
 * Validates: Requirements 3.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { clampValue } from '../utils/validation';

/**
 * Arbitrary generator for a value and a valid [min, max] range.
 * Uses fc.double() for numeric values and ensures min <= max by sorting the pair.
 */
const valueAndRangeArb = fc
  .tuple(
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
  )
  .map(([value, a, b]) => ({
    value,
    min: Math.min(a, b),
    max: Math.max(a, b),
  }));

describe('Property 3: Clamping de valores de actuador dentro de límites', () => {
  it('clampValue(value, min, max) always returns a result where min <= result <= max', () => {
    fc.assert(
      fc.property(valueAndRangeArb, ({ value, min, max }) => {
        const result = clampValue(value, min, max);

        expect(result).toBeGreaterThanOrEqual(min);
        expect(result).toBeLessThanOrEqual(max);
      }),
      { numRuns: 100 },
    );
  });
});
