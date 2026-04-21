// Feature: user-roles, Property 5: Visibilidad de componentes según rol

/**
 * Property 5: Role-based component visibility
 *
 * For each role ('expert', 'user'), verify that the visibility of each
 * component matches the permissions table from the design document.
 *
 * Expert visible: Dashboard, BusPanel, LogPanel, KnobControl, SliderControl,
 *   PresetEditor, ThresholdControls, SignalDashboard, AlertPanel, LoginLogoutButton
 * Expert NOT visible: PresetSelector, SessionControls, ReadOnlyCharts
 *
 * User visible: PresetSelector, ReadOnlyCharts, SessionControls,
 *   SignalDashboard, AlertPanel, LoginLogoutButton
 * User NOT visible: Dashboard, BusPanel, LogPanel, KnobControl, SliderControl,
 *   PresetEditor, ThresholdControls
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4**
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock modules that trigger browser-only side effects (uPlot needs matchMedia)
vi.mock('../components/Dashboard', () => ({ default: () => null }));
vi.mock('../components/BusPanel', () => ({ default: () => null }));
vi.mock('../components/LogPanel', () => ({ default: () => null, type: {} }));
vi.mock('../components/AlertPanel', () => ({ default: () => null, type: {} }));
vi.mock('../components/SignalDashboard', () => ({ default: () => null }));

import { getVisibleComponents } from '../components/AuthGate';
import type { UserRole } from '../store/auth-store';

/** Components that should be visible ONLY for the expert role */
const EXPERT_ONLY: ReadonlySet<string> = new Set([
  'Dashboard',
  'BusPanel',
  'LogPanel',
  'KnobControl',
  'SliderControl',
  'PresetEditor',
  'ThresholdControls',
  'OutputControls',
  'BiometricPanel',
  'SessionControl',
  'AudioControl',
  'BiometricWaveform',
]);

/** Components that should be visible ONLY for the user role */
const USER_ONLY: ReadonlySet<string> = new Set([
  'PresetSelector',
  'ReadOnlyCharts',
  'SessionControls',
]);

/** Components visible for both roles */
const SHARED: ReadonlySet<string> = new Set([
  'SignalDashboard',
  'AlertPanel',
  'LoginLogoutButton',
]);

/** Expected visible components per role */
const EXPECTED_VISIBLE: Record<UserRole, ReadonlySet<string>> = {
  expert: new Set([...EXPERT_ONLY, ...SHARED]),
  user: new Set([...USER_ONLY, ...SHARED]),
};

/** Expected hidden components per role */
const EXPECTED_HIDDEN: Record<UserRole, ReadonlySet<string>> = {
  expert: USER_ONLY,
  user: EXPERT_ONLY,
};

/** Arbitrary that generates a valid UserRole */
const roleArb: fc.Arbitrary<UserRole> = fc.constantFrom('expert' as UserRole, 'user' as UserRole);

describe('Property 5: Visibilidad de componentes según rol', () => {
  it('visible components for any role match the permissions table', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const visible = getVisibleComponents(role);
        const expected = EXPECTED_VISIBLE[role];

        // Every expected component must be visible
        for (const comp of expected) {
          expect(visible.has(comp)).toBe(true);
        }

        // Every visible component must be in the expected set
        for (const comp of visible) {
          expect(expected.has(comp)).toBe(true);
        }

        // Sets must have the same size (no extras, no missing)
        expect(visible.size).toBe(expected.size);
      }),
      { numRuns: 100 },
    );
  });

  it('hidden components for any role are NOT in the visible set', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const visible = getVisibleComponents(role);
        const hidden = EXPECTED_HIDDEN[role];

        for (const comp of hidden) {
          expect(visible.has(comp)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
