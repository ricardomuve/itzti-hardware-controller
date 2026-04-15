/**
 * SignalDashboard — Integration component that wires signal-store
 * with RealTimeChart, metrics, threshold alerts, AlertPanel, and CSV export.
 * Requisitos: 5.3, 7.2, 7.4, 7.5
 */

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useSignalStore } from '../store/signal-store';
import { computeMetrics } from '../utils/metrics';
import { checkThreshold } from '../utils/validation';
import { exportToCSV, downloadCSV } from '../utils/csv-export';
import RealTimeChart from './RealTimeChart';
import AlertPanel, { type Alert } from './AlertPanel';

export default function SignalDashboard() {
  const channels = useSignalStore((s) => s.channels);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());
  const knownChannelIdsRef = useRef<Set<string>>(new Set());

  const channelIds = useMemo(() => channels.map((ch) => ch.id), [channels]);
  const channelIdsKey = channelIds.join(',');

  useEffect(() => {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of channelIds) {
        if (!knownChannelIdsRef.current.has(id)) {
          next.add(id);
          knownChannelIdsRef.current.add(id);
          changed = true;
        }
      }
      for (const id of prev) {
        if (!channelIds.includes(id)) {
          next.delete(id);
          knownChannelIdsRef.current.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelIdsKey]);

  const handleToggleChannel = useCallback((channelId: string) => {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  }, []);

  const chartChannels = useMemo(
    () => channels.filter((ch) => selectedChannelIds.has(ch.id)).map((ch) => ({
      id: ch.id, name: ch.name, unit: ch.unit, samples: ch.samples,
    })),
    [channels, selectedChannelIds],
  );

  const channelMetrics = useMemo(
    () => channels.map((ch) => ({
      id: ch.id, name: ch.name, unit: ch.unit,
      metrics: computeMetrics(ch.samples.map((s) => s.value)),
      lastValue: ch.samples.length > 0 ? ch.samples[ch.samples.length - 1].value : null,
    })),
    [channels],
  );

  const thresholdAlerts: Alert[] = useMemo(() => {
    const result: Alert[] = [];
    for (const ch of channels) {
      if (ch.samples.length === 0) continue;
      const last = ch.samples[ch.samples.length - 1];
      if (checkThreshold(last.value, ch.thresholdMin, ch.thresholdMax)) {
        result.push({
          id: `threshold-${ch.id}`, type: 'threshold',
          message: `${ch.name}: valor ${last.value} ${ch.unit} fuera de umbral`,
          timestamp: last.timestamp, channelId: ch.id,
        });
      }
    }
    return result;
  }, [channels]);

  const allAlerts = useMemo(() => [...thresholdAlerts, ...alerts], [thresholdAlerts, alerts]);
  const handleClearAlerts = useCallback(() => setAlerts([]), []);

  const handleExportCSV = useCallback(() => {
    const csvChannels = channels.map((ch) => ({ name: ch.name, unit: ch.unit, samples: ch.samples }));
    const csv = exportToCSV(csvChannels);
    downloadCSV(csv, `signals-${Date.now()}.csv`);
  }, [channels]);

  return (
    <div data-testid="signal-dashboard" className="space-y-5">
      {/* Channel selector */}
      <section data-testid="signal-selector-section">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text-primary">Señales</h2>
          <button
            data-testid="export-csv-btn"
            onClick={handleExportCSV}
            disabled={channels.length === 0}
            className="px-3 py-1.5 text-xs font-medium bg-surface border border-border rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors disabled:opacity-40"
          >
            Exportar CSV
          </button>
        </div>
        {channels.length === 0 && <p className="text-text-muted text-sm">No hay señales disponibles.</p>}
        <div className="flex gap-3 flex-wrap">
          {channels.map((ch) => (
            <label
              key={ch.id}
              data-testid={`channel-toggle-${ch.id}`}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                selectedChannelIds.has(ch.id)
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border text-text-muted hover:border-border-light'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedChannelIds.has(ch.id)}
                onChange={() => handleToggleChannel(ch.id)}
                data-testid={`channel-checkbox-${ch.id}`}
                className="sr-only"
              />
              {ch.name} <span className="text-xs opacity-60">({ch.unit})</span>
            </label>
          ))}
        </div>
      </section>

      {/* Live chart */}
      <section data-testid="signal-chart-section" className="bg-surface rounded-lg border border-border p-4">
        <RealTimeChart channels={chartChannels} />
      </section>

      {/* Metrics cards */}
      <section data-testid="signal-metrics-section">
        <h2 className="text-base font-semibold text-text-primary mb-3">Métricas</h2>
        {channelMetrics.length === 0 && <p className="text-text-muted text-sm">No hay canales activos.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {channelMetrics.map((cm) => (
            <div key={cm.id} data-testid={`metrics-${cm.id}`} className="bg-surface rounded-lg border border-border p-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm font-medium text-text-primary">{cm.name}</span>
                <span className="text-xs text-text-muted">{cm.unit}</span>
              </div>
              <div className="text-2xl font-bold text-accent tabular-nums">
                {cm.lastValue !== null ? cm.lastValue.toFixed(2) : '—'}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-text-muted">
                <span>min <span className="text-info">{cm.metrics.min}</span></span>
                <span>max <span className="text-warning">{cm.metrics.max}</span></span>
                <span>avg <span className="text-text-secondary">{cm.metrics.avg.toFixed(2)}</span></span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Threshold alerts */}
      <section data-testid="signal-alerts-section">
        <AlertPanel alerts={allAlerts} onClear={handleClearAlerts} />
      </section>
    </div>
  );
}
