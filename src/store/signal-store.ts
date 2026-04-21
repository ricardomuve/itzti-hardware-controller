/**
 * Store de señales analógicas con Zustand.
 * Requisitos: 5.1, 5.2, 5.3
 */

import { create } from 'zustand';

export type SignalUnit = '°C' | 'V' | 'A' | 'Pa' | 'dB' | '%' | 'rpm' | 'bpm' | 'µV' | 'µS' | 'SpO2';

export interface SignalSample {
  timestamp: number;
  value: number;
}

export interface SignalChannel {
  id: string;
  name: string;
  unit: SignalUnit;
  sampleRateHz: number;
  thresholdMin?: number;
  thresholdMax?: number;
  samples: SignalSample[];
}

export interface SignalMetrics {
  min: number;
  max: number;
  avg: number;
}

/** Maximum number of samples per channel (circular buffer limit) */
export const MAX_SAMPLES_PER_CHANNEL = 10_000;

export interface SignalStoreState {
  channels: SignalChannel[];

  addChannel: (channel: SignalChannel) => void;
  removeChannel: (id: string) => void;
  pushSample: (channelId: string, sample: SignalSample) => void;
  setThresholds: (channelId: string, min?: number, max?: number) => void;
  setSampleRate: (channelId: string, rate: number) => void;
}

export const useSignalStore = create<SignalStoreState>((set) => ({
  channels: [],

  addChannel: (channel) =>
    set((state) => {
      if (state.channels.some((c) => c.id === channel.id)) {
        return state;
      }
      return { channels: [...state.channels, channel] };
    }),

  removeChannel: (id) =>
    set((state) => ({
      channels: state.channels.filter((c) => c.id !== id),
    })),

  pushSample: (channelId, sample) =>
    set((state) => ({
      channels: state.channels.map((c) => {
        if (c.id !== channelId) return c;
        const updated = [...c.samples, sample];
        // Circular buffer: drop oldest samples when exceeding limit
        const trimmed =
          updated.length > MAX_SAMPLES_PER_CHANNEL
            ? updated.slice(updated.length - MAX_SAMPLES_PER_CHANNEL)
            : updated;
        return { ...c, samples: trimmed };
      }),
    })),

  setThresholds: (channelId, min, max) =>
    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId
          ? { ...c, thresholdMin: min, thresholdMax: max }
          : c
      ),
    })),

  setSampleRate: (channelId, rate) =>
    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId ? { ...c, sampleRateHz: rate } : c
      ),
    })),
}));
