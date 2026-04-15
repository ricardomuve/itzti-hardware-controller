/**
 * Feature: tauri-hardware-controller, Property 8: Round-trip de persistencia de layout del dashboard
 *
 * For any valid DashboardLayout (with widgets, positions, and configs),
 * saving the layout to localStorage and then loading it must produce
 * an equivalent object to the original.
 *
 * **Validates: Requirements 7.3**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { saveLayout, loadLayout } from '../components/Dashboard';
import type { DashboardLayout } from '../store/dashboard-types';

const widgetTypeArb = fc.constantFrom('chart' as const, 'knob' as const, 'slider' as const, 'metric' as const, 'status' as const);

const positionArb = fc.record({
  x: fc.integer({ min: 0, max: 100 }),
  y: fc.integer({ min: 0, max: 100 }),
  w: fc.integer({ min: 1, max: 50 }),
  h: fc.integer({ min: 1, max: 50 }),
});

const configArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
  fc.oneof(
    fc.string({ maxLength: 20 }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
    fc.boolean(),
    fc.constant(null),
  ),
);

const widgetArb = (id: string) =>
  fc.record({
    id: fc.constant(id),
    type: widgetTypeArb,
    position: positionArb,
    config: configArb,
  });

const layoutArb: fc.Arbitrary<DashboardLayout> = fc
  .integer({ min: 0, max: 10 })
  .chain((count) => {
    const ids = Array.from({ length: count }, (_, i) => `widget-${i}`);
    if (ids.length === 0) return fc.constant({ widgets: [] });
    return fc.tuple(...ids.map((id) => widgetArb(id))).map((widgets) => ({ widgets }));
  });

describe('Property 8: Round-trip de persistencia de layout del dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadLayout() after saveLayout(layout) produces an equivalent object', () => {
    fc.assert(
      fc.property(layoutArb, (layout) => {
        localStorage.clear();
        const saved = saveLayout(layout);
        expect(saved).toBe(true);

        const loaded = loadLayout();
        expect(loaded).not.toBeNull();
        expect(loaded).toEqual(layout);
      }),
      { numRuns: 100 },
    );
  });
});
