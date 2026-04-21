/**
 * AudioControl — Panel de control de audio binaural para el tanque.
 * Permite ajustar volumen, frecuencia base y offset binaural.
 * Muestra el tipo de onda cerebral objetivo.
 */

import { useCallback } from 'react';
import { useAudioStore } from '../store/audio-store';

const BINAURAL_PRESETS = [
  { label: 'Delta', offset: 2, desc: 'Sueño profundo', color: 'text-info' },
  { label: 'Theta', offset: 6, desc: 'Meditación', color: 'text-accent' },
  { label: 'Alpha', offset: 10, desc: 'Relajación', color: 'text-success' },
  { label: 'Beta', offset: 20, desc: 'Alerta', color: 'text-warning' },
] as const;

export default function AudioControl() {
  const playing = useAudioStore((s) => s.playing);
  const volume = useAudioStore((s) => s.volume);
  const baseFreq = useAudioStore((s) => s.baseFreq);
  const binauralOffset = useAudioStore((s) => s.binauralOffset);
  const beatLabel = useAudioStore((s) => s.beatLabel);
  const play = useAudioStore((s) => s.play);
  const stop = useAudioStore((s) => s.stop);
  const setVolume = useAudioStore((s) => s.setVolume);
  const setFrequencies = useAudioStore((s) => s.setFrequencies);

  const handleToggle = useCallback(() => {
    if (playing) stop(); else play();
  }, [playing, play, stop]);

  const handleVolume = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setVolume(Number(e.target.value)),
    [setVolume],
  );

  const handleBaseFreq = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setFrequencies(Number(e.target.value), binauralOffset),
    [setFrequencies, binauralOffset],
  );

  const handleOffset = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setFrequencies(baseFreq, Number(e.target.value)),
    [setFrequencies, baseFreq],
  );

  return (
    <div data-testid="audio-control" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🎧</span>
          <h2 className="text-sm font-bold text-text-primary tracking-wide uppercase">Audio Binaural</h2>
        </div>
        <button
          data-testid="audio-toggle"
          onClick={handleToggle}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
            playing
              ? 'bg-danger/15 text-danger hover:bg-danger/25'
              : 'bg-success/15 text-success hover:bg-success/25'
          }`}
        >
          {playing ? '■ Detener' : '▶ Reproducir'}
        </button>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${playing ? 'bg-success animate-pulse' : 'bg-border'}`} />
        <span className="text-xs text-text-muted">
          {playing ? beatLabel : 'Audio detenido'}
        </span>
      </div>

      {/* Binaural presets */}
      <div className="grid grid-cols-4 gap-1.5">
        {BINAURAL_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setFrequencies(baseFreq, p.offset)}
            className={`px-2 py-1.5 rounded-lg text-center transition-colors ${
              Math.abs(binauralOffset - p.offset) < 2
                ? 'bg-accent text-surface'
                : 'bg-surface text-text-muted border border-border hover:border-accent/40'
            }`}
          >
            <div className="text-[10px] font-bold">{p.label}</div>
            <div className="text-[8px] opacity-70">{p.offset} Hz</div>
          </button>
        ))}
      </div>

      {/* Volume slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Volumen</span>
          <span className="text-[10px] text-text-muted tabular-nums">{Math.round(volume * 100)}%</span>
        </div>
        <input
          data-testid="audio-volume"
          type="range" min={0} max={1} step={0.01}
          value={volume}
          onChange={handleVolume}
          className="w-full accent-accent h-1.5"
          aria-label="Volumen de audio"
        />
      </div>

      {/* Base frequency */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Frecuencia Base</span>
          <span className="text-[10px] text-text-muted tabular-nums">{baseFreq} Hz</span>
        </div>
        <input
          data-testid="audio-base-freq"
          type="range" min={50} max={500} step={5}
          value={baseFreq}
          onChange={handleBaseFreq}
          className="w-full accent-accent h-1.5"
          aria-label="Frecuencia base"
        />
      </div>

      {/* Binaural offset */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Beat Binaural</span>
          <span className="text-[10px] text-text-muted tabular-nums">{binauralOffset.toFixed(1)} Hz</span>
        </div>
        <input
          data-testid="audio-offset"
          type="range" min={0.5} max={40} step={0.5}
          value={binauralOffset}
          onChange={handleOffset}
          className="w-full accent-accent h-1.5"
          aria-label="Offset binaural"
        />
      </div>

      {/* Frequency info */}
      <div className="bg-surface rounded-lg border border-border px-3 py-2 text-[10px] text-text-muted space-y-0.5">
        <div>Oído izq: <span className="text-text-secondary">{baseFreq} Hz</span></div>
        <div>Oído der: <span className="text-text-secondary">{(baseFreq + binauralOffset).toFixed(1)} Hz</span></div>
        <div>Beat percibido: <span className="text-accent font-medium">{binauralOffset.toFixed(1)} Hz → {beatLabel}</span></div>
      </div>
    </div>
  );
}
