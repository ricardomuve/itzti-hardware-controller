/**
 * Dashboard principal con layout de widgets configurable.
 * Requisitos: 4.1, 4.2, 4.3, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3
 */

import { useEffect, useState, useCallback } from 'react';
import { useDeviceStore } from '../store/device-store';
import { useSignalStore } from '../store/signal-store';
import { useAuthStore } from '../store/auth-store';
import { computeMetrics } from '../utils/metrics';
import type { DashboardLayout } from '../store/dashboard-types';
import BusPanel from './BusPanel';
import type { LogEntry } from './LogPanel';
import type { Alert } from './AlertPanel';

const LAYOUT_STORAGE_KEY = 'dashboard-layout';
const DEFAULT_LAYOUT: DashboardLayout = { widgets: [] };

export function saveLayout(layout: DashboardLayout): boolean {
  try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout)); return true; } catch { return false; }
}

export function loadLayout(): DashboardLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.widgets) ? parsed as DashboardLayout : null;
  } catch { return null; }
}

const STATUS_DOT: Record<string, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  disconnected: 'bg-danger/50',
};

export default function Dashboard() {
  const devices = useDeviceStore((s) => s.devices);
  const channels = useSignalStore((s) => s.channels);
  const role = useAuthStore((s) => s.role);
  const isExpert = role === 'expert';
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [busLogEntries, setBusLogEntries] = useState<LogEntry[]>([]);
  const [busAlerts, setBusAlerts] = useState<Alert[]>([]);

  useEffect(() => { const stored = loadLayout(); if (stored) setLayout(stored); }, []);

  const handleBusLogEntry = useCallback((entry: LogEntry) => { setBusLogEntries((prev) => [...prev, entry]); }, []);
  const handleBusAlert = useCallback((alert: Alert) => { setBusAlerts((prev) => [...prev, alert]); }, []);
  const handleSaveLayout = useCallback((newLayout: DashboardLayout) => { setLayout(newLayout); saveLayout(newLayout); }, []);

  return (
    <div data-testid="dashboard" data-role={role} className="space-y-5">
      {/* Device connection statuses */}
      <section data-testid="device-status-section">
        <h2 className="text-base font-semibold text-text-primary mb-3">Dispositivos</h2>
        {devices.length === 0 && <p className="text-text-muted text-sm">No hay dispositivos registrados.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {devices.map((device) => (
            <div key={device.id} data-testid={`device-${device.id}`} className="flex items-center gap-2 bg-surface rounded-lg border border-border px-3 py-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[device.status] || 'bg-text-muted'}`} />
              <span data-testid={`device-name-${device.id}`} className="text-sm text-text-primary truncate">{device.name}</span>
              <span data-testid={`device-status-${device.id}`} className="text-xs text-text-muted ml-auto">{device.status}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Signal values and metrics */}
      <section data-testid="signal-section" data-readonly={!isExpert}>
        <h2 className="text-base font-semibold text-text-primary mb-3">
          Señales Analógicas{!isExpert && <span className="text-text-muted font-normal text-xs ml-2">(solo lectura)</span>}
        </h2>
        {channels.length === 0 && <p className="text-text-muted text-sm">No hay señales activas.</p>}
        <div className="space-y-1">
          {channels.map((ch) => {
            const values = ch.samples.map((s) => s.value);
            const metrics = computeMetrics(values);
            const lastSample = ch.samples.length > 0 ? ch.samples[ch.samples.length - 1] : null;
            return (
              <div key={ch.id} data-testid={`signal-${ch.id}`} className="flex items-center gap-3 bg-surface rounded-lg border border-border px-3 py-2">
                <span data-testid={`signal-name-${ch.id}`} className="text-sm text-text-primary w-40 truncate">{ch.name}</span>
                <span data-testid={`signal-value-${ch.id}`} className="text-sm font-bold text-accent tabular-nums">
                  {lastSample !== null ? `${lastSample.value} ${ch.unit}` : 'Sin datos'}
                </span>
                {values.length > 0 && (
                  <span data-testid={`signal-metrics-${ch.id}`} className="text-xs text-text-muted ml-auto tabular-nums">
                    min: {metrics.min} · max: {metrics.max} · avg: {metrics.avg.toFixed(2)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Bus controls — expert only */}
      {isExpert && (
        <section data-testid="bus-section">
          <BusPanel onLogEntry={handleBusLogEntry} onAlert={handleBusAlert} />
        </section>
      )}

      {/* Widget layout */}
      <section data-testid="widget-section">
        <h2 className="text-base font-semibold text-text-primary mb-3">Widgets ({layout.widgets.length})</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {layout.widgets.map((w) => (
            <div key={w.id} data-testid={`widget-${w.id}`} className="bg-surface rounded-lg border border-border px-3 py-2 text-xs text-text-muted">
              {w.type} @ ({w.position.x},{w.position.y})
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export { LAYOUT_STORAGE_KEY, DEFAULT_LAYOUT };
export type { DashboardLayout };
