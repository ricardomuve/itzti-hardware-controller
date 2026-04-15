/**
 * Tests unitarios del preset-store.
 * Requisitos: 7.3, 7.4, 8.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

const readTextFileMock = vi.fn();
const writeTextFileMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: (...args: unknown[]) => readTextFileMock(...args),
  writeTextFile: (...args: unknown[]) => writeTextFileMock(...args),
  BaseDirectory: { AppData: 'AppData' },
}));

const addChannelMock = vi.fn();
const setSampleRateMock = vi.fn();
const setThresholdsMock = vi.fn();

vi.mock('../store/signal-store', () => ({
  useSignalStore: Object.assign(() => ({}), {
    getState: () => ({
      channels: [],
      addChannel: addChannelMock,
      setSampleRate: setSampleRateMock,
      setThresholds: setThresholdsMock,
    }),
  }),
}));

const updateDeviceParamMock = vi.fn();

vi.mock('../store/device-store', () => ({
  useDeviceStore: Object.assign(() => ({}), {
    getState: () => ({
      devices: [],
      updateDeviceParam: updateDeviceParamMock,
    }),
  }),
}));

// Mock crypto.randomUUID
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: () => `unit-uuid-${++uuidCounter}`,
});

import { usePresetStore } from '../store/preset-store';
import type { SessionPreset } from '../store/preset-types';

describe('Preset Store — Tests unitarios', () => {
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

  /**
   * Req 7.3: Si el archivo JSON no existe al iniciar, se crea un archivo vacío.
   */
  it('loadPresets crea archivo vacío cuando presets.json no existe (Req 7.3)', async () => {
    // readTextFile throws when file doesn't exist
    readTextFileMock.mockRejectedValueOnce(new Error('File not found'));

    await usePresetStore.getState().loadPresets();

    // Should have attempted to write an empty presets file
    expect(writeTextFileMock).toHaveBeenCalledTimes(1);
    const writtenJson = writeTextFileMock.mock.calls[0][1];
    const parsed = JSON.parse(writtenJson);
    expect(parsed).toEqual({ version: 1, presets: [] });

    // Store should have empty presets and not be loading
    const state = usePresetStore.getState();
    expect(state.presets).toEqual([]);
    expect(state.loading).toBe(false);
  });

  /**
   * Req 7.4: Si el archivo JSON contiene datos corruptos, se carga lista vacía.
   */
  it('loadPresets retorna lista vacía cuando presets.json es corrupto (Req 7.4)', async () => {
    // readTextFile returns invalid JSON
    readTextFileMock.mockResolvedValueOnce('this is not valid json {{{');

    await usePresetStore.getState().loadPresets();

    // Store should have empty presets
    const state = usePresetStore.getState();
    expect(state.presets).toEqual([]);
    expect(state.loading).toBe(false);
  });

  /**
   * Req 8.3: Detener sesión restablece actuadores a valores seguros (0).
   */
  it('stopSession restablece actuadores a valor 0 (Req 8.3)', () => {
    const preset: SessionPreset = {
      id: 'preset-1',
      name: 'Test Session',
      channels: [
        {
          channelId: 'ch-1',
          name: 'Temperature',
          unit: '°C',
          sampleRateHz: 10,
          thresholdMin: 20,
          thresholdMax: 40,
        },
      ],
      actuators: [
        { deviceId: 'heater-1', paramName: 'temperature', value: 35 },
        { deviceId: 'pump-1', paramName: 'speed', value: 80 },
      ],
    };

    // Seed store with preset and active session
    usePresetStore.setState({
      presets: [preset],
      activePresetId: 'preset-1',
      sessionActive: true,
    });

    usePresetStore.getState().stopSession();

    // Each actuator should be reset to 0
    expect(updateDeviceParamMock).toHaveBeenCalledTimes(2);
    expect(updateDeviceParamMock).toHaveBeenCalledWith('heater-1', 'temperature', 0);
    expect(updateDeviceParamMock).toHaveBeenCalledWith('pump-1', 'speed', 0);

    // Session should be inactive
    const state = usePresetStore.getState();
    expect(state.activePresetId).toBeNull();
    expect(state.sessionActive).toBe(false);
  });
});
