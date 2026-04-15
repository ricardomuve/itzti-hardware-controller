/**
 * OutputControls — Consola de audio / mixer para controles de salida.
 * Diseño inspirado en mesas de mezcla con faders verticales,
 * VU meters animados y controles agrupados por canal.
 *
 * Solo visible para rol 'expert'.
 * Requisitos: 4.1, 4.2, 4.3
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSignalStore } from '../store/signal-store';

export interface OutputControlsProps {
  deviceId?: string;
}

const AUDIO_SOURCES = ['LN 1', 'LN 2', 'BT', 'USB'] as const;

/* ── Tiny VU meter bar (vertical, animated) ─────────────────────── */

function VuMeter({ value, max, color = 'accent' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const segments = 12;

  return (
    <div className="flex flex-col-reverse gap-[2px] h-28 w-3" aria-hidden="true">
      {Array.from({ length: segments }, (_, i) => {
        const segPct = ((i + 1) / segments) * 100;
        const lit = segPct <= pct;
        let segColor = 'bg-success/80';
        if (segPct > 80) segColor = 'bg-danger/90';
        else if (segPct > 60) segColor = 'bg-warning/80';
        return (
          <div
            key={i}
            className={`w-full h-full rounded-[1px] transition-opacity duration-75 ${
              lit ? segColor : 'bg-border/40'
            }`}
          />
        );
      })}
    </div>
  );
}

/* ── Vertical fader ─────────────────────────────────────────────── */

interface FaderProps {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  unit?: string;
}

function Fader({ value, min, max, onChange, label, unit }: FaderProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value)),
    [onChange],
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-text-muted font-mono tabular-nums">
        {value}{unit && <span className="ml-0.5">{unit}</span>}
      </span>
      <div className="h-28 flex items-center">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={handleChange}
          aria-label={label}
          className="fader-vertical accent-accent"
        />
      </div>
      <span className="text-[10px] text-text-muted font-medium tracking-tight truncate max-w-[56px] text-center">
        {label}
      </span>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */

