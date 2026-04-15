/**
 * Panel de log de depuración para mostrar errores de serialización.
 * Requisitos: 11.3, 11.5
 */

export type LogLevel = 'info' | 'warning' | 'error';

export interface LogEntry {
  id: string;
  timestamp: number;
  hexBytes: string;
  description: string;
  level: LogLevel;
}

export interface LogPanelProps {
  entries: LogEntry[];
  onClear: () => void;
}

const LEVEL_STYLES: Record<LogLevel, { border: string; text: string }> = {
  info: { border: 'border-l-info', text: 'text-info' },
  warning: { border: 'border-l-warning', text: 'text-warning' },
  error: { border: 'border-l-danger', text: 'text-danger' },
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  info: 'INFO',
  warning: 'WARN',
  error: 'ERROR',
};

export default function LogPanel({ entries, onClear }: LogPanelProps) {
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div data-testid="log-panel">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-text-primary">
          Log de Depuración
          {entries.length > 0 && (
            <span className="ml-2 text-xs font-normal text-text-muted">({entries.length})</span>
          )}
        </h2>
        <button
          data-testid="clear-log-button"
          onClick={onClear}
          disabled={entries.length === 0}
          className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40"
        >
          Limpiar
        </button>
      </div>

      {sorted.length === 0 && (
        <p data-testid="no-log-entries" className="text-text-muted text-sm">No hay entradas en el log.</p>
      )}

      <ul data-testid="log-list" className="space-y-1 font-mono text-xs max-h-64 overflow-y-auto">
        {sorted.map((entry) => {
          const style = LEVEL_STYLES[entry.level];
          return (
            <li
              key={entry.id}
              data-testid={`log-${entry.id}`}
              className={`px-3 py-1.5 bg-surface rounded-md border-l-3 ${style.border}`}
            >
              <span data-testid={`log-level-${entry.id}`} className={`font-bold ${style.text}`}>
                [{LEVEL_LABELS[entry.level]}]
              </span>{' '}
              <span data-testid={`log-timestamp-${entry.id}`} className="text-text-muted">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>{' '}
              <span data-testid={`log-hex-${entry.id}`} className="text-purple-400">
                [{entry.hexBytes}]
              </span>{' '}
              <span data-testid={`log-description-${entry.id}`} className="text-text-secondary">
                {entry.description}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
