/**
 * Feature: tauri-hardware-controller, Property 5: Detección de umbral genera alerta
 *
 * Validates: Requirements 5.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { checkThreshold } from '../utils/validation';

const finiteDouble = fc.double({ noNaN: true, noDefaultInfinity: true });

describe('Property 5: Detección de umbral genera alerta', () => {
  /**
   * **Validates: Requirements 5.5**
   * With both min and max defined, checkThreshold returns true iff value < min or value > max.
   */
  it('with both thresholds: alert iff value < min or value > max', () => {
    fc.assert(
      fc.property(
        finiteDouble,
        finiteDouble,
        finiteDouble,
        (value, a, b) => {
          const min = Math.min(a, b);
          const max = Math.max(a, b);
          const result = checkThreshold(value, min, max);
          const expected = value < min || value > max;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.5**
   * With only min defined, checkThreshold returns true iff value < min.
   */
  it('with only min threshold: alert iff value < min', () => {
    fc.assert(
      fc.property(finiteDouble, finiteDouble, (value, min) => {
        const result = checkThreshold(value, min, undefined);
        const expected = value < min;
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.5**
   * With only max defined, checkThreshold returns true iff value > max.
   */
  it('with only max threshold: alert iff value > max', () => {
    fc.assert(
      fc.property(finiteDouble, finiteDouble, (value, max) => {
        const result = checkThreshold(value, undefined, max);
        const expected = value > max;
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.5**
   * With neither threshold defined, checkThreshold never triggers an alert.
   */
  it('with no thresholds: never alerts', () => {
    fc.assert(
      fc.property(finiteDouble, (value) => {
        const result = checkThreshold(value, undefined, undefined);
        expect(result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
