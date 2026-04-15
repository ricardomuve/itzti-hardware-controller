/**
 * Tests for DeviceList component.
 * Validates: Requirements 1.1, 1.2, 1.3, 1.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeviceList from '../components/DeviceList';
import { useDeviceStore } from '../store/device-store';
import type { IHardwarePort } from '../communication/hardware-port';
import type { PortInfo } from '../communication/types';

function createMockPort(overrides: Partial<IHardwarePort> = {}): IHardwarePort {
  return {
    listPorts: vi.fn().mockResolvedValue([]),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
    onData: vi.fn(),
    onError: vi.fn(),
    onDisconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

beforeEach(() => {
  useDeviceStore.setState({ devices: [], error: null });
});

describe('DeviceList component', () => {
  it('should render empty state when no devices', () => {
    render(<DeviceList hardwarePort={null} />);
    expect(screen.getByTestId('no-devices')).toHaveTextContent('No hay dispositivos.');
  });

  it('should disable scan button when no hardware port', () => {
    render(<DeviceList hardwarePort={null} />);
    expect(screen.getByTestId('scan-button')).toBeDisabled();
  });

  it('should scan ports and display results (Req 1.1)', async () => {
    const ports: PortInfo[] = [
      { path: 'COM3', manufacturer: 'Arduino' },
      { path: 'COM4' },
    ];
    const mockPort = createMockPort({ listPorts: vi.fn().mockResolvedValue(ports) });

    render(<DeviceList hardwarePort={mockPort} />);
    fireEvent.click(screen.getByTestId('scan-button'));

    await waitFor(() => {
      expect(screen.getByTestId('port-COM3')).toBeInTheDocument();
      expect(screen.getByTestId('port-COM4')).toBeInTheDocument();
    });

    expect(screen.getByTestId('port-name-COM3')).toHaveTextContent('COM3 (Arduino)');
    expect(screen.getByTestId('port-name-COM4')).toHaveTextContent('COM4');
  });

  it('should show scan error when listPorts fails', async () => {
    const mockPort = createMockPort({
      listPorts: vi.fn().mockRejectedValue(new Error('Puerto no disponible')),
    });

    render(<DeviceList hardwarePort={mockPort} />);
    fireEvent.click(screen.getByTestId('scan-button'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-error')).toHaveTextContent('Puerto no disponible');
    });
  });

  it('should connect to a port and show connected status (Req 1.2, 1.3)', async () => {
    const ports: PortInfo[] = [{ path: '/dev/ttyUSB0', manufacturer: 'FTDI' }];
    const mockPort = createMockPort({
      listPorts: vi.fn().mockResolvedValue(ports),
      connect: vi.fn().mockResolvedValue(undefined),
    });

    render(<DeviceList hardwarePort={mockPort} />);

    // Scan first
    fireEvent.click(screen.getByTestId('scan-button'));
    await waitFor(() => {
      expect(screen.getByTestId('port-/dev/ttyUSB0')).toBeInTheDocument();
    });

    // Connect
    fireEvent.click(screen.getByTestId('connect-btn-/dev/ttyUSB0'));

    await waitFor(() => {
      expect(screen.getByTestId('device-status-/dev/ttyUSB0')).toHaveTextContent('Conectado');
    });

    // Visual indicator should be green
    const indicator = screen.getByTestId('status-indicator-/dev/ttyUSB0');
    expect(indicator).toHaveStyle({ backgroundColor: '#22c55e' });
  });

  it('should show error when connection fails (Req 1.2)', async () => {
    const ports: PortInfo[] = [{ path: 'COM5' }];
    const mockPort = createMockPort({
      listPorts: vi.fn().mockResolvedValue(ports),
      connect: vi.fn().mockRejectedValue(new Error('Acceso denegado')),
    });

    render(<DeviceList hardwarePort={mockPort} />);

    fireEvent.click(screen.getByTestId('scan-button'));
    await waitFor(() => {
      expect(screen.getByTestId('port-COM5')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('connect-btn-COM5'));

    await waitFor(() => {
      expect(screen.getByTestId('device-error-COM5')).toHaveTextContent('Acceso denegado');
      expect(screen.getByTestId('device-status-COM5')).toHaveTextContent('Desconectado');
    });
  });

  it('should disconnect a connected device (Req 1.5)', async () => {
    // Pre-populate store with a connected device
    useDeviceStore.setState({
      devices: [
        {
          id: 'd1',
          portPath: 'COM3',
          name: 'Test Device',
          status: 'connected',
          lastSeen: Date.now(),
          params: {},
        },
      ],
    });

    const mockPort = createMockPort({
      disconnect: vi.fn().mockResolvedValue(undefined),
    });

    render(<DeviceList hardwarePort={mockPort} />);

    expect(screen.getByTestId('disconnect-btn-d1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('disconnect-btn-d1'));

    await waitFor(() => {
      expect(screen.getByTestId('device-status-d1')).toHaveTextContent('Desconectado');
    });
    expect(mockPort.disconnect).toHaveBeenCalled();
  });

  it('should show visual status indicators with correct colors (Req 1.3)', () => {
    useDeviceStore.setState({
      devices: [
        { id: 'd1', portPath: 'COM3', name: 'Dev1', status: 'connected', lastSeen: Date.now(), params: {} },
        { id: 'd2', portPath: 'COM4', name: 'Dev2', status: 'connecting', lastSeen: Date.now(), params: {} },
        { id: 'd3', portPath: 'COM5', name: 'Dev3', status: 'disconnected', lastSeen: Date.now(), params: {} },
      ],
    });

    render(<DeviceList hardwarePort={createMockPort()} />);

    expect(screen.getByTestId('status-indicator-d1')).toHaveStyle({ backgroundColor: '#22c55e' });
    expect(screen.getByTestId('status-indicator-d2')).toHaveStyle({ backgroundColor: '#f59e0b' });
    expect(screen.getByTestId('status-indicator-d3')).toHaveStyle({ backgroundColor: '#ef4444' });
  });

  it('should not show disconnect button for disconnected devices', () => {
    useDeviceStore.setState({
      devices: [
        { id: 'd1', portPath: 'COM3', name: 'Dev1', status: 'disconnected', lastSeen: Date.now(), params: {} },
      ],
    });

    render(<DeviceList hardwarePort={createMockPort()} />);
    expect(screen.queryByTestId('disconnect-btn-d1')).not.toBeInTheDocument();
  });
});
