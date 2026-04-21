/**
 * SessionControl — Controles de inicio/parada de sesión biométrica
 * con historial de sesiones pasadas.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSessionStore } from '../store/session-store';
import { useBiometricStore } from '../store/biometric-store';

export default function SessionControl() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const loading = useSessionStore((s) => s.loading);
  const startSession = useSessionStore((s) => s.startSession);
  const endSession = useSessionStore((s) => s.endSession);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  const setSessionActive = useBiometricStore((s) => s.setSessionActive);
  const relaxationScore = useBiometricStore((s) => s.relaxationScore);

  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  // Load sessions on mount
  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Timer for active session
  useEffect(() => {
    if (!startTime) { setElapsed(0); return; }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const handleStart = useCallback(async () => {
    const id = await startSession();
    setSessionActive(true, id);
    setStartTime(Date.now());
  }, [startSession, setSessionActive]);

  const handleStop = useCallback(async () => {
    await endSession();
    setSessionActive(false);
    setStartTime(null);
    loadSessions();
  }, [endSession, setSessionActive, loadSessions]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div data-testid="session-control" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-primary tracking-wide uppercase">Sesión</h2>
        {activeSessionId && (
          <span className="text-xs font-mono text-text-muted">
            {formatDuration(elapsed)}
          </span>
        )}
      </div>

      {/* Start/Stop button */}
      <div className="flex gap-2">
        {!activeSessionId ? (
          <button
            data-testid="session-start-btn"
            onClick={handleStart}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-success/15 text-success hover:bg-success/25 transition-colors"
          >
            ▶ Iniciar Sesión
          </button>
        ) : (
          <button
            data-testid="session-stop-btn"
            onClick={handleStop}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-danger/15 text-danger hover:bg-danger/25 transition-colors"
          >
            ■ Detener Sesión
          </button>
        )}
      </div>

      {/* Active session info */}
      {activeSessionId && (
        <div className="bg-surface rounded-lg border border-success/30 px-3 py-2 space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs text-success font-medium">Sesión activa</span>
          </div>
          <div className="text-[10px] text-text-muted font-mono truncate">{activeSessionId}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-text-muted">Relajación:</span>
            <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-success transition-all duration-500"
                style={{ width: `${relaxationScore}%` }}
              />
            </div>
            <span className="text-[10px] text-text-muted tabular-nums">{relaxationScore}%</span>
          </div>
        </div>
      )}

      {/* Session history */}
      <div className="space-y-1">
        <span className="text-[10px] text-text-muted uppercase tracking-widest">Historial</span>
        {loading && <p className="text-xs text-text-muted">Cargando...</p>}
        {!loading && sessions.length === 0 && (
          <p className="text-xs text-text-muted">Sin sesiones registradas.</p>
        )}
        <div className="max-h-32 overflow-y-auto space-y-1">
          {sessions.slice(0, 10).map((s) => (
            <div key={s.id} className="flex items-center gap-2 bg-surface rounded px-2 py-1.5 text-[10px]">
              <span className={`w-1.5 h-1.5 rounded-full ${s.endedAt ? 'bg-text-muted' : 'bg-success'}`} />
              <span className="text-text-secondary">{formatDate(s.startedAt)}</span>
              <span className="text-text-muted ml-auto tabular-nums">{s.sampleCount} muestras</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
