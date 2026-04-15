/**
 * Lista de dispositivos disponibles y conectados.
 * Permite escanear puertos, conectar y desconectar dispositivos.
 * Requisitos: 1.1, 1.2, 1.3, 1.5
 */

import { useState, useCallback } from 'react';
import { useDeviceStore } from '../store/device-store';
import type { IHardwarePort } from '../communication/hardware-port';
import type { PortInfo } from '../communication/types';
import type { ConnectionStatus } from '../store/device-store';

export interface DeviceListProps {
  hardwarePort: IHardwarePort | null;
}

const STATUS_CLASSES: Record<ConnectionStatus, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  disconnected: 'bg-danger',
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Conectado',
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
};

export default function DeviceList({ hardwarePort }: DeviceListProps) {
  const devices = useDeviceStore((s) => s.devices);
  const addDevice = useDeviceStore((s) => s.addDevice);
  const updateDeviceStatus = useDeviceStore((s) => s.updateDeviceStatus);
  const removeDevice = useDeviceStore((s) => s.removeDevice);
  const setDeviceError = useDeviceStore((s) => s.setDeviceError);

  const [availablePorts, setAvailablePorts] = useState<PortInfo[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    if (!hardwarePort) {
      setScanError('No hay adaptador de hardware disponible.');
      return;
    }
    setScanning(true);
    setScanError(null);
    try {
      const ports = await hardwarePort.listPorts();
      setAvailablePorts(ports);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Error al escanear puertos.');
    } finally {
      setScanning(false);
    }
  }, [hardwarePort]);

  const handleConnect = useCallback(
    async (port: PortInfo) => {
      if (!hardwarePort) return;
      const deviceId = port.path;
      addDevice({
        id: deviceId,
        portPath: port.path,
        name: port.manufacturer ?? port.path,
        status: 'connecting',
        lastSeen: Date.now(),
        params: {},
      });
      updateDeviceStatus(deviceId, 'connecting');
      try {
        await hardwarePort.connect(port.path, 9600);
        updateDeviceStatus(deviceId, 'connected');
        setDeviceError(deviceId, null);
      } catch (err) {
        updateDeviceStatus(deviceId, 'disconnected');
        setDeviceError(deviceId, err instanceof Error ? err.message : 'Error al conectar.');
      }
    },
    [hardwarePort, addDevice, updateDeviceStatus, setDeviceError]
  );

  const handleDisconnect = useCallback(
    async (deviceId: string) => {
      if (!hardwarePort) return;
      try {
        await hardwarePort.disconnect();
        updateDeviceStatus(deviceId, 'disconnected');
      } catch (err) {
        setDeviceError(deviceId, err instanceof Error ? err.message : 'Error al desconectar.');
      }
    },
    [hardwarePort, updateDeviceStatus, setDeviceError]
  );

  const isPortConnected = (portPath: string) =>
    devices.some((d) => d.portPath === portPath && d.status === 'connected');

  return (
    <div data-testid="device-list" className="space-y-6">
      {/* Scan section */}
      <section data-testid="scan-section">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Puertos</h2>
        <button
          data-testid="scan-button"
          onClick={handleScan}
          disabled={scanning || !hardwarePort}
          className="w-full px-3 py-2 text-sm font-medium bg-accent/15 text-accent rounded-lg hover:bg-accent/25 transition-colors disabled:opacity-40"
        >
          {scanning ? 'Escaneando…' : 'Escanear Puertos'}
        </button>
        {scanError && (
          <p data-testid="scan-error" className="text-danger text-xs mt-2">{scanError}</p>
        )}
        <ul data-testid="port-list" className="mt-3 space-y-1">
          {availablePorts.map((port) => (
            <li key={port.path} data-testid={`port-${port.path}`} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-hover/50 transition-colors">
              <span data-testid={`port-name-${port.path}`} className="text-sm text-text-primary truncate">
                {port.path}
                {port.manufacturer && <span className="text-text-muted ml-1 text-xs">({port.manufacturer})</span>}
              </span>
              <button
                data-testid={`connect-btn-${port.path}`}
                onClick={() => handleConnect(port)}
                disabled={isPortConnected(port.path)}
                className="ml-2 px-2 py-1 text-xs font-medium rounded-md bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {isPortConnected(port.path) ? '✓' : 'Conectar'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Connected devices */}
      <section data-testid="connected-section">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Dispositivos</h2>
        {devices.length === 0 && <p data-testid="no-devices" className="text-text-muted text-xs">No hay dispositivos.</p>}
        <ul data-testid="device-items" className="space-y-1">
          {devices.map((device) => (
            <li key={device.id} data-testid={`device-${device.id}`} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-hover/50 transition-colors">
              <span
                data-testid={`status-indicator-${device.id}`}
                className={`w-2 h-2 rounded-full shrink-0 ${STATUS_CLASSES[device.status]}`}
                aria-label={STATUS_LABELS[device.status]}
              />
              <div className="flex-1 min-w-0">
                <span data-testid={`device-name-${device.id}`} className="text-sm text-text-primary truncate block">{device.name}</span>
                <span data-testid={`device-status-${device.id}`} className="text-xs text-text-muted">{STATUS_LABELS[device.status]}</span>
                {device.error && (
                  <span data-testid={`device-error-${device.id}`} className="text-xs text-danger block truncate">{device.error}</span>
                )}
              </div>
              {device.status === 'connected' && (
                <button
                  data-testid={`disconnect-btn-${device.id}`}
                  onClick={() => handleDisconnect(device.id)}
                  className="px-2 py-1 text-xs text-danger/80 hover:text-danger hover:bg-danger/10 rounded-md transition-colors shrink-0"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
