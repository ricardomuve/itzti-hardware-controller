// Feature: user-roles, Property 3: Cambio de PIN requiere PIN actual correcto

/**
 * Property 3: PIN change requires correct current PIN
 *
 * For any configured PIN and any pair (current PIN attempt, new PIN),
 * `changePin` must succeed only if the current PIN attempt matches the
 * configured PIN. If it does not match, the stored PIN hash must remain
 * unchanged.
 *
 * **Validates: Requirement 2.6**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mocks — isolate from Tauri fs and real crypto
// ---------------------------------------------------------------------------

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  BaseDirectory: { AppData: 'AppData' },
}));

/**
 * We keep a mutable variable that simulates the persisted hash file.
 * `readPinHash` returns it; `writePinHash` updates it.
 * `hashPin` is a simple deterministic mapping so we can reason about equality.
 */
let storedHash: string | null = null;

vi.mock('../utils/pin-hash', () => ({
  hashPin: vi.fn(async (pin: string) => `sha256:${pin}`),
  validatePinFormat: vi.fn((pin: string) => /^\d{4,8}$/.test(pin)),
  readPinHash: vi.fn(async () => storedHash),
  writePinHash: vi.fn(async (hash: string) => {
    storedHash = hash;
  }),
}));

import { useAuthStore } from '../store/auth-store';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates valid PINs: strings of 4-8 numeric digits. */
const validPinArb = fc
  .integer({ min: 4, max: 8 })
  .chain((len) =>
    fc.stringOf(
      fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
      { minLength: len, maxLength: len },
    ),
  );

/** Generates a pair of distinct valid PINs. */
const distinctPinPairArb = fc
  .tuple(validPinArb, validPinArb)
  .filter(([a, b]) => a !== b);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 3: Cambio de PIN requiere PIN actual correcto', () => {
  beforeEach(() => {
    storedHash = null;
    useAuthStore.setState({ role: 'user', pinHashExists: false });
    vi.clearAllMocks();
  });

  it('changePin succeeds when the current PIN attempt matches the configured PIN', async () => {
    await fc.assert(
      fc.asyncProperty(
        validPinArb,
        validPinArb,
        async (configuredPin, newPin) => {
          // Setup: configure the initial PIN hash
          storedHash = `sha256:${configuredPin}`;

          const result = await useAuthStore.getState().changePin(configuredPin, newPin);

          expect(result).toBe(true);
          // The stored hash must now reflect the new PIN
          expect(storedHash).toBe(`sha256:${newPin}`);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('changePin fails and stored hash is unchanged when the current PIN attempt does not match', async () => {
    await fc.assert(
      fc.asyncProperty(
        distinctPinPairArb,
        validPinArb,
        async ([configuredPin, wrongAttempt], newPin) => {
          // Setup: configure the initial PIN hash
          storedHash = `sha256:${configuredPin}`;
          const hashBefore = storedHash;

          const result = await useAuthStore.getState().changePin(wrongAttempt, newPin);

          expect(result).toBe(false);
          // The stored hash must remain unchanged
          expect(storedHash).toBe(hashBefore);
        },
      ),
      { numRuns: 100 },
    );
  });
});
