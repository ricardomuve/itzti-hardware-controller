// Feature: user-roles, Property 1: Ida y vuelta de autenticación por PIN

/**
 * Property 1: PIN authentication round-trip
 *
 * For any valid PIN (4-8 numeric digits), hashing with `hashPin` must be
 * deterministic (same PIN → same hash) and collision-resistant (different
 * PINs → different hashes).
 *
 * **Validates: Requirements 2.1, 2.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { hashPin } from '../utils/pin-hash';

/** Arbitrary that generates valid PINs: strings of 4-8 numeric digits. */
const validPinArb = fc
  .integer({ min: 4, max: 8 })
  .chain((len) =>
    fc.stringOf(
      fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
      { minLength: len, maxLength: len },
    ),
  );

/** Arbitrary that generates a pair of distinct valid PINs. */
const distinctPinPairArb = fc
  .tuple(validPinArb, validPinArb)
  .filter(([a, b]) => a !== b);

describe('Property 1: Ida y vuelta de autenticación por PIN', () => {
  it('hashPin is deterministic: same PIN always produces the same hash', async () => {
    await fc.assert(
      fc.asyncProperty(validPinArb, async (pin) => {
        const hash1 = await hashPin(pin);
        const hash2 = await hashPin(pin);
        expect(hash1).toBe(hash2);
      }),
      { numRuns: 100 },
    );
  });

  it('hashPin produces different hashes for different PINs', async () => {
    await fc.assert(
      fc.asyncProperty(distinctPinPairArb, async ([pinA, pinB]) => {
        const hashA = await hashPin(pinA);
        const hashB = await hashPin(pinB);
        expect(hashA).not.toBe(hashB);
      }),
      { numRuns: 100 },
    );
  });
});
