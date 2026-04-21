/**
 * BiometricPanel — Panel de monitoreo biométrico para tanque de privación sensorial.
 * Muestra EEG bands, pulso, temperatura, GSR, SpO2, score de relajación
 * y sugerencias del motor de lazo cerrado.
 *
 * Solo visible para rol 'expert'.
 */

import { useMemo } from 'react';
import { useBiometricStore } from '../store/biometric-store';
import { useSignalStore } from '../store/signal-store';

/** Gets the latest value from a signal channel */
function useLatestValue(channelId: string): number | null {
  const channels = useSignalStore((s) => s.channels);
  const ch = channels.find((c) => c.id === channelId);
  if (!ch || ch.samples.length === 0) return null;
  return ch.samples[ch.samples.length - 1].value;
}

/** Relaxation gauge arc */
function RelaxationGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const angle = (clamped / 100) * 180;
  const rad = (angle - 90) * (Math.PI / 180);
  const x = 50 + 38 * Math.cos(rad);
  const y = 50 + 38 * Math.sin(rad);

  // Color gradient: red(0) → yellow(50) → green(100)
  const hue = (clamped / 100) * 120; // 0=red, 120=green

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="70" viewBox="0 0 100 60">
        {/* Background arc */}
        <path
          d="M 12 50 A 38 38 0 0 1 88 50"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-border/40"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={`M 12 50 A 38 38 0 ${angle > 90 ? 1 : 0} 1 ${x} ${y}`}
          fill="none"
          stroke={`hsl(${hue}, 80%, 55%)`}
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Needle dot */}
        <circle cx={x} cy={y} r="3" fill={`hsl(${hue}, 80%, 55%)`} />
      </svg>
      <span className="text-2xl font-bold tabular-nums" style={{ color: `hsl(${hue}, 80%, 55%)` }}>
        {clamped}
      </span>
      <span className="text-[10px] text-text-muted uppercase tracking-widest">Relajación</span>
    </div>
  );
}

/** Single vital sign card */
function VitalCard({
  label, value, unit, icon, color, min, max,
}: {
  label: string; value: number | null; unit: string;
  icon: string; color: string; min?: number; max?: number;
}) {
  const inRange = value !== null && min !== undefined && max !== undefined
    ? value >= min && value <= max
    : true;

  return (
    <div className={`bg-surface rounded-lg border px-3 py-2 transition-colors ${
      !inRange ? 'border-danger/50 bg-danger/5' : 'border-border'
    }`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-[10px] text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-lg font-bold tabular-nums ${color}`}>
          {value !== null ? value.toFixed(1) : '—'}
        </span>
        <span className="text-[10px] text-text-muted">{unit}</span>
      </div>
      {!inRange && (
        <div className="text-[9px] text-danger mt-0.5 animate-pulse">⚠ Fuera de rango</div>
      )}
    </div>
  );
}

/** EEG band bar visualization */
function EegBandBar({ label, value, maxValue, color }: {
  label: string; value: number; maxValue: number; color: string;
}) {
  const pct = Math.min((value / maxValue) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-text-muted w-8 text-right font-mono">{label}</span>
      <div className="flex-1 h-2.5 bg-border/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[9px] text-text-muted w-10 font-mono tabular-nums">{value.toFixed(1)}</span>
    </div>
  );
}

export default function BiometricPanel() {
  const relaxationScore = useBiometricStore((s) => s.relaxationScore);
  const eegBands = useBiometricStore((s) => s.latestEegBands);
  const violations = useBiometricStore((s) => s.violations);
  const suggestions = useBiometricStore((s) => s.suggestions);

  const pulse = useLatestValue('bio-pulse');
  const bodyTemp = useLatestValue('bio-temp');
  const gsr = useLatestValue('bio-gsr');
  const spo2 = useLatestValue('bio-spo2');
  const eegAlpha = useLatestValue('bio-eeg-alpha');

  const recentSuggestions = useMemo(
    () => suggestions.slice(-5).reverse(),
    [suggestions],
  );

  return (
    <div data-testid="biometric-panel" className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
        <h2 className="text-sm font-bold text-text-primary tracking-wide uppercase">
          Monitor Biométrico
        </h2>
        {violations.length > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-danger/20 text-danger animate-pulse">
            {violations.length} alerta{violations.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Relaxation gauge + EEG bands */}
        <div className="bg-[#0c1220] rounded-xl border border-border/60 p-4 space-y-4">
          <RelaxationGauge score={relaxationScore} />

          {eegBands && (
            <div className="space-y-1.5">
              <span className="text-[10px] text-text-muted uppercase tracking-widest">Ondas EEG</span>
              <EegBandBar label="δ" value={eegBands.delta} maxValue={40} color="bg-info" />
              <EegBandBar label="θ" value={eegBands.theta} maxValue={40} color="bg-accent" />
              <EegBandBar label="α" value={eegBands.alpha} maxValue={50} color="bg-success" />
              <EegBandBar label="β" value={eegBands.beta} maxValue={30} color="bg-warning" />
              <EegBandBar label="γ" value={eegBands.gamma} maxValue={20} color="bg-danger" />
            </div>
          )}
        </div>

        {/* Center: Vital signs grid */}
        <div className="grid grid-cols-2 gap-2 content-start">
          <VitalCard label="Pulso" value={pulse} unit="bpm" icon="💓" color="text-danger" min={50} max={100} />
          <VitalCard label="SpO2" value={spo2} unit="%" icon="🫁" color="text-info" min={94} max={100} />
          <VitalCard label="Temp" value={bodyTemp} unit="°C" icon="🌡" color="text-warning" min={35.5} max={37.5} />
          <VitalCard label="GSR" value={gsr} unit="µS" icon="⚡" color="text-accent" min={0.5} max={15} />
          <VitalCard label="EEG α" value={eegAlpha} unit="µV" icon="🧠" color="text-success" min={5} max={50} />
          <div className="bg-surface rounded-lg border border-border px-3 py-2">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Estado</div>
            <div className={`text-sm font-bold ${
              relaxationScore > 60 ? 'text-success' : relaxationScore > 30 ? 'text-warning' : 'text-text-secondary'
            }`}>
              {relaxationScore > 70 ? 'Relajación Profunda' :
               relaxationScore > 50 ? 'Relajación Moderada' :
               relaxationScore > 30 ? 'Transición' : 'Activación'}
            </div>
          </div>
        </div>

        {/* Right: Suggestions feed */}
        <div className="bg-[#0c1220] rounded-xl border border-border/60 p-4 space-y-2">
          <span className="text-[10px] text-text-muted uppercase tracking-widest">Sugerencias IA</span>
          {recentSuggestions.length === 0 && (
            <p className="text-text-muted text-xs">Sin sugerencias activas.</p>
          )}
          {recentSuggestions.map((s, i) => (
            <div
              key={`${s.timestamp}-${i}`}
              className={`text-xs px-2 py-1.5 rounded border-l-2 ${
                s.severity === 'critical'
                  ? 'bg-danger/10 border-danger text-danger'
                  : s.severity === 'warning'
                    ? 'bg-warning/10 border-warning text-warning'
                    : 'bg-info/10 border-info text-info'
              }`}
            >
              {s.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
