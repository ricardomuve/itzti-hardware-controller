/**
 * Tests for SignalDashboard integration component.
 * Validates: Requirements 5.3, 7.2, 7.4, 7.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SignalDashboard from '../components/SignalDashboard';
import { useSignalStore } from '../store/signal-store';
import type { SignalChannel } from '../store/signal-store';
import * as csvExport from '../utils/csv-export';

// Mock uPlot to avoid canvas issues in jsdom
vi.mock('uplot', () => {
  const MockUPlot = vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    setData: vi.fn(),
  }));
  return { default: MockUPlot };
});
vi.mock('uplot/dist/uPlot.min.css', () => ({}));

beforeEach(() => {
  useSignalStore.setState({ channels: [] });
});

const makeChannel = (overrides: Partial<SignalChannel> = {}): SignalChannel => ({
  id: 'ch1',
  name: 'Temperatura',
  unit: '°C',
  sampleRateHz: 10,
  samples: [
    { timestamp: 1000, value: 20 },
    { timestamp: 2000, value: 30 },
    { timestamp: 3000, value: 25 },
  ],
  ...overrides,
});

describe('SignalDashboard', () => {
  it('should render chart, metrics, alerts, and export sections', () => {
    render(<SignalDashboard />);
    expect(screen.getByTestId('signal-chart-section')).toBeInTheDocument();
    expect(screen.getByTestId('signal-metrics-section')).toBeInTheDocument();
    expect(screen.getByTestId('signal-alerts-section')).toBeInTheDocument();
    expect(screen.getByTestId('signal-export-section')).toBeInTheDocument();
  });

  it('should display metrics for each channel (Req 7.4)', () => {
    useSignalStore.setState({ channels: [makeChannel()] });
    render(<SignalDashboard />);

    const metricsEl = screen.getByTestId('metrics-ch1');
    expect(metricsEl).toHaveTextContent('Temperatura');
    expect(metricsEl).toHaveTextContent('min: 20');
    expect(metricsEl).toHaveTextContent('max: 30');
    expect(metricsEl).toHaveTextContent('avg: 25.00');
  });

  it('should show threshold alert when value exceeds max (Req 5.5)', () => {
    useSignalStore.setState({
      channels: [
        makeChannel({
          thresholdMax: 24,
          samples: [
            { timestamp: 1000, value: 20 },
            { timestamp: 2000, value: 30 },
          ],
        }),
      ],
    });

    render(<SignalDashboard />);

    expect(screen.getByText(/fuera de umbral/)).toBeInTheDocument();
  });

  it('should show threshold alert when value is below min', () => {
    useSignalStore.setState({
      channels: [
        makeChannel({
          thresholdMin: 22,
          samples: [
            { timestamp: 1000, value: 25 },
            { timestamp: 2000, value: 18 },
          ],
        }),
      ],
    });
    render(<SignalDashboard />);
    expect(screen.getByText(/fuera de umbral/)).toBeInTheDocument();
  });

  it('should NOT show threshold alert when value is within range', () => {
    useSignalStore.setState({
      channels: [
        makeChannel({
          thresholdMin: 10,
          thresholdMax: 50,
        }),
      ],
    });
    render(<SignalDashboard />);
    expect(screen.queryByText(/fuera de umbral/)).not.toBeInTheDocument();
  });

  it('should call exportToCSV and downloadCSV on export button click (Req 7.5)', () => {
    const downloadSpy = vi.spyOn(csvExport, 'downloadCSV').mockImplementation(() => {});
    useSignalStore.setState({ channels: [makeChannel()] });

    render(<SignalDashboard />);
    fireEvent.click(screen.getByTestId('export-csv-btn'));

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy).toHaveBeenCalledWith(
      expect.stringContaining('timestamp'),
      expect.stringMatching(/^signals-\d+\.csv$/),
    );
    downloadSpy.mockRestore();
  });

  it('should disable export button when no channels', () => {
    render(<SignalDashboard />);
    expect(screen.getByTestId('export-csv-btn')).toBeDisabled();
  });

  it('should show empty state when no channels', () => {
    render(<SignalDashboard />);
    expect(screen.getByText('No hay canales activos.')).toBeInTheDocument();
  });

  it('should pass channels to RealTimeChart (Req 5.3)', () => {
    useSignalStore.setState({ channels: [makeChannel()] });
    render(<SignalDashboard />);
    // Chart section should be rendered with the chart component
    expect(screen.getByTestId('realtime-chart')).toBeInTheDocument();
  });

  it('should clear manual alerts on clear button click', () => {
    useSignalStore.setState({
      channels: [
        makeChannel({
          thresholdMax: 24,
          samples: [{ timestamp: 1000, value: 30 }],
        }),
      ],
    });
    render(<SignalDashboard />);
    // Threshold alerts are computed, so they persist after clear
    // But the clear button should work without errors
    fireEvent.click(screen.getByTestId('clear-alerts-button'));
    // Threshold-based alerts are recomputed, so they remain
    expect(screen.getByText(/fuera de umbral/)).toBeInTheDocument();
  });
});
