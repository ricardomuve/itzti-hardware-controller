/**
 * AuthGate — Wrapper component that reads the active role from auth-store
 * and conditionally renders UI components based on role permissions.
 *
 * Rol 'expert': Dashboard completo, BusPanel, LogPanel, KnobControl,
 *   SliderControl, PresetEditor, controles de umbrales.
 * Rol 'user': PresetSelector, gráficos en tiempo real (solo lectura),
 *   AlertPanel, controles de sesión.
 * Ambos roles: AlertPanel, botón de login/logout.
 *
 * Requisitos: 1.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
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
  /** Optional callback when login/logout button is clicked */
  onLoginLogout?: () => void;
}

/**
 * Returns the set of visible component keys for a given role.
 * Useful for testing Property 5 (role-based visibility).
 */
export function getVisibleComponents(role: UserRole): Set<string> {
  const common = new Set(['AlertPanel', 'LoginLogoutButton']);

  if (role === 'expert') {
    return new Set([
      ...common,
      'Dashboard',
      'BusPanel',
      'LogPanel',
      'KnobControl',
      'SliderControl',
      'PresetEditor',
      'ThresholdControls',
      'SignalDashboard',
      'OutputControls',
      'BiometricPanel',
      'SessionControl',
      'AudioControl',
      'BiometricWaveform',
      'SafeModeIndicator',
      'HardwareFaultBanner',
    ]);
  }

  // role === 'user'
  return new Set([
    ...common,
    'PresetSelector',
    'ReadOnlyCharts',
    'SessionControls',
    'SignalDashboard',
  ]);
}

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
    if (role === 'expert') {
      logout();
    }
    onLoginLogout?.();
  }, [role, logout, onLoginLogout]);

  return (
    <div data-testid="auth-gate" data-role={role} className="space-y-6">
      {/* Login/Logout button — visible for both roles */}
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

      {/* Expert-only components */}
      {role === 'expert' && (
        <div className="space-y-6">
          {/* Hardware fault alerts — highest priority, always visible */}
          <HardwareFaultBanner />

          {/* Biometric monitoring — top priority for tank sessions */}
          <section data-testid="expert-biometric-panel" className="bg-surface-alt rounded-xl border border-border p-5">
            <BiometricPanel />
          </section>

          {/* High-speed biometric waveform visualization */}
          <section data-testid="expert-biometric-waveform" className="bg-surface-alt rounded-xl border border-border p-5">
            <BiometricWaveform />
          </section>

          {/* Session control + Audio + Watchdog */}
          <section data-testid="expert-session-control" className="bg-surface-alt rounded-xl border border-border p-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <SessionControl />
              <AudioControl />
              <SafeModeIndicator />
            </div>
          </section>

          <section data-testid="expert-dashboard" className="bg-surface-alt rounded-xl border border-border p-5">
            <Dashboard />
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <section data-testid="expert-bus-panel" className="bg-surface-alt rounded-xl border border-border p-5">
              <BusPanel onLogEntry={handleBusLogEntry} onAlert={handleBusAlert} />
            </section>

            <section data-testid="expert-log-panel" className="bg-surface-alt rounded-xl border border-border p-5">
              <LogPanel entries={logEntries} onClear={handleClearLog} />
            </section>
          </div>

          <section data-testid="expert-preset-editor" className="bg-surface-alt rounded-xl border border-border p-5">
            <PresetEditor />
          </section>

          <section data-testid="expert-output-controls" className="bg-surface-alt rounded-xl border border-border p-5">
            <OutputControls />
          </section>

          <section data-testid="expert-threshold-controls" className="bg-surface-alt rounded-xl border border-border p-5">
            <div data-testid="threshold-controls-placeholder" className="text-text-muted text-sm">Controles de Umbrales</div>
          </section>
        </div>
      )}

      {/* User-only components */}
      {role === 'user' && (
        <section data-testid="user-preset-selector" className="bg-surface-alt rounded-xl border border-border p-5">
          <PresetSelector />
        </section>
      )}

      {/* Signal dashboard — both roles, but read-only for user */}
      <section data-testid="signal-section" className="bg-surface-alt rounded-xl border border-border p-5">
        <SignalDashboard />
      </section>

      {/* AlertPanel — visible for both roles (Req 5.6) */}
      <section data-testid="shared-alert-panel" className="bg-surface-alt rounded-xl border border-border p-5">
        <AlertPanel alerts={alerts} onClear={handleClearAlerts} />
      </section>
    </div>
  );
}
