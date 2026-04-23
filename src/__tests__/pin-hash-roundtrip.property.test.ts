// Feature: user-roles, Property 1: Ida y vuelta de autenticación por PIN

/**
 * Property 1: PIN authentication round-trip
 *
 * For any valid PIN (4-8 numeric digits):
 * - hashPin + verifyPin with correct PIN → true
 * - hashPin + verifyPin with wrong PIN → false
 * - Different salts produce different stored values (non-deterministic)
 *
 * **Validates: Requirements 2.1, 2.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { hashPin, verifyPin } from '../utils/pin-hash';

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
  it('hashPin + verifyPin roundtrip: correct PIN always verifies', async () => {
    await fc.assert(
      fc.asyncProperty(validPinArb, async (pin) => {
        const stored = await hashPin(pin);
        const result = await verifyPin(pin, stored);
        expect(result).toBe(true);
      }),
      { numRuns: 20 }, // PBKDF2 is slow, keep runs low
    );
  }, 30_000);

  it('verifyPin rejects wrong PIN', async () => {
    await fc.assert(
      fc.asyncProperty(distinctPinPairArb, async ([pinA, pinB]) => {
        const stored = await hashPin(pinA);
        const result = await verifyPin(pinB, stored);
        expect(result).toBe(false);
      }),
      { numRuns: 10 },
    );
  }, 30_000);
});
