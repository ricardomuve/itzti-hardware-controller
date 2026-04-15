// Feature: user-roles, Property 4: Logout siempre restablece a rol usuario

/**
 * Property 4: Logout always resets to user role
 *
 * For any state of the auth store where the role is 'expert', invoking
 * `logout()` must result in the role being 'user'. We generate random
 * sequences of login/logout actions and verify that after each `logout()`
 * the role is always 'user'.
 *
 * **Validates: Requirements 3.1, 3.3**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock Tauri fs plugin before importing the store
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  BaseDirectory: { AppData: 'AppData' },
}));

// Mock pin-hash so we can control authentication without crypto or filesystem
const STORED_HASH = 'mocked-hash-value';

vi.mock('../utils/pin-hash', () => ({
  hashPin: vi.fn(async (pin: string) => (pin === 'VALID' ? STORED_HASH : `hash-of-${pin}`)),
  validatePinFormat: vi.fn(() => true),
  readPinHash: vi.fn(async () => STORED_HASH),
  writePinHash: vi.fn(async () => undefined),
}));

import { useAuthStore } from '../store/auth-store';

/** Action type for the property test: either login (with valid or invalid PIN) or logout. */
type AuthAction = { type: 'login'; valid: boolean } | { type: 'logout' };

/** Arbitrary that generates a single auth action. */
const authActionArb: fc.Arbitrary<AuthAction> = fc.oneof(
  fc.constant<AuthAction>({ type: 'login', valid: true }),
  fc.constant<AuthAction>({ type: 'login', valid: false }),
  fc.constant<AuthAction>({ type: 'logout' }),
);

/** Arbitrary that generates sequences of auth actions (1-20 actions, always ending with logout). */
const actionSequenceWithLogoutArb = fc
  .array(authActionArb, { minLength: 0, maxLength: 19 })
  .map((actions) => [...actions, { type: 'logout' as const, valid: false }] as AuthAction[]);

describe('Property 4: Logout siempre restablece a rol usuario', () => {
  beforeEach(() => {
    // Reset the store to initial state before each test run
    useAuthStore.setState({ role: 'user', pinHashExists: false });
    vi.clearAllMocks();
  });

  it('after every logout() call, the role is always "user" regardless of prior state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(authActionArb, { minLength: 1, maxLength: 20 }),
        async (actions) => {
          // Reset store state for each property iteration
          useAuthStore.setState({ role: 'user', pinHashExists: false });

          for (const action of actions) {
            if (action.type === 'login') {
              const pin = action.valid ? 'VALID' : 'INVALID';
              await useAuthStore.getState().login(pin);
            } else {
              useAuthStore.getState().logout();
              // After every logout, role MUST be 'user'
              expect(useAuthStore.getState().role).toBe('user');
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('logout resets to "user" even after multiple consecutive successful logins', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (loginCount) => {
          useAuthStore.setState({ role: 'user', pinHashExists: false });

          // Perform N successful logins
          for (let i = 0; i < loginCount; i++) {
            await useAuthStore.getState().login('VALID');
            expect(useAuthStore.getState().role).toBe('expert');
          }

          // Single logout must reset to 'user'
          useAuthStore.getState().logout();
          expect(useAuthStore.getState().role).toBe('user');
        },
      ),
      { numRuns: 100 },
    );
  });
});
