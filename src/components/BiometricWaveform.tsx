/**
 * BiometricWaveform — Visualización de ondas biométricas de alta velocidad.
 * Optimizado para EEG a 256 Hz con downsampling LTTB, typed arrays,
 * y actualizaciones vía requestAnimationFrame.
 *
 * Estilo fluido inspirado en Tidal/Spotify con gradientes y transiciones suaves.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useSignalStore } from '../store/signal-store';
import { useBiometricStore } from '../store/biometric-store';
import { lttbDownsampleArrays } from '../utils/downsampling';

/** Max points to render per series (LTTB target) */
const MAX_RENDER_POINTS = 600;

/** Biometric channel definitions */
const BIO_CHANNELS = [
  { id: 'bio-eeg-alpha', label: 'EEG α', color: '#4ade80', gradient: ['rgba(74,222,128,0.3)', 'rgba(74,222,128,0)'] },
  { id: 'bio-pulse', label: 'Pulso', color: '#f87171', gradient: ['rgba(248,113,113,0.3)', 'rgba(248,113,113,0)'] },
  { id: 'bio-temp', label: 'Temp', color: '#fbbf24', gradient: ['rgba(251,191,36,0.2)', 'rgba(251,191,36,0)'] },
  { id: 'bio-gsr', label: 'GSR', color: '#38bdf8', gradient: ['rgba(56,189,248,0.3)', 'rgba(56,189,248,0)'] },
  { id: 'bio-spo2', label: 'SpO2', color: '#60a5fa', gradient: ['rgba(96,165,250,0.2)', 'rgba(96,165,250,0)'] },
] as const;

type TimeWindow = 10 | 30 | 60;

/**
 * Builds uPlot data with LTTB downsampling for each visible channel.
 * Uses a unified timestamp axis derived from the channel with most samples.
 */
function buildBioData(
  channels: ReturnType<typeof useSignalStore.getState>['channels'],
  visibleIds: Set<string>,
  windowMs: number,
  now: number,
): uPlot.AlignedData {
  const tStart = now - windowMs;
  const bioChannels = BIO_CHANNELS.filter((bc) => visibleIds.has(bc.id));

  if (bioChannels.length === 0) return [[]];

  // Collect all timestamps from visible channels within window
  const tsSet = new Set<number>();
  const channelData = new Map<string, { ts: number[]; vals: number[] }>();

  for (const bc of bioChannels) {
    const ch = channels.find((c) => c.id === bc.id);
    if (!ch) continue;

    const ts: number[] = [];
    const vals: number[] = [];
    for (const s of ch.samples) {
      if (s.timestamp >= tStart && s.timestamp <= now) {
        ts.push(s.timestamp);
        vals.push(s.value);
        tsSet.add(s.timestamp);
      }
    }

    // Downsample if needed
    if (ts.length > MAX_RENDER_POINTS) {
      const [dTs, dVals] = lttbDownsampleArrays(ts, vals, MAX_RENDER_POINTS);
      channelData.set(bc.id, { ts: dTs, vals: dVals });
      // Re-add downsampled timestamps
      for (const t of dTs) tsSet.add(t);
    } else {
      channelData.set(bc.id, { ts, vals });
    }
  }

  // Build unified sorted timestamp axis
  const allTs = Array.from(tsSet).sort((a, b) => a - b);
  const xValues = new Float64Array(allTs.length);
  for (let i = 0; i < allTs.length; i++) {
    xValues[i] = allTs[i] / 1000; // uPlot expects seconds
  }

  // Build series arrays with null-fill for missing timestamps
  const seriesArrays: (number | null)[][] = bioChannels.map((bc) => {
    const data = channelData.get(bc.id);
    if (!data) return allTs.map(() => null);

    const valueMap = new Map<number, number>();
    for (let i = 0; i < data.ts.length; i++) {
      valueMap.set(data.ts[i], data.vals[i]);
    }
    return allTs.map((t) => valueMap.get(t) ?? null);
  });

  return [Array.from(xValues), ...seriesArrays];
}

