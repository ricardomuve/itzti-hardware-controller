/**
 * Panel de alertas para mostrar alertas de umbral, sobrecarga y errores.
 * Requisitos: 3.4, 4.4, 5.5
 */

export type AlertType = 'threshold' | 'overload' | 'error';

export interface Alert {
  id: string;
  type: AlertType;
  message: string;
  timestamp: number;
  channelId?: string;
  deviceId?: string;
}

export interface AlertPanelProps {
  alerts: Alert[];
  onClear: () => void;
}

const ALERT_STYLES: Record<AlertType, { border: string; badge: string; icon: string }> = {
  threshold: { border: 'border-l-warning', badge: 'text-warning', icon: '⚠' },
  overload: { border: 'border-l-danger', badge: 'text-danger', icon: '●' },
  error: { border: 'border-l-danger', badge: 'text-danger', icon: '✕' },
};

const ALERT_LABELS: Record<AlertType, string> = {
  threshold: 'Umbral',
  overload: 'Sobrecarga',
  error: 'Error',
};

export default function AlertPanel({ alerts, onClear }: AlertPanelProps) {
  const sorted = [...alerts].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div data-testid="alert-panel">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-text-primary">
          Alertas
          {alerts.length > 0 && (
            <span className="ml-2 text-xs font-normal bg-danger/15 text-danger px-2 py-0.5 rounded-full">
              {alerts.length}
            </span>
          )}
        </h2>
        <button
          data-testid="clear-alerts-button"
          onClick={onClear}
          disabled={alerts.length === 0}
          className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40"
        >
          Limpiar
        </button>
      </div>

      {sorted.length === 0 && (
        <p data-testid="no-alerts" className="text-text-muted text-sm">No hay alertas.</p>
      )}

      <ul data-testid="alert-list" className="space-y-1">
        {sorted.map((alert) => {
          const style = ALERT_STYLES[alert.type];
          return (
            <li
              key={alert.id}
              data-testid={`alert-${alert.id}`}
              className={`flex items-start gap-2 px-3 py-2 bg-surface rounded-md border-l-3 ${style.border}`}
            >
              <span data-testid={`alert-icon-${alert.id}`} className={`${style.badge} text-sm shrink-0 mt-0.5`} role="img" aria-label={ALERT_LABELS[alert.type]}>
                {style.icon}
              </span>
              <div className="flex-1 min-w-0">
                <span data-testid={`alert-type-${alert.id}`} className={`text-xs font-semibold ${style.badge}`}>
                  {ALERT_LABELS[alert.type]}
                </span>
                <span data-testid={`alert-message-${alert.id}`} className="text-sm text-text-secondary ml-2">
                  {alert.message}
                </span>
                <div className="flex gap-3 mt-0.5 text-xs text-text-muted">
                  <span data-testid={`alert-timestamp-${alert.id}`}>
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                  {alert.channelId && (
                    <span data-testid={`alert-channel-${alert.id}`}>Canal: {alert.channelId}</span>
                  )}
                  {alert.deviceId && (
                    <span data-testid={`alert-device-${alert.id}`}>Dispositivo: {alert.deviceId}</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
