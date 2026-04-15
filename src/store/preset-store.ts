/**
 * Store de presets de sesión con Zustand.
 * Gestiona CRUD de presets, persistencia en JSON vía Tauri fs API,
 * e inicio/parada de sesiones aplicando configuración a signal-store y device-store.
 * Requisitos: 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 8.2, 8.3
 */

import { create } from 'zustand';
import { readTextFile, writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import type { SessionPreset } from './preset-types';
import { serializePresets, deserializePresets, validatePreset } from '../utils/preset-serializer';
import { useSignalStore } from './signal-store';
import { useDeviceStore } from './device-store';

const PRESETS_FILENAME = 'presets.json';

function generateUUID(): string {
  return crypto.randomUUID();
}

export interface PresetStoreState {
  presets: SessionPreset[];
  activePresetId: string | null;
  sessionActive: boolean;
  loading: boolean;
  error: string | null;

  loadPresets: () => Promise<void>;
  createPreset: (preset: Omit<SessionPreset, 'id'>) => Promise<boolean>;
  updatePreset: (id: string, updates: Partial<Omit<SessionPreset, 'id'>>) => Promise<boolean>;
  deletePreset: (id: string) => Promise<boolean>;
  startSession: (presetId: string) => void;
  stopSession: () => void;
}

/**
 * Persists the current presets list to the JSON file via Tauri fs API.
 */
async function persistPresets(presets: SessionPreset[]): Promise<void> {
  const json = serializePresets(presets);
  await writeTextFile(PRESETS_FILENAME, json, {
    baseDir: BaseDirectory.AppData,
  });
}

export const usePresetStore = create<PresetStoreState>((set, get) => ({
  presets: [],
  activePresetId: null,
  sessionActive: false,
  loading: false,
  error: null,

  /**
   * Loads presets from the JSON file via Tauri fs API.
   * If the file doesn't exist, creates an empty file.
   * If the file is corrupt, loads an empty list.
   * Requisitos: 7.2, 7.3, 7.4
   */
  loadPresets: async (): Promise<void> => {
    set({ loading: true, error: null });
    try {
      const content = await readTextFile(PRESETS_FILENAME, {
        baseDir: BaseDirectory.AppData,
      });
      const presets = deserializePresets(content);
      set({ presets, loading: false });
    } catch {
      // File doesn't exist — create empty file (Req 7.3)
      try {
        const emptyJson = serializePresets([]);
        await writeTextFile(PRESETS_FILENAME, emptyJson, {
          baseDir: BaseDirectory.AppData,
        });
      } catch (writeError) {
        console.error('preset-store: Error creating empty presets file', writeError);
      }
      set({ presets: [], loading: false });
    }
  },

  /**
   * Creates a new preset after validating fields and checking for duplicate names.
   * Generates a UUID and persists to file.
   * Requisitos: 6.2, 6.4, 7.1
   */
  createPreset: async (preset: Omit<SessionPreset, 'id'>): Promise<boolean> => {
    // Validate fields
    const validation = validatePreset(preset);
    if (!validation.valid) {
      set({ error: validation.errors.join('; ') });
      return false;
    }

    const { presets } = get();

    // Check for duplicate name (Req 6.4)
    if (presets.some((p) => p.name === preset.name)) {
      set({ error: `Ya existe un preset con el nombre "${preset.name}"` });
      return false;
    }

    const newPreset: SessionPreset = {
      ...preset,
      id: generateUUID(),
    };

    const updatedPresets = [...presets, newPreset];

    try {
      await persistPresets(updatedPresets);
      set({ presets: updatedPresets, error: null });
      return true;
    } catch (err) {
      set({ error: 'Error al guardar el preset' });
      console.error('preset-store: Error persisting new preset', err);
      return false;
    }
  },

  /**
   * Updates an existing preset by id, validates, and persists.
   * Requisitos: 6.2, 7.1
   */
  updatePreset: async (id: string, updates: Partial<Omit<SessionPreset, 'id'>>): Promise<boolean> => {
    const { presets } = get();
    const index = presets.findIndex((p) => p.id === id);
    if (index === -1) {
      set({ error: `Preset con id "${id}" no encontrado` });
      return false;
    }

    const merged = { ...presets[index], ...updates };

    // Validate the merged preset
    const validation = validatePreset(merged);
    if (!validation.valid) {
      set({ error: validation.errors.join('; ') });
      return false;
    }

    // Check duplicate name if name changed (Req 6.4)
    if (updates.name && updates.name !== presets[index].name) {
      if (presets.some((p) => p.name === updates.name && p.id !== id)) {
        set({ error: `Ya existe un preset con el nombre "${updates.name}"` });
        return false;
      }
    }

    const updatedPresets = presets.map((p) => (p.id === id ? merged : p));

    try {
      await persistPresets(updatedPresets);
      set({ presets: updatedPresets, error: null });
      return true;
    } catch (err) {
      set({ error: 'Error al actualizar el preset' });
      console.error('preset-store: Error persisting updated preset', err);
      return false;
    }
  },

  /**
   * Deletes a preset by id and persists. Confirmation is handled in the UI (Req 6.3).
   * Requisitos: 6.3, 7.1
   */
  deletePreset: async (id: string): Promise<boolean> => {
    const { presets, activePresetId } = get();
    const filtered = presets.filter((p) => p.id !== id);

    if (filtered.length === presets.length) {
      set({ error: `Preset con id "${id}" no encontrado` });
      return false;
    }

    try {
      await persistPresets(filtered);
      // If the deleted preset was active, deactivate session
      if (activePresetId === id) {
        set({ presets: filtered, activePresetId: null, sessionActive: false, error: null });
      } else {
        set({ presets: filtered, error: null });
      }
      return true;
    } catch (err) {
      set({ error: 'Error al eliminar el preset' });
      console.error('preset-store: Error persisting after delete', err);
      return false;
    }
  },

  /**
   * Starts a session by applying the preset configuration to signal-store and device-store.
   * Requisito: 8.2
   */
  startSession: (presetId: string): void => {
    const { presets } = get();
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) {
      console.warn('preset-store: Preset not found for startSession:', presetId);
      return;
    }

    const signalStore = useSignalStore.getState();
    const deviceStore = useDeviceStore.getState();

    // Apply channel configuration to signal-store
    for (const ch of preset.channels) {
      // Add channel if it doesn't exist, then configure it
      signalStore.addChannel({
        id: ch.channelId,
        name: ch.name,
        unit: ch.unit,
        sampleRateHz: ch.sampleRateHz,
        thresholdMin: ch.thresholdMin,
        thresholdMax: ch.thresholdMax,
        samples: [],
      });
      // Update sample rate and thresholds for existing channels
      signalStore.setSampleRate(ch.channelId, ch.sampleRateHz);
      signalStore.setThresholds(ch.channelId, ch.thresholdMin, ch.thresholdMax);
    }

    // Apply actuator configuration to device-store
    for (const act of preset.actuators) {
      deviceStore.updateDeviceParam(act.deviceId, act.paramName, act.value);
    }

    set({ activePresetId: presetId, sessionActive: true, error: null });
  },

  /**
   * Stops the active session, resets actuators to safe values (0).
   * Requisito: 8.3
   */
  stopSession: (): void => {
    const { activePresetId, presets } = get();
    if (!activePresetId) return;

    const preset = presets.find((p) => p.id === activePresetId);
    if (preset) {
      const deviceStore = useDeviceStore.getState();
      // Reset all actuators from the preset to safe value (0)
      for (const act of preset.actuators) {
        deviceStore.updateDeviceParam(act.deviceId, act.paramName, 0);
      }
    }

    set({ activePresetId: null, sessionActive: false });
  },
}));
