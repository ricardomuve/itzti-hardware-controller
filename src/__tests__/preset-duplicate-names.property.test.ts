// Feature: user-roles, Property 7: No se permiten presets con nombres duplicados

/**
 * Property 7: No duplicate preset names allowed
 *
 * For any list of existing presets and a new preset whose name matches an
 * existing one, `createPreset` must reject the creation and the list of
 * presets must remain unchanged.
 *
 * **Validates: Requirements 6.4**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

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
      addChannel: vi.fn(),
      setSampleRate: vi.fn(),
      setThresholds: vi.fn(),
    }),
  }),
}));

// Mock device-store
vi.mock('../store/device-store', () => ({
  useDeviceStore: Object.assign(() => ({}), {
    getState: () => ({
      devices: [],
      updateDeviceParam: vi.fn(),
    }),
  }),
}));

// Mock crypto.randomUUID
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

import { usePresetStore } from '../store/preset-store';
import type { SessionPreset } from '../store/preset-types';

/**
 * Arbitrary: generates a valid preset name (non-empty, trimmed).
 */
const presetNameArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim());

/**
 * Arbitrary: generates a valid channel array (at least one channel).
 */
const channelsArb = fc.array(
  fc.record({
    channelId: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    unit: fc.constantFrom('°C' as const, 'V' as const, 'A' as const, 'Pa' as const, 'dB' as const),
    sampleRateHz: fc.double({ min: 0.1, max: 10000, noNaN: true, noDefaultInfinity: true }),
  }),
  { minLength: 1, maxLength: 3 },
);

/**
 * Arbitrary: generates a valid SessionPreset with a given name.
 */
function presetWithNameArb(name: string): fc.Arbitrary<SessionPreset> {
  return fc.tuple(channelsArb).map(([channels]) => ({
    id: `existing-${Math.random().toString(36).slice(2, 10)}`,
    name,
    channels,
    actuators: [],
  }));
}

/**
 * Arbitrary: generates a list of existing presets with unique names,
 * plus returns one of those names to use as the duplicate.
 */
const existingPresetsWithDuplicateNameArb = fc
  .uniqueArray(presetNameArb, { minLength: 1, maxLength: 5, comparator: (a, b) => a === b })
  .chain((names) => {
    const presetsArb = fc.tuple(
      ...names.map((name) => presetWithNameArb(name)),
    );
    const pickedNameArb = fc.constantFrom(...names);
    return fc.tuple(presetsArb, pickedNameArb);
  });

describe('Property 7: No se permiten presets con nombres duplicados', () => {
  beforeEach(() => {
    uuidCounter = 0;
    usePresetStore.setState({
      presets: [],
      activePresetId: null,
      sessionActive: false,
      loading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  it('createPreset rejects a preset whose name matches an existing one and the list remains unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        existingPresetsWithDuplicateNameArb,
        channelsArb,
        async ([existingPresets, duplicateName], newChannels) => {
          // Seed the store with existing presets
          usePresetStore.setState({ presets: existingPresets, error: null });

          const presetsBefore = [...usePresetStore.getState().presets];

          // Attempt to create a preset with a duplicate name
          const result = await usePresetStore.getState().createPreset({
            name: duplicateName,
            channels: newChannels,
            actuators: [],
          });

          // Must be rejected
          expect(result).toBe(false);

          // The presets list must remain unchanged
          const presetsAfter = usePresetStore.getState().presets;
          expect(presetsAfter).toHaveLength(presetsBefore.length);
          expect(presetsAfter.map((p) => p.id)).toEqual(presetsBefore.map((p) => p.id));

          // An error message should be set
          expect(usePresetStore.getState().error).toBeTruthy();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('createPreset succeeds when the name is unique among existing presets', async () => {
    await fc.assert(
      fc.asyncProperty(
        existingPresetsWithDuplicateNameArb,
        channelsArb,
        presetNameArb,
        async ([existingPresets, _], newChannels, candidateName) => {
          // Ensure the candidate name is NOT in the existing presets
          const existingNames = new Set(existingPresets.map((p) => p.name));
          fc.pre(!existingNames.has(candidateName));

          usePresetStore.setState({ presets: existingPresets, error: null });

          const countBefore = usePresetStore.getState().presets.length;

          const result = await usePresetStore.getState().createPreset({
            name: candidateName,
            channels: newChannels,
            actuators: [],
          });

          // Must succeed
          expect(result).toBe(true);

          // The presets list must have one more entry
          expect(usePresetStore.getState().presets).toHaveLength(countBefore + 1);

          // The new preset must have the candidate name
          const newPreset = usePresetStore.getState().presets.find((p) => p.name === candidateName);
          expect(newPreset).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
