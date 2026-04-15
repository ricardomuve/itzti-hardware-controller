// Feature: user-roles, Property 8: Ida y vuelta de serialización de presets

/**
 * Property 8: Preset serialization round-trip
 *
 * For any valid SessionPreset object, serializing with serializePresets
 * and then deserializing with deserializePresets must produce an object
 * deeply equivalent to the original.
 *
 * Validates: Requirements 7.5, 7.6, 7.7
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { serializePresets, deserializePresets } from '../utils/preset-serializer';
import type { SessionPreset, PresetChannel, PresetActuator } from '../store/preset-types';
import type { SignalUnit } from '../store/signal-store';

const signalUnits: SignalUnit[] = ['°C', 'V', 'A', 'Pa', 'dB'];

const signalUnitArb: fc.Arbitrary<SignalUnit> = fc.constantFrom(...signalUnits);

const presetChannelArb: fc.Arbitrary<PresetChannel> = fc.record({
  channelId: fc.string({ minLength: 1, maxLength: 30 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  unit: signalUnitArb,
  sampleRateHz: fc.double({ min: 0.1, max: 10000, noNaN: true, noDefaultInfinity: true }),
  thresholdMin: fc.option(fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }), { nil: undefined }),
  thresholdMax: fc.option(fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }), { nil: undefined }),
});

const presetActuatorArb: fc.Arbitrary<PresetActuator> = fc.record({
  deviceId: fc.string({ minLength: 1, maxLength: 30 }),
  paramName: fc.string({ minLength: 1, maxLength: 30 }),
  value: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
});

const sessionPresetArb: fc.Arbitrary<SessionPreset> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  channels: fc.array(presetChannelArb, { minLength: 1, maxLength: 10 }),
  actuators: fc.array(presetActuatorArb, { minLength: 0, maxLength: 10 }),
});

describe('Property 8: Ida y vuelta de serialización de presets', () => {
  it('deserializePresets(serializePresets(presets)) produces deeply equivalent objects for any valid SessionPreset list', () => {
    fc.assert(
      fc.property(
        fc.array(sessionPresetArb, { minLength: 0, maxLength: 5 }),
        (presets) => {
          const serialized = serializePresets(presets);
          const deserialized = deserializePresets(serialized);

          expect(deserialized).toEqual(presets);
        },
      ),
      { numRuns: 100 },
    );
  });
});
