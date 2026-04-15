/**
 * PresetSelector — Vista de solo lectura para el Rol_Usuario.
 * Muestra lista de presets disponibles, permite iniciar/detener sesiones.
 * Requisitos: 5.7, 6.5, 8.1, 8.2, 8.3, 8.4
 */

import { usePresetStore } from '../store/preset-store';

export default function PresetSelector() {
  const presets = usePresetStore((s) => s.presets);
  const activePresetId = usePresetStore((s) => s.activePresetId);
  const sessionActive = usePresetStore((s) => s.sessionActive);
  const startSession = usePresetStore((s) => s.startSession);
  const stopSession = usePresetStore((s) => s.stopSession);

  return (
    <div data-testid="preset-selector">
      <h2 className="text-base font-semibold text-text-primary mb-4">Presets de Sesión</h2>

      {sessionActive && activePresetId && (
        <div data-testid="session-active-indicator" className="flex items-center gap-2 px-3 py-2 mb-4 bg-success/10 border border-success/20 rounded-lg text-sm">
          <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
          <span className="text-text-secondary">Sesión activa:</span>
          <span className="font-medium text-success">{presets.find((p) => p.id === activePresetId)?.name ?? activePresetId}</span>
        </div>
      )}

      {presets.length === 0 && (
        <p data-testid="no-presets-message" className="text-text-muted text-sm">No hay presets disponibles.</p>
      )}

      <ul data-testid="preset-list" className="space-y-2">
        {presets.map((preset) => {
          const isActive = sessionActive && activePresetId === preset.id;
          return (
            <li
              key={preset.id}
              data-testid={`preset-item-${preset.id}`}
              className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                isActive
                  ? 'border-success/40 bg-success/5'
                  : 'border-border hover:border-border-light hover:bg-surface-hover/30'
              }`}
            >
              <span data-testid={`preset-name-${preset.id}`} className="text-sm text-text-primary">{preset.name}</span>
              {isActive ? (
                <span data-testid={`preset-active-badge-${preset.id}`} className="text-xs font-medium text-success flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-success rounded-full" /> Activo
                </span>
              ) : (
                <button
                  data-testid={`start-session-btn-${preset.id}`}
                  onClick={() => startSession(preset.id)}
                  disabled={sessionActive}
                  className="px-3 py-1.5 text-xs font-medium bg-accent/15 text-accent rounded-md hover:bg-accent/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Iniciar
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {sessionActive && (
        <button
          data-testid="stop-session-btn"
          onClick={stopSession}
          className="mt-4 w-full px-4 py-2 text-sm font-medium bg-danger/15 text-danger rounded-lg hover:bg-danger/25 transition-colors"
        >
          Detener Sesión
        </button>
      )}
    </div>
  );
}
