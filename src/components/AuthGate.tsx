/**
 * AuthGate — Role-based layout for the sensory deprivation tank controller.
 *
 * Expert layout: 2-column grid optimized for session monitoring.
 *   Left (primary): Fault alerts, biometrics, waveform, signals
 *   Right (controls): Session, audio, watchdog, mixer, presets
 *   Bottom: Collapsible secondary panels (bus, logs, dashboard)
 *
 * User layout: Preset selector + read-only signals + alerts.
 *
 * Requisitos: 1.4, 4.1–4.5, 5.1–5.6
 */

import { useCallback, useState } from 'react';
import { useAuthStore, type UserRole } from '../store/auth-store';
import Dashboard from './Dashboard';
import BusPanel from './BusPanel';
import LogPanel, { type LogEntry } from './LogPanel';
import AlertPanel, { type Alert } from './AlertPanel';
import SignalDashboard from './SignalDashboard';
import PresetSelector from './PresetSelector';
import PresetEditor from './PresetEditor';
import OutputControls from './OutputControls';
import BiometricPanel from './BiometricPanel';
import SessionControl from './SessionControl';
import AudioControl from './AudioControl';
import BiometricWaveform from './BiometricWaveform';
import SafeModeIndicator from './SafeModeIndicator';
import HardwareFaultBanner from './HardwareFaultBanner';

export interface AuthGateProps {
  onLoginLogout?: () => void;
}

export function getVisibleComponents(role: UserRole): Set<string> {
  const common = new Set(['AlertPanel', 'LoginLogoutButton']);
  if (role === 'expert') {
    return new Set([
      ...common,
      'Dashboard', 'BusPanel', 'LogPanel', 'KnobControl', 'SliderControl',
      'PresetEditor', 'ThresholdControls', 'SignalDashboard', 'OutputControls',
      'BiometricPanel', 'SessionControl', 'AudioControl', 'BiometricWaveform',
      'SafeModeIndicator', 'HardwareFaultBanner',
    ]);
  }
  return new Set([
    ...common, 'PresetSelector', 'ReadOnlyCharts', 'SessionControls', 'SignalDashboard',
  ]);
}

/* ── Collapsible section wrapper ─────────────────────────────── */

function Section({
  id, title, children, defaultOpen = true, className = '',
}: {
  id: string; title: string; children: React.ReactNode;
  defaultOpen?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      data-testid={id}
      className={`bg-surface-alt rounded-xl border border-border overflow-hidden ${className}`}
    >
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-surface-hover/30 transition-colors"
      >
        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">{title}</span>
        <span className="text-text-muted text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

/* ── Main component ──────────────────────────────────────────── */

export default function AuthGate({ onLoginLogout }: AuthGateProps) {
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);

  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const handleClearLog = useCallback(() => setLogEntries([]), []);
  const handleClearAlerts = useCallback(() => setAlerts([]), []);
  const handleBusLogEntry = useCallback((entry: LogEntry) => {
    setLogEntries((prev) => [...prev, entry]);
  }, []);
  const handleBusAlert = useCallback((alert: Alert) => {
    setAlerts((prev) => [...prev, alert]);
  }, []);

  const handleLoginLogout = useCallback(() => {
    if (role === 'expert') logout();
    onLoginLogout?.();
  }, [role, logout, onLoginLogout]);

  return (
    <div data-testid="auth-gate" data-role={role} className="space-y-4">
      {/* Login/Logout — always visible */}
      <div data-testid="auth-controls" className="flex justify-end">
        <button
          data-testid="login-logout-btn"
          onClick={handleLoginLogout}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            role === 'expert'
              ? 'bg-danger/15 text-danger hover:bg-danger/25'
              : 'bg-accent/15 text-accent hover:bg-accent/25'
          }`}
        >
          {role === 'expert' ? 'Cerrar Sesión' : 'Iniciar Sesión Experto'}
        </button>
      </div>

      {/* ═══════════════ EXPERT LAYOUT ═══════════════ */}
      {role === 'expert' && (
        <div className="space-y-4">
          {/* ── STICKY: Hardware fault banner ── */}
          <div className="sticky top-0 z-10">
            <HardwareFaultBanner />
          </div>

          {/* ── PRIMARY: 2-column grid ── */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">

            {/* LEFT COLUMN: Monitoring (what the expert watches) */}
            <div className="space-y-4 min-w-0">
              <section data-testid="expert-biometric-panel" className="bg-surface-alt rounded-xl border border-border p-5">
                <BiometricPanel />
              </section>

              <section data-testid="expert-biometric-waveform" className="bg-surface-alt rounded-xl border border-border p-5">
                <BiometricWaveform />
              </section>

              <Section id="expert-output-controls" title="Mixer de Salida">
                <OutputControls />
              </Section>
            </div>

            {/* RIGHT COLUMN: Controls (what the expert operates) */}
            <div className="space-y-4">
              <section data-testid="expert-session-control" className="bg-surface-alt rounded-xl border border-border p-5 space-y-6">
                <SessionControl />
                <div className="border-t border-border/40 pt-4">
                  <SafeModeIndicator />
                </div>
              </section>

              <section className="bg-surface-alt rounded-xl border border-border p-5">
                <AudioControl />
              </section>

              <Section id="expert-preset-editor" title="Editor de Presets" defaultOpen={false}>
                <PresetEditor />
              </Section>

              <Section id="expert-threshold-controls" title="Umbrales" defaultOpen={false}>
                <div data-testid="threshold-controls-placeholder" className="text-text-muted text-sm">
                  Controles de Umbrales
                </div>
              </Section>
            </div>
          </div>

          {/* ── SECONDARY: Collapsible panels ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Section id="expert-dashboard" title="Dispositivos y Señales" defaultOpen={false}>
              <Dashboard />
            </Section>

            <Section id="expert-bus-panel" title="Bus I2C/SPI" defaultOpen={false}>
              <BusPanel onLogEntry={handleBusLogEntry} onAlert={handleBusAlert} />
            </Section>
          </div>

          <Section id="expert-log-panel" title="Log de Comunicación" defaultOpen={false}>
            <LogPanel entries={logEntries} onClear={handleClearLog} />
          </Section>
        </div>
      )}

      {/* ═══════════════ USER LAYOUT ═══════════════ */}
      {role === 'user' && (
        <section data-testid="user-preset-selector" className="bg-surface-alt rounded-xl border border-border p-5">
          <PresetSelector />
        </section>
      )}

      {/* ═══════════════ SHARED ═══════════════ */}
      <section data-testid="signal-section" className="bg-surface-alt rounded-xl border border-border p-5">
        <SignalDashboard />
      </section>

      <section data-testid="shared-alert-panel" className="bg-surface-alt rounded-xl border border-border p-5">
        <AlertPanel alerts={alerts} onClear={handleClearAlerts} />
      </section>
    </div>
  );
}
