/**
 * Gráfico en tiempo real usando uPlot para visualización de señales analógicas.
 * Soporta múltiples series superpuestas, selección de rango temporal, y pausa/reanudación.
 * Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface ChartSignalChannel {
  id: string;
  name: string;
  unit: string;
  samples: { timestamp: number; value: number }[];
}

export type TimeRangePreset = '10s' | '30s' | '1min' | '5min' | 'custom';

export interface TimeRange {
  preset: TimeRangePreset;
  /** Duration in milliseconds for preset ranges */
  durationMs: number;
}

const TIME_RANGE_PRESETS: Record<Exclude<TimeRangePreset, 'custom'>, number> = {
  '10s': 10_000,
  '30s': 30_000,
  '1min': 60_000,
  '5min': 300_000,
};

const SERIES_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#0891b2', '#e11d48', '#65a30d', '#c026d3', '#ea580c',
];

export interface RealTimeChartProps {
  channels: ChartSignalChannel[];
  width?: number;
  height?: number;
}

/**
 * Builds uPlot-compatible AlignedData from channels, filtered by time range.
 * Returns [timestamps[], ...seriesValues[]] where timestamps are in seconds (uPlot convention).
 */
export function buildChartData(
  channels: ChartSignalChannel[],
  timeRangeMs: number,
  now: number,
): uPlot.AlignedData {
  if (channels.length === 0) {
    return [[]];
  }

  const tStart = now - timeRangeMs;

  // Collect all unique timestamps within range, sorted
  const tsSet = new Set<number>();
  for (const ch of channels) {
    for (const s of ch.samples) {
      if (s.timestamp >= tStart && s.timestamp <= now) {
        tsSet.add(s.timestamp);
      }
    }
  }

  const timestamps = Array.from(tsSet).sort((a, b) => a - b);
  // Convert ms to seconds for uPlot x-axis
  const xValues = timestamps.map((t) => t / 1000);

  // Build lookup maps per channel for fast value retrieval
  const seriesArrays: (number | null)[][] = channels.map((ch) => {
    const valueMap = new Map<number, number>();
    for (const s of ch.samples) {
      if (s.timestamp >= tStart && s.timestamp <= now) {
        valueMap.set(s.timestamp, s.value);
      }
    }
    return timestamps.map((ts) => valueMap.get(ts) ?? null);
  });

  return [xValues, ...seriesArrays];
}

export default function RealTimeChart({
  channels,
  width = 600,
  height = 300,
}: RealTimeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const rafRef = useRef<number>(0);

  const [paused, setPaused] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>({
    preset: '30s',
    durationMs: TIME_RANGE_PRESETS['30s'],
  });
  const [customDurationMs, setCustomDurationMs] = useState(60_000);

  // Snapshot channels when paused
  const pausedDataRef = useRef<ChartSignalChannel[] | null>(null);

  const activeChannels = paused && pausedDataRef.current
    ? pausedDataRef.current
    : channels;

  const handlePauseToggle = useCallback(() => {
    setPaused((prev) => {
      if (!prev) {
        // Entering pause: snapshot current data
        pausedDataRef.current = channels.map((ch) => ({
          ...ch,
          samples: [...ch.samples],
        }));
      } else {
        // Resuming: clear snapshot
        pausedDataRef.current = null;
      }
      return !prev;
    });
  }, [channels]);

  const handleTimeRangeChange = useCallback((preset: TimeRangePreset) => {
    if (preset === 'custom') {
      setTimeRange({ preset: 'custom', durationMs: customDurationMs });
    } else {
      setTimeRange({ preset, durationMs: TIME_RANGE_PRESETS[preset] });
    }
  }, [customDurationMs]);

  const handleCustomDurationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(1000, Number(e.target.value) || 1000);
    setCustomDurationMs(val);
    setTimeRange((prev) =>
      prev.preset === 'custom' ? { ...prev, durationMs: val } : prev,
    );
  }, []);

  // Build uPlot options based on current channels
  const opts = useMemo((): uPlot.Options => {
    const series: uPlot.Series[] = [
      { label: 'Time' },
      ...activeChannels.map((ch, i) => ({
        label: `${ch.name} (${ch.unit})`,
        stroke: SERIES_COLORS[i % SERIES_COLORS.length],
        width: 2,
      })),
    ];

    return {
      width,
      height,
      series,
      axes: [
        {
          label: 'Time',
          stroke: '#666',
          grid: { stroke: '#eee' },
        },
        {
          label: 'Value',
          stroke: '#666',
          grid: { stroke: '#eee' },
        },
      ],
      scales: {
        x: { time: true },
      },
      cursor: {
        drag: { x: true, y: false },
      },
    };
  }, [activeChannels, width, height]);

  // Create / recreate chart when options structure changes (channel count)
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy previous chart
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const now = Date.now();
    const data = buildChartData(activeChannels, timeRange.durationMs, now);

    const chart = new uPlot(opts, data, containerRef.current);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
    // Recreate chart when channel count changes or opts change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts]);

  // Update data via requestAnimationFrame for sub-200ms latency (Req 6.1)
  useEffect(() => {
    if (paused) return;

    let running = true;

    const update = () => {
      if (!running || !chartRef.current) return;

      const now = Date.now();
      const data = buildChartData(activeChannels, timeRange.durationMs, now);
      chartRef.current.setData(data, false);

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [activeChannels, timeRange.durationMs, paused]);

  return (
    <div data-testid="realtime-chart">
      {/* Controls bar */}
      <div data-testid="chart-controls" style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <button
          data-testid="pause-resume-btn"
          onClick={handlePauseToggle}
          aria-label={paused ? 'Resume chart' : 'Pause chart'}
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>

        {(['10s', '30s', '1min', '5min'] as const).map((preset) => (
          <button
            key={preset}
            data-testid={`range-${preset}`}
            onClick={() => handleTimeRangeChange(preset)}
            aria-pressed={timeRange.preset === preset}
            style={{
              fontWeight: timeRange.preset === preset ? 'bold' : 'normal',
            }}
          >
            {preset}
          </button>
        ))}

        <button
          data-testid="range-custom"
          onClick={() => handleTimeRangeChange('custom')}
          aria-pressed={timeRange.preset === 'custom'}
          style={{
            fontWeight: timeRange.preset === 'custom' ? 'bold' : 'normal',
          }}
        >
          Custom
        </button>

        {timeRange.preset === 'custom' && (
          <input
            data-testid="custom-duration-input"
            type="number"
            min={1000}
            step={1000}
            value={customDurationMs}
            onChange={handleCustomDurationChange}
            aria-label="Custom duration in milliseconds"
            style={{ width: 100 }}
          />
        )}
      </div>

      {/* Chart status */}
      <div data-testid="chart-status" style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
        {paused ? 'Paused' : 'Live'} — {activeChannels.length} series — Range: {timeRange.preset}
        {timeRange.preset === 'custom' ? ` (${timeRange.durationMs}ms)` : ''}
      </div>

      {/* uPlot container */}
      <div ref={containerRef} data-testid="chart-container" />
    </div>
  );
}

export { TIME_RANGE_PRESETS, SERIES_COLORS };
