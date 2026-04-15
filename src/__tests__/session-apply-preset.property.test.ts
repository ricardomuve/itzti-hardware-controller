// Feature: user-roles, Property 9: Iniciar sesión aplica configuración del preset

/**
 * Property 9: Starting a session applies preset configuration
 *
 * For any valid preset with channels and actuators, invoking `startSession(presetId)`
 * must result in signal-store channels reflecting the preset's sample rates and thresholds,
 * and device-store parameters reflecting the actuator values.
 *
 * **Validates: Requirement 8.2**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Spies for signal-store and device-store
const addChannelSpy = vi.fn();
const setSampleRateSpy = vi.fn();
const setThresholdsSpy = vi.fn();
const updateDeviceParamSpy = vi.fn();

// Mock Tauri fs plugin
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn().mockResolvedValue(undefined),
  BaseDirectory: { AppData: 'AppData' },
}));

// Mock signal-store
vi.mock('../store/signal-store', () => ({
  useSignalStore: Object.assign(() => ({}), {
    getState: () => ({
      channels: [],
      addChannel: addChannelSpy,
      setSampleRate: setSampleRateSpy,
      setThresholds: setThresholdsSpy,
    }),
  }),
}));

// Mock device-store
vi.mock('../store/device-store', () => ({
  useDeviceStore: Object.assign(() => ({}), {
    getState: () => ({
      devices: [],
      updateDeviceParam: updateDeviceParamSpy,
    }),
  }),
}));

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: () => `uuid-${Math.random().toString(36).slice(2, 10)}`,
});

import { usePresetStore } from '../store/preset-store';
import type { SessionPreset, PresetChannel, PresetActuator } from '../store/preset-types';
import type { SignalUnit } from '../store/signal-store';

/** Arbitrary: valid signal unit */
const unitArb: fc.Arbitrary<SignalUnit> = fc.constantFrom(
  '°C' as const,
  'V' as const,
  'A' as const,
  'Pa' as const,
  'dB' as const,
);

/** Arbitrary: valid preset channel */
const channelArb: fc.Arbitrary<PresetChannel> = fc.record({
  channelId: fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0),
  name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  unit: unitArb,
  sampleRateHz: fc.double({ min: 0.1, max: 10000, noNaN: true, noDefaultInfinity: true }),
  thresholdMin: fc.option(fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }), { nil: undefined }),
  thresholdMax: fc.option(fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }), { nil: undefined }),
});

/** Arbitrary: valid preset actuator */
const actuatorArb: fc.Arbitrary<PresetActuator> = fc.record({
  deviceId: fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0),
  paramName: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  value: fc.double({ min: -10000, max: 10000, noNaN: true, noDefaultInfinity: true }),
});

/** Arbitrary: valid SessionPreset with at least one channel */
const presetArb: fc.Arbitrary<SessionPreset> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0),
  name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  channels: fc.array(channelArb, { minLength: 1, maxLength: 5 }),
  actuators: fc.array(actuatorArb, { minLength: 0, maxLength: 5 }),
});

describe('Property 9: Iniciar sesión aplica configuración del preset', () => {
  beforeEach(() => {
    usePresetStore.setState({
      presets: [],
      activePresetId: null,
      sessionActive: false,
      loading: false,
      error: null,
    });
    addChannelSpy.mockClear();
    setSampleRateSpy.mockClear();
    setThresholdsSpy.mockClear();
    updateDeviceParamSpy.mockClear();
  });

  it('startSession applies all channel configs to signal-store and actuator configs to device-store', () => {
    fc.assert(
      fc.property(presetArb, (preset) => {
        // Seed the store with the preset
        usePresetStore.setState({ presets: [preset], error: null });

        // Clear spies before each run
        addChannelSpy.mockClear();
        setSampleRateSpy.mockClear();
        setThresholdsSpy.mockClear();
        updateDeviceParamSpy.mockClear();

        // Invoke startSession
        usePresetStore.getState().startSession(preset.id);

        // Verify session is active
        expect(usePresetStore.getState().sessionActive).toBe(true);
        expect(usePresetStore.getState().activePresetId).toBe(preset.id);

        // Verify addChannel was called for each channel
        expect(addChannelSpy).toHaveBeenCalledTimes(preset.channels.length);
        for (const ch of preset.channels) {
          expect(addChannelSpy).toHaveBeenCalledWith({
            id: ch.channelId,
            name: ch.name,
            unit: ch.unit,
            sampleRateHz: ch.sampleRateHz,
            thresholdMin: ch.thresholdMin,
            thresholdMax: ch.thresholdMax,
            samples: [],
          });
        }

        // Verify setSampleRate was called for each channel
        expect(setSampleRateSpy).toHaveBeenCalledTimes(preset.channels.length);
        for (const ch of preset.channels) {
          expect(setSampleRateSpy).toHaveBeenCalledWith(ch.channelId, ch.sampleRateHz);
        }

        // Verify setThresholds was called for each channel
        expect(setThresholdsSpy).toHaveBeenCalledTimes(preset.channels.length);
        for (const ch of preset.channels) {
          expect(setThresholdsSpy).toHaveBeenCalledWith(ch.channelId, ch.thresholdMin, ch.thresholdMax);
        }

        // Verify updateDeviceParam was called for each actuator
        expect(updateDeviceParamSpy).toHaveBeenCalledTimes(preset.actuators.length);
        for (const act of preset.actuators) {
          expect(updateDeviceParamSpy).toHaveBeenCalledWith(act.deviceId, act.paramName, act.value);
        }
      }),
      { numRuns: 100 },
    );
  });
});
