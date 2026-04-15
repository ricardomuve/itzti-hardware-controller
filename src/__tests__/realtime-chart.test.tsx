/**
 * Tests for RealTimeChart component.
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RealTimeChart, {
  buildChartData,
  TIME_RANGE_PRESETS,
  type ChartSignalChannel,
} from '../components/RealTimeChart';

// Mock uPlot since it requires a real canvas
vi.mock('uplot', () => {
  const MockUPlot = vi.fn().mockImplementation(() => ({
    root: document.createElement('div'),
    destroy: vi.fn(),
    setData: vi.fn(),
    setScale: vi.fn(),
  }));
  return { default: MockUPlot };
});

// Mock uPlot CSS import
vi.mock('uplot/dist/uPlot.min.css', () => ({}));

function makeSamples(count: number, baseTime: number, intervalMs = 1000): { timestamp: number; value: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: baseTime + i * intervalMs,
    value: Math.sin(i) * 10,
  }));
}

function makeChannels(count: number, samplesPerChannel = 10, baseTime = 1000000): ChartSignalChannel[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ch-${i}`,
    name: `Channel ${i}`,
    unit: i % 2 === 0 ? 'V' : '°C',
    samples: makeSamples(samplesPerChannel, baseTime),
  }));
}

describe('buildChartData', () => {
  it('returns empty x-values array for no channels', () => {
    const data = buildChartData([], 10_000, Date.now());
    expect(data).toEqual([[]]);
  });

  it('filters samples within time range', () => {
    const now = 100_000;
    const channels: ChartSignalChannel[] = [
      {
        id: 'ch1',
        name: 'Temp',
        unit: '°C',
        samples: [
          { timestamp: 80_000, value: 1 },  // outside 10s range
          { timestamp: 91_000, value: 2 },  // inside
          { timestamp: 95_000, value: 3 },  // inside
          { timestamp: 100_000, value: 4 }, // inside (at now)
        ],
      },
    ];

    const data = buildChartData(channels, 10_000, now);
    // x-values should be timestamps in seconds
    expect(data[0]).toEqual([91, 95, 100]);
    expect(data[1]).toEqual([2, 3, 4]);
  });

  it('supports multiple overlaid series (Req 6.3)', () => {
    const now = 110_000;
    const channels: ChartSignalChannel[] = [
      {
        id: 'ch1',
        name: 'Voltage',
        unit: 'V',
        samples: [
          { timestamp: 105_000, value: 5.0 },
          { timestamp: 110_000, value: 5.1 },
        ],
      },
      {
        id: 'ch2',
        name: 'Current',
        unit: 'A',
        samples: [
          { timestamp: 105_000, value: 0.5 },
          { timestamp: 110_000, value: 0.6 },
        ],
      },
    ];

    const data = buildChartData(channels, 10_000, now);
    // [timestamps, series1, series2]
    expect(data.length).toBe(3);
    expect(data[0]).toEqual([105, 110]);
    expect(data[1]).toEqual([5.0, 5.1]);
    expect(data[2]).toEqual([0.5, 0.6]);
  });

  it('fills null for missing timestamps in a channel', () => {
    const now = 110_000;
    const channels: ChartSignalChannel[] = [
      {
        id: 'ch1',
        name: 'A',
        unit: 'V',
        samples: [
          { timestamp: 105_000, value: 1 },
          { timestamp: 110_000, value: 2 },
        ],
      },
      {
        id: 'ch2',
        name: 'B',
        unit: 'A',
        samples: [
          { timestamp: 110_000, value: 3 },
        ],
      },
    ];

    const data = buildChartData(channels, 10_000, now);
    expect(data[0]).toEqual([105, 110]);
    expect(data[1]).toEqual([1, 2]);
    expect(data[2]).toEqual([null, 3]); // ch2 has no sample at 105_000
  });
});

describe('RealTimeChart component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders chart container and controls', () => {
    render(<RealTimeChart channels={[]} />);
    expect(screen.getByTestId('realtime-chart')).toBeInTheDocument();
    expect(screen.getByTestId('chart-controls')).toBeInTheDocument();
    expect(screen.getByTestId('pause-resume-btn')).toBeInTheDocument();
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('shows pause button that toggles to resume (Req 6.4, 6.5)', () => {
    render(<RealTimeChart channels={makeChannels(1)} />);
    const btn = screen.getByTestId('pause-resume-btn');

    expect(btn.textContent).toContain('Pause');
    fireEvent.click(btn);
    expect(btn.textContent).toContain('Resume');
    fireEvent.click(btn);
    expect(btn.textContent).toContain('Pause');
  });

  it('shows status as Paused when paused (Req 6.4)', () => {
    render(<RealTimeChart channels={makeChannels(1)} />);
    const btn = screen.getByTestId('pause-resume-btn');

    expect(screen.getByTestId('chart-status').textContent).toContain('Live');
    fireEvent.click(btn);
    expect(screen.getByTestId('chart-status').textContent).toContain('Paused');
  });

  it('renders time range preset buttons (Req 6.2)', () => {
    render(<RealTimeChart channels={[]} />);
    expect(screen.getByTestId('range-10s')).toBeInTheDocument();
    expect(screen.getByTestId('range-30s')).toBeInTheDocument();
    expect(screen.getByTestId('range-1min')).toBeInTheDocument();
    expect(screen.getByTestId('range-5min')).toBeInTheDocument();
    expect(screen.getByTestId('range-custom')).toBeInTheDocument();
  });

  it('changes time range when preset button is clicked', () => {
    render(<RealTimeChart channels={[]} />);
    const status = screen.getByTestId('chart-status');

    fireEvent.click(screen.getByTestId('range-10s'));
    expect(status.textContent).toContain('10s');

    fireEvent.click(screen.getByTestId('range-5min'));
    expect(status.textContent).toContain('5min');
  });

  it('shows custom duration input when custom range is selected', () => {
    render(<RealTimeChart channels={[]} />);

    expect(screen.queryByTestId('custom-duration-input')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('range-custom'));
    expect(screen.getByTestId('custom-duration-input')).toBeInTheDocument();
  });

  it('displays correct series count', () => {
    const channels = makeChannels(3);
    render(<RealTimeChart channels={channels} />);
    expect(screen.getByTestId('chart-status').textContent).toContain('3 series');
  });
});

describe('TIME_RANGE_PRESETS', () => {
  it('has correct durations', () => {
    expect(TIME_RANGE_PRESETS['10s']).toBe(10_000);
    expect(TIME_RANGE_PRESETS['30s']).toBe(30_000);
    expect(TIME_RANGE_PRESETS['1min']).toBe(60_000);
    expect(TIME_RANGE_PRESETS['5min']).toBe(300_000);
  });
});
