// Feature: user-roles, Property 6: Validación de preset rechaza campos obligatorios faltantes

/**
 * Property 6: Preset validation rejects missing required fields
 *
 * For any partial preset object where at least one required field (name, channels)
 * is absent or empty, validatePreset must return { valid: false } with descriptive errors.
 *
 * Validates: Requirements 6.2
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validatePreset } from '../utils/preset-serializer';

/**
 * Generates a non-empty channels array (valid shape).
 */
const validChannelsArb = fc.array(
  fc.record({
    channelId: fc.string({ minLength: 1, maxLength: 20 }),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    unit: fc.constantFrom('°C', 'V', 'A', 'Pa', 'dB'),
    sampleRateHz: fc.double({ min: 0.1, max: 10000, noNaN: true, noDefaultInfinity: true }),
  }),
  { minLength: 1, maxLength: 5 },
);

/**
 * Generates a valid non-empty trimmed name.
 */
const validNameArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

/**
 * Strategy: We generate preset-like objects that are invalid in one of several ways,
 * then assert validatePreset always returns { valid: false } with at least one error.
 *
 * Invalid scenarios:
 * 1. name is missing entirely
 * 2. name is not a string (number, boolean, null, etc.)
 * 3. name is an empty or whitespace-only string
 * 4. channels is missing entirely
 * 5. channels is not an array
 * 6. channels is an empty array
 * 7. Both name and channels are invalid
 * 8. Input is not an object (null, array, primitive)
 */

describe('Property 6: Validación de preset rechaza campos obligatorios faltantes', () => {
  it('rejects presets with missing or invalid name field', () => {
    // Generate objects that have valid channels but name is absent, non-string, or empty
    const missingNameArb = fc.oneof(
      // name key absent
      validChannelsArb.map((channels) => ({ channels })),
      // name is a number
      fc.tuple(fc.integer(), validChannelsArb).map(([n, channels]) => ({ name: n, channels })),
      // name is null
      validChannelsArb.map((channels) => ({ name: null, channels })),
      // name is boolean
      fc.tuple(fc.boolean(), validChannelsArb).map(([b, channels]) => ({ name: b, channels })),
      // name is empty string
      validChannelsArb.map((channels) => ({ name: '', channels })),
      // name is whitespace-only
      fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 }).chain(
        (ws) => validChannelsArb.map((channels) => ({ name: ws, channels })),
      ),
    );

    fc.assert(
      fc.property(missingNameArb, (preset) => {
        const result = validatePreset(preset);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some((e) => e.toLowerCase().includes('name'))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects presets with missing or invalid channels field', () => {
    // Generate objects that have valid name but channels is absent, non-array, or empty
    const missingChannelsArb = fc.oneof(
      // channels key absent
      validNameArb.map((name) => ({ name })),
      // channels is a string
      fc.tuple(validNameArb, fc.string()).map(([name, s]) => ({ name, channels: s })),
      // channels is a number
      fc.tuple(validNameArb, fc.integer()).map(([name, n]) => ({ name, channels: n })),
      // channels is null
      validNameArb.map((name) => ({ name, channels: null })),
      // channels is an empty array
      validNameArb.map((name) => ({ name, channels: [] })),
    );

    fc.assert(
      fc.property(missingChannelsArb, (preset) => {
        const result = validatePreset(preset);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some((e) => e.toLowerCase().includes('channels'))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects presets where both name and channels are invalid', () => {
    const bothInvalidArb = fc.oneof(
      // both missing
      fc.record({ extra: fc.string() }),
      // name empty, channels empty
      fc.constant({ name: '', channels: [] }),
      // name missing, channels not array
      fc.integer().map((n) => ({ channels: n })),
      // name non-string, channels missing
      fc.integer().map((n) => ({ name: n })),
    );

    fc.assert(
      fc.property(bothInvalidArb, (preset) => {
        const result = validatePreset(preset);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects non-object inputs (null, arrays, primitives)', () => {
    const nonObjectArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.integer(),
      fc.string(),
      fc.boolean(),
      fc.array(fc.integer(), { minLength: 0, maxLength: 5 }),
    );

    fc.assert(
      fc.property(nonObjectArb, (input) => {
        const result = validatePreset(input);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
