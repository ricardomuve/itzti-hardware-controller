// Feature: user-roles, Property 2: Validación de formato de PIN

/**
 * Property 2: PIN format validation
 *
 * For any string, `validatePinFormat` returns `true` if and only if the string
 * consists exclusively of digits 0-9 and has length between 4 and 8 inclusive.
 *
 * **Validates: Requirements 2.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validatePinFormat } from '../utils/pin-hash';

/**
 * Reference implementation: a PIN is valid iff it is 4-8 characters long
 * and every character is a digit (0-9).
 */
function isValidPin(s: string): boolean {
  if (s.length < 4 || s.length > 8) return false;
  for (const ch of s) {
    if (ch < '0' || ch > '9') return false;
  }
  return true;
}

/** Arbitrary that generates valid PINs: 4-8 digit strings. */
const validPinArb = fc
  .integer({ min: 4, max: 8 })
  .chain((len) =>
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: len,
      maxLength: len,
    }),
  );

/** Arbitrary that generates arbitrary strings including digits, letters, symbols, and varied lengths. */
const arbitraryStringArb = fc.oneof(
  fc.string(),
  fc.asciiString(),
  fc.unicodeString(),
  fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', '!', ' ')),
);

describe('Property 2: Validación de formato de PIN', () => {
  it('validatePinFormat returns true for all valid PINs (4-8 digits only)', () => {
    fc.assert(
      fc.property(validPinArb, (pin) => {
        expect(validatePinFormat(pin)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('validatePinFormat returns true iff the string is 4-8 digits (arbitrary strings)', () => {
    fc.assert(
      fc.property(arbitraryStringArb, (s) => {
        const expected = isValidPin(s);
        expect(validatePinFormat(s)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});