export default function BiometricWaveform() {
  const channels = useSignalStore((s) => s.channels);
  const relaxationScore = useBiometricStore((s) => s.relaxationScore);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const rafRef = useRef<number>(0);

  const [paused, setPaused] = useState(false);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(30);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(
    new Set(BIO_CHANNELS.map((c) => c.id)),
  );

  const windowMs = timeWindow * 1000;

  const toggleChannel = useCallback((id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const visibleBioChannels = useMemo(
    () => BIO_CHANNELS.filter((bc) => visibleIds.has(bc.id)),
    [visibleIds],
  );

  // Build uPlot options
  const opts = useMemo((): uPlot.Options => {
    const series: uPlot.Series[] = [
      { label: 'Time' },
      ...visibleBioChannels.map((bc) => ({
        label: bc.label,
        stroke: bc.color,
        width: 2,
        fill: bc.gradient[0],
        fillTo: () => 0,
      })),
    ];

    return {
      width: 800,
      height: 220,
      series,
      axes: [
        {
          stroke: '#475569',
          grid: { stroke: 'rgba(71,85,105,0.15)', width: 1 },
          ticks: { stroke: 'rgba(71,85,105,0.2)', width: 1 },
          font: '10px monospace',
        },
        {
          stroke: '#475569',
          grid: { stroke: 'rgba(71,85,105,0.1)', width: 1 },
          ticks: { stroke: 'rgba(71,85,105,0.2)', width: 1 },
          font: '10px monospace',
        },
      ],
      scales: { x: { time: true } },
      cursor: { drag: { x: true, y: false } },
      legend: { show: false },
      padding: [8, 8, 0, 0],
    };
  }, [visibleBioChannels]);

  // Create/recreate chart when series structure changes
  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const now = Date.now();
    const data = buildBioData(channels, visibleIds, windowMs, now);
    const chart = new uPlot(opts, data, containerRef.current);
    chartRef.current = chart;

    // Responsive resize
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0 && chartRef.current) {
          chartRef.current.setSize({ width: w, height: 220 });
        }
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts, windowMs]);

  // RAF update loop
  useEffect(() => {
    if (paused) return;
    let running = true;

    const update = () => {
      if (!running || !chartRef.current) return;
      const now = Date.now();
      const data = buildBioData(channels, visibleIds, windowMs, now);
      chartRef.current.setData(data, false);
      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [channels, visibleIds, windowMs, paused]);

  return (
    <div data-testid="biometric-waveform" className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-text-primary tracking-wide uppercase">Ondas Biométricas</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-text-muted font-mono">
            {paused ? 'PAUSA' : 'LIVE'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Time window buttons */}
          {([10, 30, 60] as TimeWindow[]).map((tw) => (
            <button
              key={tw}
              onClick={() => setTimeWindow(tw)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                timeWindow === tw
                  ? 'bg-accent text-surface'
                  : 'bg-surface text-text-muted hover:text-text-secondary'
              }`}
            >
              {tw}s
            </button>
          ))}

          <button
            onClick={() => setPaused((p) => !p)}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-surface text-text-muted hover:text-text-secondary ml-1"
          >
            {paused ? '▶' : '⏸'}
          </button>
        </div>
      </div>

      {/* Channel toggles */}
      <div className="flex gap-1.5 flex-wrap">
        {BIO_CHANNELS.map((bc) => (
          <button
            key={bc.id}
            onClick={() => toggleChannel(bc.id)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              visibleIds.has(bc.id)
                ? 'bg-surface-hover text-text-primary'
                : 'bg-surface text-text-muted opacity-50'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: visibleIds.has(bc.id) ? bc.color : '#475569' }}
            />
            {bc.label}
          </button>
        ))}
      </div>

      {/* Chart container */}
      <div className="bg-[#080e1a] rounded-xl border border-border/40 p-2 overflow-hidden">
        <div ref={containerRef} data-testid="bio-chart-container" />
      </div>

      {/* Bottom stats bar */}
      <div className="flex items-center justify-between text-[10px] text-text-muted font-mono">
        <span>
          {visibleBioChannels.length} canales · ventana {timeWindow}s · LTTB@{MAX_RENDER_POINTS}pts
        </span>
        <span>
          Relajación: <span className={`font-bold ${
            relaxationScore > 60 ? 'text-success' : relaxationScore > 30 ? 'text-warning' : 'text-text-secondary'
          }`}>{relaxationScore}%</span>
        </span>
      </div>
    </div>
  );
}