export default function OutputControls({ deviceId }: OutputControlsProps) {
  const [brightness, setBrightness] = useState(50);
  const [actuatorPos, setActuatorPos] = useState(0);
  const [actuatorSpeed, setActuatorSpeed] = useState(0);
  const [volume, setVolume] = useState(30);
  const [audioSource, setAudioSource] = useState(0);
  const [lightOn, setLightOn] = useState(false);

  // Simulated VU bounce for visual feedback
  const [vuBrightness, setVuBrightness] = useState(0);
  const [vuVolume, setVuVolume] = useState(0);
  const [vuSpeed, setVuSpeed] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let running = true;
    const animate = () => {
      if (!running) return;
      const jitter = () => (Math.random() - 0.5) * 8;
      setVuBrightness(Math.max(0, Math.min(100, brightness + jitter())));
      setVuVolume(Math.max(0, Math.min(100, volume + jitter())));
      setVuSpeed(Math.max(0, Math.min(1000, actuatorSpeed + jitter() * 20)));
      rafRef.current = requestAnimationFrame(() => setTimeout(() => animate(), 80));
    };
    animate();
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [brightness, volume, actuatorSpeed]);

  // Push fader values to signal store as simulated sensor readings
  const pushSample = useSignalStore((s) => s.pushSample);
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const noise = () => (Math.random() - 0.5) * 2;
      pushSample('out-brightness', {
        timestamp: now,
        value: parseFloat(Math.max(0, Math.min(100, brightness + noise())).toFixed(1)),
      });
      pushSample('out-volume', {
        timestamp: now,
        value: parseFloat(Math.max(0, Math.min(100, volume + noise())).toFixed(1)),
      });
      pushSample('out-actuator-speed', {
        timestamp: now,
        value: parseFloat(Math.max(0, Math.min(1000, actuatorSpeed + noise() * 5)).toFixed(1)),
      });
    }, 500);
    return () => clearInterval(interval);
  }, [brightness, volume, actuatorSpeed, pushSample]);

  const handleToggleLight = useCallback(() => setLightOn((p) => !p), []);
  const cycleSource = useCallback(() => setAudioSource((p) => (p + 1) % AUDIO_SOURCES.length), []);

  return (
    <div data-testid="output-controls" className="space-y-3">
      {/* Header strip */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
          <h2 className="text-sm font-bold text-text-primary tracking-wide uppercase">Mixer de Salida</h2>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-text-muted font-mono">
          <span className={`px-1.5 py-0.5 rounded ${deviceId ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
            {deviceId ? 'ONLINE' : 'PREVIEW'}
          </span>
        </div>
      </div>

      {/* Console body */}
      <div className="bg-[#0c1220] rounded-xl border border-border/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">

        {/* Channel strip row */}
        <div className="flex gap-1 overflow-x-auto pb-2">

          {/* ── CH 1: Brightness ── */}
          <ChannelStrip label="BRILLO" index={1} soloColor="warning">
            <div className="flex items-end gap-1.5 justify-center">
              <VuMeter value={vuBrightness} max={100} />
              <Fader value={brightness} min={0} max={100} onChange={setBrightness} label="Brillo" unit="%" />
              <VuMeter value={vuBrightness} max={100} />
            </div>
          </ChannelStrip>

          {/* ── CH 2: Volume ── */}
          <ChannelStrip label="VOL" index={2} soloColor="accent">
            <div className="flex items-end gap-1.5 justify-center">
              <VuMeter value={vuVolume} max={100} color="accent" />
              <Fader value={volume} min={0} max={100} onChange={setVolume} label="Volumen" unit="%" />
              <VuMeter value={vuVolume} max={100} color="accent" />
            </div>
          </ChannelStrip>

          {/* ── CH 3: Actuator Speed ── */}
          <ChannelStrip label="VEL" index={3} soloColor="success">
            <div className="flex items-end gap-1.5 justify-center">
              <VuMeter value={vuSpeed} max={1000} />
              <Fader value={actuatorSpeed} min={0} max={1000} onChange={setActuatorSpeed} label="Velocidad" unit="rpm" />
              <VuMeter value={vuSpeed} max={1000} />
            </div>
          </ChannelStrip>

          {/* ── CH 4: Actuator Position ── */}
          <ChannelStrip label="POS" index={4} soloColor="info">
            <div className="flex items-end gap-1.5 justify-center">
              <VuMeter value={actuatorPos} max={4095} />
              <Fader value={actuatorPos} min={0} max={4095} onChange={setActuatorPos} label="Posición" unit="st" />
              <VuMeter value={actuatorPos} max={4095} />
            </div>
          </ChannelStrip>

          {/* ── CH 5: Audio Source ── */}
          <ChannelStrip label="SRC" index={5} soloColor="accent">
            <div className="flex flex-col items-center gap-1.5 h-28 justify-center">
              {AUDIO_SOURCES.map((src, idx) => (
                <button
                  key={src}
                  data-testid={`audio-source-${idx}`}
                  onClick={() => setAudioSource(idx)}
                  className={`w-full px-1 py-0.5 rounded text-[9px] font-bold tracking-wider transition-all ${
                    audioSource === idx
                      ? 'bg-accent text-surface shadow-[0_0_6px_rgba(56,189,248,0.4)]'
                      : 'bg-surface/40 text-text-muted hover:bg-surface/60'
                  }`}
                >
                  {src}
                </button>
              ))}
            </div>
          </ChannelStrip>

          {/* ── CH 6: Light ── */}
          <ChannelStrip label="LUZ" index={6} soloColor="warning">
            <div className="flex flex-col items-center gap-2 h-28 justify-center">
              {/* Big toggle button */}
              <button
                data-testid="light-toggle"
                onClick={handleToggleLight}
                role="switch"
                aria-checked={lightOn}
                aria-label="Toggle luz"
                className={`w-10 h-10 rounded-full border-2 transition-all duration-200 flex items-center justify-center ${
                  lightOn
                    ? 'bg-warning/20 border-warning shadow-[0_0_12px_rgba(251,191,36,0.5)] text-warning'
                    : 'bg-surface/40 border-border text-text-muted hover:border-text-muted'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 1a5 5 0 00-2 9.58V12a1 1 0 001 1h2a1 1 0 001-1v-1.42A5 5 0 008 1z"
                    fill={lightOn ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <line x1="6" y1="14.5" x2="10" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <span data-testid="light-status" className={`text-[10px] font-bold tracking-wider ${lightOn ? 'text-warning' : 'text-text-muted'}`}>
                {lightOn ? 'ON' : 'OFF'}
              </span>
            </div>
          </ChannelStrip>
        </div>

        {/* Master strip / bottom bar */}
        <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-text-muted font-mono uppercase tracking-widest">Master</span>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${lightOn ? 'bg-warning' : 'bg-border'}`} />
              <div className={`w-1.5 h-1.5 rounded-full ${volume > 0 ? 'bg-success' : 'bg-border'}`} />
              <div className={`w-1.5 h-1.5 rounded-full ${brightness > 0 ? 'bg-accent' : 'bg-border'}`} />
              <div className={`w-1.5 h-1.5 rounded-full ${actuatorSpeed > 0 ? 'bg-info' : 'bg-border'}`} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={cycleSource}
              className="px-2 py-0.5 rounded text-[10px] font-mono text-accent bg-accent/10 hover:bg-accent/20 transition-colors"
            >
              SRC: {AUDIO_SOURCES[audioSource]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Channel strip wrapper ──────────────────────────────────────── */

interface ChannelStripProps {
  label: string;
  index: number;
  soloColor: string;
  children: React.ReactNode;
}

function ChannelStrip({ label, index, soloColor, children }: ChannelStripProps) {
  const [muted, setMuted] = useState(false);
  const [solo, setSolo] = useState(false);

  return (
    <div
      data-testid={`channel-${index}`}
      className={`flex flex-col items-center gap-2 px-3 py-3 rounded-lg border transition-colors min-w-[80px] ${
        muted
          ? 'bg-surface/20 border-danger/30 opacity-50'
          : 'bg-surface/40 border-border/40 hover:border-border'
      }`}
    >
      {/* Channel number */}
      <span className="text-[9px] font-mono text-text-muted tracking-widest">{`CH${index}`}</span>

      {/* Controls area */}
      <div className={muted ? 'pointer-events-none' : ''}>{children}</div>

      {/* Mute / Solo buttons */}
      <div className="flex gap-1 mt-1">
        <button
          onClick={() => setMuted((p) => !p)}
          className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${
            muted ? 'bg-danger text-surface' : 'bg-surface/60 text-text-muted hover:text-danger'
          }`}
          aria-label={`Mute ${label}`}
        >
          M
        </button>
        <button
          onClick={() => setSolo((p) => !p)}
          className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${
            solo ? `bg-${soloColor} text-surface` : 'bg-surface/60 text-text-muted hover:text-accent'
          }`}
          aria-label={`Solo ${label}`}
        >
          S
        </button>
      </div>

      {/* Label */}
      <span className="text-[10px] font-bold text-text-secondary tracking-wider uppercase">{label}</span>
    </div>
  );
}
