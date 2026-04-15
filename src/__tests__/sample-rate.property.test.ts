/**
 * Feature: tauri-hardware-controller, Property 4: Validación de frecuencia de muestreo
 *
 * Validates: Requirements 5.2
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateSampleRate } from '../utils/validation';

describe('Property 4: Validación de frecuencia de muestreo', () => {
  it('validateSampleRate returns true if and only if 1 <= rate <= 10000', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 }),
        (rate) => {
          const result = validateSampleRate(rate);
          const expected = rate >= 1 && rate <= 10000;

          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});
