/**
 * Tests for AlertPanel and LogPanel components.
 * Requisitos: 3.4, 4.4, 5.5, 11.3, 11.5
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AlertPanel, { type Alert } from '../components/AlertPanel';
import LogPanel, { type LogEntry } from '../components/LogPanel';

describe('AlertPanel', () => {
  const baseAlerts: Alert[] = [
    { id: 'a1', type: 'threshold', message: 'Temperatura excede 80°C', timestamp: 1000, channelId: 'ch1' },
    { id: 'a2', type: 'overload', message: 'Actuador sobrecargado', timestamp: 3000, deviceId: 'dev1' },
    { id: 'a3', type: 'error', message: 'Error de reproducción', timestamp: 2000, deviceId: 'dev2' },
  ];

  it('renders all alerts with severity indicators', () => {
    const onClear = vi.fn();
    render(<AlertPanel alerts={baseAlerts} onClear={onClear} />);

    expect(screen.getByTestId('alert-panel')).toBeInTheDocument();
    expect(screen.getByText('Alertas (3)')).toBeInTheDocument();

    // Each alert is rendered
    expect(screen.getByTestId('alert-a1')).toBeInTheDocument();
    expect(screen.getByTestId('alert-a2')).toBeInTheDocument();
    expect(screen.getByTestId('alert-a3')).toBeInTheDocument();

    // Type labels are shown
    expect(screen.getByTestId('alert-type-a1')).toHaveTextContent('[Umbral]');
    expect(screen.getByTestId('alert-type-a2')).toHaveTextContent('[Sobrecarga]');
    expect(screen.getByTestId('alert-type-a3')).toHaveTextContent('[Error]');
  });

  it('shows most recent alerts first', () => {
    const onClear = vi.fn();
    render(<AlertPanel alerts={baseAlerts} onClear={onClear} />);

    const items = screen.getByTestId('alert-list').querySelectorAll('li');
    // Sorted by timestamp descending: a2 (3000), a3 (2000), a1 (1000)
    expect(items[0]).toHaveAttribute('data-testid', 'alert-a2');
    expect(items[1]).toHaveAttribute('data-testid', 'alert-a3');
    expect(items[2]).toHaveAttribute('data-testid', 'alert-a1');
  });

  it('displays channelId and deviceId when present', () => {
    const onClear = vi.fn();
    render(<AlertPanel alerts={baseAlerts} onClear={onClear} />);

    expect(screen.getByTestId('alert-channel-a1')).toHaveTextContent('Canal: ch1');
    expect(screen.getByTestId('alert-device-a2')).toHaveTextContent('Dispositivo: dev1');
  });

  it('calls onClear when clear button is clicked', () => {
    const onClear = vi.fn();
    render(<AlertPanel alerts={baseAlerts} onClear={onClear} />);

    fireEvent.click(screen.getByTestId('clear-alerts-button'));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('disables clear button when no alerts', () => {
    const onClear = vi.fn();
    render(<AlertPanel alerts={[]} onClear={onClear} />);

    expect(screen.getByTestId('clear-alerts-button')).toBeDisabled();
    expect(screen.getByTestId('no-alerts')).toHaveTextContent('No hay alertas.');
  });
});

describe('LogPanel', () => {
  const baseEntries: LogEntry[] = [
    { id: 'l1', timestamp: 1000, hexBytes: 'ff 01 00', description: 'Datos insuficientes', level: 'error' },
    { id: 'l2', timestamp: 3000, hexBytes: '0a 0b', description: 'Payload incompleto', level: 'warning' },
    { id: 'l3', timestamp: 2000, hexBytes: '01 00 01 64', description: 'Comando recibido', level: 'info' },
  ];

  it('renders all log entries with level indicators', () => {
    const onClear = vi.fn();
    render(<LogPanel entries={baseEntries} onClear={onClear} />);

    expect(screen.getByTestId('log-panel')).toBeInTheDocument();
    expect(screen.getByText('Log de Depuración (3)')).toBeInTheDocument();

    expect(screen.getByTestId('log-l1')).toBeInTheDocument();
    expect(screen.getByTestId('log-l2')).toBeInTheDocument();
    expect(screen.getByTestId('log-l3')).toBeInTheDocument();

    expect(screen.getByTestId('log-level-l1')).toHaveTextContent('[ERROR]');
    expect(screen.getByTestId('log-level-l2')).toHaveTextContent('[WARN]');
    expect(screen.getByTestId('log-level-l3')).toHaveTextContent('[INFO]');
  });

  it('displays hex bytes and description for each entry', () => {
    const onClear = vi.fn();
    render(<LogPanel entries={baseEntries} onClear={onClear} />);

    expect(screen.getByTestId('log-hex-l1')).toHaveTextContent('[ff 01 00]');
    expect(screen.getByTestId('log-description-l1')).toHaveTextContent('Datos insuficientes');
  });

  it('shows entries in reverse chronological order', () => {
    const onClear = vi.fn();
    render(<LogPanel entries={baseEntries} onClear={onClear} />);

    const items = screen.getByTestId('log-list').querySelectorAll('li');
    // Sorted by timestamp descending: l2 (3000), l3 (2000), l1 (1000)
    expect(items[0]).toHaveAttribute('data-testid', 'log-l2');
    expect(items[1]).toHaveAttribute('data-testid', 'log-l3');
    expect(items[2]).toHaveAttribute('data-testid', 'log-l1');
  });

  it('calls onClear when clear button is clicked', () => {
    const onClear = vi.fn();
    render(<LogPanel entries={baseEntries} onClear={onClear} />);

    fireEvent.click(screen.getByTestId('clear-log-button'));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('disables clear button when no entries', () => {
    const onClear = vi.fn();
    render(<LogPanel entries={[]} onClear={onClear} />);

    expect(screen.getByTestId('clear-log-button')).toBeDisabled();
    expect(screen.getByTestId('no-log-entries')).toHaveTextContent('No hay entradas en el log.');
  });
});
