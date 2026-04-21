/**
 * SafeModeIndicator — Indicador visual de estado del watchdog y safe mode.
 * Muestra el estado del heartbeat, permite forzar/salir de safe mode,
 * y alerta visualmente cuando el MCU entra en modo seguro.
 */

import { useState, useCallback, useEffect } from 'react';
import type { WatchdogState, SafeModeReason } from '../communication/types';
import { SAFE_MODE_PARAMS, type SafeModeParam } from '../communication/safe-mode-defaults';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

const REASON_LABELS: Record<number, string> = {
  0x01: 'Timeout de Watchdog',
  0x02: 'Activación Manual',
  0x03: 'Falla de Hardware',
  0x04: 'Sobretemperatura',
};

export default function SafeModeIndicator() {
  const [state, setState] = useState<WatchdogState>({
    heartbeatActive: false,
    mcuInSafeMode: false,
    safeModeReason: null,
    lastHeartbeatAck: 0,
    missedHeartbeats: 0,
  });

  // Poll watchdog state every 2 seconds
  useEffect(() => {
    if (!isTauri()) return;

    const poll = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const ws = await invoke<any>('watchdog_get_state');
        setState({
          heartbeatActive: ws.heartbeat_active,
          mcuInSafeMode: ws.mcu_in_safe_mode,
          safeModeReason: ws.safe_mode_reason ?? null,
          lastHeartbeatAck: ws.last_heartbeat_ack,
          missedHeartbeats: ws.missed_heartbeats,
        });
      } catch { /* not in Tauri */ }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  // Listen for safe-mode events
  useEffect(() => {
    if (!isTauri()) return;

    let cleanup: (() => void) | null = null;

    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<any>('safe-mode-entered', (event) => {
        setState((prev) => ({
          ...prev,
          mcuInSafeMode: true,
          safeModeReason: event.payload,
        }));
      });
      cleanup = unlisten;
    })();

    return () => { cleanup?.(); };
  }, []);

  const handleStart = useCallback(async () => {
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('watchdog_start');
    setState((p) => ({ ...p, heartbeatActive: true }));
  }, []);

  const handleStop = useCallback(async () => {
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('watchdog_stop');
    setState((p) => ({ ...p, heartbeatActive: false }));
  }, []);

  const handleForceSafe = useCallback(async () => {
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('watchdog_force_safe_mode');
  }, []);

  const handleExitSafe = useCallback(async () => {
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('watchdog_exit_safe_mode');
    setState((p) => ({ ...p, mcuInSafeMode: false, safeModeReason: null }));
  }, []);

  const isDevMode = !isTauri();

  return (
    <div data-testid="safe-mode-indicator" className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">🛡</span>
        <h2 className="text-sm font-bold text-text-primary tracking-wide uppercase">Watchdog</h2>
      </div>

      {/* Safe mode alert banner */}
      {state.mcuInSafeMode && (
        <div className="bg-danger/15 border border-danger/40 rounded-lg px-3 py-2 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="text-danger text-lg">⚠</span>
            <div>
              <div className="text-sm font-bold text-danger">MODO SEGURO ACTIVO</div>
              <div className="text-[10px] text-danger/80">
                {state.safeModeReason !== null
                  ? REASON_LABELS[state.safeModeReason as number] ?? 'Razón desconocida'
                  : 'Actuadores de potencia apagados'}
              </div>
            </div>
          </div>
          <button
            onClick={handleExitSafe}
            className="mt-2 w-full px-3 py-1.5 rounded text-xs font-medium bg-danger/20 text-danger hover:bg-danger/30 transition-colors"
          >
            Salir de Modo Seguro
          </button>
        </div>
      )}

      {/* Status indicators */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface rounded-lg border border-border px-2 py-1.5">
          <div className="text-[9px] text-text-muted uppercase">Heartbeat</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={`w-2 h-2 rounded-full ${
              state.heartbeatActive ? 'bg-success animate-pulse' : 'bg-border'
            }`} />
            <span className="text-xs text-text-secondary">
              {state.heartbeatActive ? 'Activo' : isDevMode ? 'Dev mode' : 'Inactivo'}
            </span>
          </div>
        </div>

        <div className="bg-surface rounded-lg border border-border px-2 py-1.5">
          <div className="text-[9px] text-text-muted uppercase">Perdidos</div>
          <span className={`text-xs font-bold tabular-nums ${
            state.missedHeartbeats > 0 ? 'text-warning' : 'text-text-secondary'
          }`}>
            {state.missedHeartbeats} / 3
          </span>
        </div>
      </div>

      {/* Control buttons */}
      <div className="flex gap-1.5">
        {!state.heartbeatActive ? (
          <button
            onClick={handleStart}
            disabled={isDevMode}
            className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-40"
          >
            Iniciar Watchdog
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium bg-warning/15 text-warning hover:bg-warning/25 transition-colors"
          >
            Detener
          </button>
        )}
        <button
          onClick={handleForceSafe}
          disabled={isDevMode || state.mcuInSafeMode}
          className="px-2 py-1.5 rounded text-[10px] font-medium bg-danger/15 text-danger hover:bg-danger/25 transition-colors disabled:opacity-40"
        >
          🛑 Safe
        </button>
      </div>

      {isDevMode && (
        <p className="text-[9px] text-text-muted">
          Watchdog disponible solo en modo Tauri (con MCU conectado).
        </p>
      )}

      {/* Safe mode parameter table */}
      {state.mcuInSafeMode && (
        <div className="space-y-1.5">
          <span className="text-[9px] text-text-muted uppercase tracking-widest">Valores de Modo Seguro</span>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {SAFE_MODE_PARAMS.map((p) => (
              <div
                key={p.paramName}
                className={`flex items-center justify-between px-2 py-1 rounded text-[10px] ${
                  p.priority === 'critical'
                    ? 'bg-danger/10 text-danger'
                    : p.priority === 'high'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-surface text-text-muted'
                }`}
              >
                <span className="font-medium">{p.label}</span>
                <span className="font-mono tabular-nums">
                  {p.safeValue}{p.unit ? ` ${p.unit}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
