/**
 * Store de audio progresivo con Zustand.
 * Controla tonos binaurales y paisaje sonoro del tanque.
 * En modo web/dev usa Web Audio API como fallback.
 */

import { create } from 'zustand';

export interface AudioStoreState {
  playing: boolean;
  volume: number;       // 0–1
  baseFreq: number;     // Hz
  binauralOffset: number; // Hz
  /** Descriptive label for current binaural range */
  beatLabel: string;

  play: () => Promise<void>;
  stop: () => Promise<void>;
  setVolume: (v: number) => Promise<void>;
  setFrequencies: (baseFreq: number, offset: number) => Promise<void>;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

function getBeatLabel(offset: number): string {
  if (offset <= 4) return 'Delta (sueño profundo)';
  if (offset <= 8) return 'Theta (meditación)';
  if (offset <= 13) return 'Alpha (relajación)';
  if (offset <= 30) return 'Beta (alerta)';
  return 'Gamma (concentración)';
}

// --- Web Audio API fallback for dev mode ---
let webAudioCtx: AudioContext | null = null;
let oscLeft: OscillatorNode | null = null;
let oscRight: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let merger: ChannelMergerNode | null = null;

function initWebAudio(baseFreq: number, offset: number, volume: number) {
  if (webAudioCtx) return;
  webAudioCtx = new AudioContext();
  gainNode = webAudioCtx.createGain();
  gainNode.gain.value = volume;
  merger = webAudioCtx.createChannelMerger(2);

  oscLeft = webAudioCtx.createOscillator();
  oscLeft.type = 'sine';
  oscLeft.frequency.value = baseFreq;

  oscRight = webAudioCtx.createOscillator();
  oscRight.type = 'sine';
  oscRight.frequency.value = baseFreq + offset;

  oscLeft.connect(merger, 0, 0);
  oscRight.connect(merger, 0, 1);
  merger.connect(gainNode);
  gainNode.connect(webAudioCtx.destination);

  oscLeft.start();
  oscRight.start();
}

function stopWebAudio() {
  oscLeft?.stop();
  oscRight?.stop();
  webAudioCtx?.close();
  webAudioCtx = null;
  oscLeft = null;
  oscRight = null;
  gainNode = null;
  merger = null;
}

export const useAudioStore = create<AudioStoreState>((set, get) => ({
  playing: false,
  volume: 0.5,
  baseFreq: 200,
  binauralOffset: 4,
  beatLabel: getBeatLabel(4),

  play: async () => {
    const { baseFreq, binauralOffset, volume } = get();
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('audio_play');
    } else {
      initWebAudio(baseFreq, binauralOffset, volume);
    }
    set({ playing: true });
  },

  stop: async () => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('audio_stop');
    } else {
      stopWebAudio();
    }
    set({ playing: false });
  },

  setVolume: async (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('audio_set_volume', { volume: clamped });
    } else if (gainNode) {
      gainNode.gain.setTargetAtTime(clamped, webAudioCtx!.currentTime, 0.1);
    }
    set({ volume: clamped });
  },

  setFrequencies: async (baseFreq: number, offset: number) => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('audio_set_frequencies', { baseFreq, binauralOffset: offset });
    } else {
      if (oscLeft) oscLeft.frequency.setTargetAtTime(baseFreq, webAudioCtx!.currentTime, 0.1);
      if (oscRight) oscRight.frequency.setTargetAtTime(baseFreq + offset, webAudioCtx!.currentTime, 0.1);
    }
    set({ baseFreq, binauralOffset: offset, beatLabel: getBeatLabel(offset) });
  },
}));
