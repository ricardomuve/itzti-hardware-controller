/**
 * Feature: user-roles, Property 10: Alertas de umbral coinciden con umbrales del preset
 *
 * Validates: Requirement 8.5
 *
 * For any channel with thresholds defined in the active preset and any signal value,
 * an alert should be generated if and only if the value exceeds the minimum or maximum
 * threshold of the preset.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { PresetChannel } from '../store/preset-types';
import type { SignalUnit } from '../store/signal-store';
import { checkThreshold } from '../utils/validation';

const finiteDouble = fc.double({ noNaN: true, noDefaultInfinity: true });

const signalUnitArb: fc.Arbitrary<SignalUnit> = fc.constantFrom('°C', 'V', 'A', 'Pa', 'dB');

/** Generator for a PresetChannel with both thresholds defined (min <= max). */
const presetChannelWithBothThresholds: fc.Arbitrary<PresetChannel> = fc.record({
  channelId: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  unit: signalUnitArb,
  sampleRateHz: fc.integer({ min: 1, max: 10000 }),
  thresholdMin: finiteDouble,
  thresholdMax: finiteDouble,
}).map((ch) => {
  const min = Math.min(ch.thresholdMin!, ch.thresholdMax!);
  const max = Math.max(ch.thresholdMin!, ch.thresholdMax!);
  return { ...ch, thresholdMin: min, thresholdMax: max };
});

/** Generator for a PresetChannel with only thresholdMin defined. */
const presetChannelWithMinOnly: fc.Arbitrary<PresetChannel> = fc.record({
  channelId: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  unit: signalUnitArb,
  sampleRateHz: fc.integer({ min: 1, max: 10000 }),
  thresholdMin: finiteDouble,
});

/** Generator for a PresetChannel with only thresholdMax defined. */
const presetChannelWithMaxOnly: fc.Arbitrary<PresetChannel> = fc.record({
  channelId: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  unit: signalUnitArb,
  sampleRateHz: fc.integer({ min: 1, max: 10000 }),
  thresholdMax: finiteDouble,
});

/** Generator for a PresetChannel with no thresholds defined. */
const presetChannelNoThresholds: fc.Arbitrary<PresetChannel> = fc.record({
  channelId: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  unit: signalUnitArb,
  sampleRateHz: fc.integer({ min: 1, max: 10000 }),
});

describe('Property 10: Alertas de umbral coinciden con umbrales del preset', () => {
  /**
   * **Validates: Requirement 8.5**
   * With both min and max thresholds from a preset channel, an alert fires
   * iff the signal value is below thresholdMin or above thresholdMax.
   */
  it('alert fires iff value < preset thresholdMin or value > preset thresholdMax (both defined)', () => {
    fc.assert(
      fc.property(
        presetChannelWithBothThresholds,
        finiteDouble,
        (channel, signalValue) => {
          const shouldAlert = signalValue < channel.thresholdMin! || signalValue > channel.thresholdMax!;
          const result = checkThreshold(signalValue, channel.thresholdMin, channel.thresholdMax);
          expect(result).toBe(shouldAlert);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirement 8.5**
   * With only thresholdMin from a preset channel, an alert fires iff value < thresholdMin.
   */
  it('alert fires iff value < preset thresholdMin (only min defined)', () => {
    fc.assert(
      fc.property(
        presetChannelWithMinOnly,
        finiteDouble,
        (channel, signalValue) => {
          const shouldAlert = signalValue < channel.thresholdMin!;
          const result = checkThreshold(signalValue, channel.thresholdMin, undefined);
          expect(result).toBe(shouldAlert);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirement 8.5**
   * With only thresholdMax from a preset channel, an alert fires iff value > thresholdMax.
   */
  it('alert fires iff value > preset thresholdMax (only max defined)', () => {
    fc.assert(
      fc.property(
        presetChannelWithMaxOnly,
        finiteDouble,
        (channel, signalValue) => {
          const shouldAlert = signalValue > channel.thresholdMax!;
          const result = checkThreshold(signalValue, undefined, channel.thresholdMax);
          expect(result).toBe(shouldAlert);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirement 8.5**
   * With no thresholds defined in the preset channel, no alert should ever fire.
   */
  it('no alert when preset channel has no thresholds defined', () => {
    fc.assert(
      fc.property(
        presetChannelNoThresholds,
        finiteDouble,
        (channel, signalValue) => {
          const result = checkThreshold(signalValue, channel.thresholdMin, channel.thresholdMax);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
