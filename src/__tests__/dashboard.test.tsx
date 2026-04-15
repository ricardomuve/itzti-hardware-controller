/**
 * Tests for Dashboard component.
 * Validates: Requirements 4.1, 4.2, 4.3, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard, { saveLayout, loadLayout, LAYOUT_STORAGE_KEY } from '../components/Dashboard';
import { useDeviceStore } from '../store/device-store';
import { useSignalStore } from '../store/signal-store';
import { useAuthStore } from '../store/auth-store';
import type { DashboardLayout } from '../store/dashboard-types';
import type { DeviceState } from '../store/device-store';
import type { SignalChannel } from '../store/signal-store';

// Reset stores and localStorage before each test
beforeEach(() => {
  localStorage.clear();
  useDeviceStore.setState({ devices: [], error: null });
  useSignalStore.setState({ channels: [] });
  useAuthStore.setState({ role: 'user', pinHashExists: false });
});

describe('saveLayout / loadLayout', () => {
  it('should save and load a layout from localStorage', () => {
    const layout: DashboardLayout = {
      widgets: [
        { id: 'w1', type: 'metric', position: { x: 0, y: 0, w: 2, h: 1 }, config: {} },
      ],
    };
    const saved = saveLayout(layout);
    expect(saved).toBe(true);

    const loaded = loadLayout();
    expect(loaded).toEqual(layout);
  });

  it('should return null when no layout is stored', () => {
    expect(loadLayout()).toBeNull();
  });

  it('should return null for invalid JSON in localStorage', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, 'not-json');
    expect(loadLayout()).toBeNull();
  });

  it('should return null for JSON without widgets array', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
    expect(loadLayout()).toBeNull();
  });

  it('should return false when localStorage throws on save', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const result = saveLayout({ widgets: [] });
    expect(result).toBe(false);
    spy.mockRestore();
  });
});

describe('Dashboard component', () => {
  it('should render empty state messages when no devices or signals', () => {
    render(<Dashboard />);
    expect(screen.getByText('No hay dispositivos registrados.')).toBeInTheDocument();
    expect(screen.getByText('No hay señales activas.')).toBeInTheDocument();
  });

  it('should display device connection statuses (Req 7.1)', () => {
    const devices: DeviceState[] = [
      { id: 'd1', portPath: 'COM3', name: 'LED Controller', status: 'connected', lastSeen: Date.now(), params: {} },
      { id: 'd2', portPath: 'COM4', name: 'Motor Driver', status: 'disconnected', lastSeen: Date.now(), params: {} },
    ];
    useDeviceStore.setState({ devices });

    render(<Dashboard />);

    expect(screen.getByTestId('device-name-d1')).toHaveTextContent('LED Controller');
    expect(screen.getByTestId('device-status-d1')).toHaveTextContent('connected');
    expect(screen.getByTestId('device-name-d2')).toHaveTextContent('Motor Driver');
    expect(screen.getByTestId('device-status-d2')).toHaveTextContent('disconnected');
  });

  it('should display current signal values and metrics (Req 7.2)', () => {
    const channels: SignalChannel[] = [
      {
        id: 'ch1',
        name: 'Temperatura',
        unit: '°C',
        sampleRateHz: 10,
        samples: [
          { timestamp: 1000, value: 20 },
          { timestamp: 2000, value: 30 },
          { timestamp: 3000, value: 25 },
        ],
      },
    ];
    useSignalStore.setState({ channels });

    render(<Dashboard />);

    expect(screen.getByTestId('signal-name-ch1')).toHaveTextContent('Temperatura');
    // Last sample value
    expect(screen.getByTestId('signal-value-ch1')).toHaveTextContent('25 °C');
    // Metrics: min=20, max=30, avg=25
    expect(screen.getByTestId('signal-metrics-ch1')).toHaveTextContent('min: 20');
    expect(screen.getByTestId('signal-metrics-ch1')).toHaveTextContent('max: 30');
    expect(screen.getByTestId('signal-metrics-ch1')).toHaveTextContent('avg: 25.00');
  });

  it('should show "Sin datos" for a channel with no samples', () => {
    const channels: SignalChannel[] = [
      { id: 'ch2', name: 'Voltaje', unit: 'V', sampleRateHz: 100, samples: [] },
    ];
    useSignalStore.setState({ channels });

    render(<Dashboard />);

    expect(screen.getByTestId('signal-value-ch2')).toHaveTextContent('Sin datos');
  });

  it('should load layout from localStorage on mount (Req 7.3)', () => {
    const layout: DashboardLayout = {
      widgets: [
        { id: 'w1', type: 'status', position: { x: 0, y: 0, w: 4, h: 2 }, config: { label: 'test' } },
      ],
    };
    saveLayout(layout);

    render(<Dashboard />);

    expect(screen.getByTestId('widget-w1')).toBeInTheDocument();
    expect(screen.getByText('Widgets (1)')).toBeInTheDocument();
  });

  it('should render with default empty layout when nothing stored', () => {
    render(<Dashboard />);
    expect(screen.getByText('Widgets (0)')).toBeInTheDocument();
  });
});

describe('Dashboard role-based rendering', () => {
  it('should hide BusPanel when role is user (Req 5.1)', () => {
    useAuthStore.setState({ role: 'user' });
    render(<Dashboard />);

    expect(screen.queryByTestId('bus-section')).not.toBeInTheDocument();
  });

  it('should show BusPanel when role is expert (Req 4.1)', () => {
    useAuthStore.setState({ role: 'expert' });
    render(<Dashboard />);

    expect(screen.getByTestId('bus-section')).toBeInTheDocument();
  });

  it('should show signal charts in read-only mode for user role (Req 5.5)', () => {
    useAuthStore.setState({ role: 'user' });
    render(<Dashboard />);

    const signalSection = screen.getByTestId('signal-section');
    expect(signalSection).toHaveAttribute('data-readonly', 'true');
    expect(screen.getByText('Señales Analógicas (solo lectura)')).toBeInTheDocument();
  });

  it('should show signal charts in editable mode for expert role (Req 4.2, 4.3)', () => {
    useAuthStore.setState({ role: 'expert' });
    render(<Dashboard />);

    const signalSection = screen.getByTestId('signal-section');
    expect(signalSection).toHaveAttribute('data-readonly', 'false');
    expect(screen.getByText('Señales Analógicas')).toBeInTheDocument();
    expect(screen.queryByText('Señales Analógicas (solo lectura)')).not.toBeInTheDocument();
  });

  it('should expose the active role via data-role attribute', () => {
    useAuthStore.setState({ role: 'user' });
    const { rerender } = render(<Dashboard />);
    expect(screen.getByTestId('dashboard')).toHaveAttribute('data-role', 'user');

    useAuthStore.setState({ role: 'expert' });
    rerender(<Dashboard />);
    expect(screen.getByTestId('dashboard')).toHaveAttribute('data-role', 'expert');
  });
});
