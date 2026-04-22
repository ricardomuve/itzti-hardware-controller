/**
 * App.tsx — Root component that wires all sub-components together.
 * Initializes the hardware bridge on mount, handles incompatible browsers,
 * and lays out AuthGate (role-based rendering), DeviceList, and PinDialog.
 * Requisitos: 1.1, 2.5, 3.2, 7.2, 9.5, 10.2
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { initBridge } from './communication/hardware-bridge';
import { isMockMode } from './communication/environment';
import type { IHardwarePort } from './communication/hardware-port';
import { useSignalStore } from './store/signal-store';
import { useAuthStore } from './store/auth-store';
import { usePresetStore } from './store/preset-store';
import { useBiometricStore } from './store/biometric-store';
import { useSessionStore } from './store/session-store';
import AuthGate from './components/AuthGate';
import PinDialog, { type PinDialogMode } from './components/PinDialog';
import DeviceList from './components/DeviceList';

type BridgeState =
  | { status: 'loading' }
  | { status: 'ready'; port: IHardwarePort }
  | { status: 'error'; message: string };

export default function App() {
  const [bridge, setBridge] = useState<BridgeState>({ status: 'loading' });
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDialogMode, setPinDialogMode] = useState<PinDialogMode>('login');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const signalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const role = useAuthStore((s) => s.role);
  const pinHashExists = useAuthStore((s) => s.pinHashExists);

  // Live status values for the header bar (must be before early returns — React hook rules)
  const relaxationScore = useBiometricStore((s) => s.relaxationScore);
  const sessionActive = useSessionStore((s) => s.activeSessionId);
  const channelCount = useSignalStore((s) => s.channels.length);

  // Load PIN status and presets on mount (Req 2.5, 7.2)
  useEffect(() => {
    const loadInitialData = async () => {
      await useAuthStore.getState().loadPinStatus();
      await usePresetStore.getState().loadPresets();
    };
    loadInitialData();
  }, []);

  // Auto-show PinDialog in setup mode if no PIN exists (Req 2.5)
  useEffect(() => {
    if (!pinHashExists && bridge.status === 'ready') {
      setPinDialogMode('setup');
      setPinDialogOpen(true);
    }
  }, [pinHashExists, bridge.status]);

  useEffect(() => {
    let cancelled = false;

    initBridge()
      .then((port) => {
        if (!cancelled) {
          setBridge({ status: 'ready', port });

          // In mock/dev mode, seed signal channels and simulate data
          if (isMockMode() || import.meta.env.DEV) {
            seedSignalChannels();
            signalIntervalRef.current = startSignalSimulation();
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Error desconocido al inicializar.';
          setBridge({ status: 'error', message });
        }
      });

    return () => {
      cancelled = true;
      if (signalIntervalRef.current) {
        clearInterval(signalIntervalRef.current);
      }
    };
  }, []);

  const handleLoginLogout = useCallback(() => {
    if (role === 'user') {
      setPinDialogMode('login');
      setPinDialogOpen(true);
    }
    // logout is handled inside AuthGate's onLoginLogout callback
  }, [role]);

  const handlePinDialogClose = useCallback(() => {
    setPinDialogOpen(false);
  }, []);

  // Incompatible browser — Req 9.5
  if (bridge.status === 'error') {
    return (
      <div data-testid="app-error" className="min-h-screen flex items-center justify-center p-8">
        <div data-testid="incompatible-message" role="alert" className="max-w-lg bg-surface-alt border border-danger/30 rounded-xl p-6 text-center">
          <h1 className="text-2xl font-bold text-danger mb-2">Navegador no compatible</h1>
          <p className="text-text-secondary mb-3">{bridge.message}</p>
          <p className="text-text-muted text-sm">
            Para usar esta aplicación en modo web, necesitas un navegador compatible con
            Web Serial API o WebUSB (Chrome 89+, Edge 89+).
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (bridge.status === 'loading') {
    return (
      <div data-testid="app-loading" className="min-h-screen flex flex-col items-center justify-center gap-4">
        <img src="/logo.png" alt="ItztI logo" className="w-12 h-12 object-contain animate-pulse" />
        <p className="text-text-secondary text-sm">Inicializando comunicación con hardware…</p>
      </div>
    );
  }

  const { port } = bridge;

  return (
    <div data-testid="app" className="min-h-screen flex flex-col">
      {/* Top header bar — shows live session status */}
      <header className="bg-surface-alt border-b border-border px-4 md:px-6 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-1 text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Toggle sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="5" x2="17" y2="5" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="15" x2="17" y2="15" />
            </svg>
          </button>
          <img src="/logo.png" alt="ItztI logo" className="w-7 h-7 object-contain" />
          <h1 className="text-lg font-semibold text-text-primary tracking-tight">ItztI</h1>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            role === 'expert' ? 'bg-accent/15 text-accent' : 'bg-surface text-text-muted'
          }`}>
            {role === 'expert' ? 'Experto' : 'Usuario'}
          </span>
        </div>

        {/* Live status indicators — visible when expert */}
        {role === 'expert' && (
          <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono">
            {sessionActive && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/10">
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                <span className="text-success">SESIÓN</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface">
              <span className="text-text-muted">Relax</span>
              <span className={`font-bold ${
                relaxationScore > 60 ? 'text-success' : relaxationScore > 30 ? 'text-warning' : 'text-text-secondary'
              }`}>{relaxationScore}%</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface">
              <span className="text-text-muted">CH</span>
              <span className="text-text-secondary">{channelCount}</span>
            </div>
          </div>
        )}
      </header>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — narrow on desktop, drawer on mobile */}
        <aside className={`
          fixed md:static inset-y-0 left-0 z-30
          w-64 bg-surface-alt border-r border-border overflow-y-auto shrink-0
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
          top-[45px] md:top-0
        `}>
          <section data-testid="section-devices" className="p-3">
            <DeviceList hardwarePort={port} />
          </section>
        </aside>

        {/* Main dashboard area */}
        <main className="flex-1 overflow-y-auto p-3 md:p-5" data-testid="section-dashboard">
          <AuthGate onLoginLogout={handleLoginLogout} />
        </main>
      </div>

      <PinDialog
        mode={pinDialogMode}
        open={pinDialogOpen}
        onClose={handlePinDialogClose}
      />
    </div>
  );
}

// --- Mock mode helpers ---

function seedSignalChannels() {
  const store = useSignalStore.getState();
  store.addChannel({
    id: 'temp-1',
    name: 'Temperatura Sensor 1',
    unit: '°C',
    sampleRateHz: 2,
    thresholdMin: 15,
    thresholdMax: 35,
    samples: [],
  });
  store.addChannel({
    id: 'voltage-1',
    name: 'Voltaje Fuente',
    unit: 'V',
    sampleRateHz: 2,
    thresholdMin: 4.5,
    thresholdMax: 5.5,
    samples: [],
  });
  store.addChannel({
    id: 'current-1',
    name: 'Corriente Motor',
    unit: 'A',
    sampleRateHz: 2,
    thresholdMin: 0,
    thresholdMax: 2.0,
    samples: [],
  });
  // Output control channels — driven by mixer faders
  store.addChannel({
    id: 'out-brightness',
    name: 'Brillo Salida',
    unit: '%',
    sampleRateHz: 2,
    thresholdMin: 0,
    thresholdMax: 100,
    samples: [],
  });
  store.addChannel({
    id: 'out-volume',
    name: 'Volumen Salida',
    unit: 'dB',
    sampleRateHz: 2,
    thresholdMin: 0,
    thresholdMax: 100,
    samples: [],
  });
  store.addChannel({
    id: 'out-actuator-speed',
    name: 'Velocidad Actuador',
    unit: 'rpm',
    sampleRateHz: 2,
    thresholdMin: 0,
    thresholdMax: 800,
    samples: [],
  });
  // Biometric channels — sensory deprivation tank
  store.addChannel({
    id: 'bio-eeg-alpha',
    name: 'EEG Alpha',
    unit: 'µV',
    sampleRateHz: 10,
    thresholdMin: 5,
    thresholdMax: 50,
    samples: [],
  });
  store.addChannel({
    id: 'bio-pulse',
    name: 'Pulso Cardíaco',
    unit: 'bpm',
    sampleRateHz: 2,
    thresholdMin: 50,
    thresholdMax: 100,
    samples: [],
  });
  store.addChannel({
    id: 'bio-temp',
    name: 'Temp. Corporal',
    unit: '°C',
    sampleRateHz: 1,
    thresholdMin: 35.5,
    thresholdMax: 37.5,
    samples: [],
  });
  store.addChannel({
    id: 'bio-gsr',
    name: 'GSR (Conductancia)',
    unit: 'µS',
    sampleRateHz: 2,
    thresholdMin: 0.5,
    thresholdMax: 15,
    samples: [],
  });
  store.addChannel({
    id: 'bio-spo2',
    name: 'SpO2',
    unit: 'SpO2',
    sampleRateHz: 1,
    thresholdMin: 94,
    thresholdMax: 100,
    samples: [],
  });
}

function startSignalSimulation(): ReturnType<typeof setInterval> {
  let tick = 0;
  return setInterval(() => {
    tick++;
    const now = Date.now();
    const store = useSignalStore.getState();

    // Temperature: 22-28°C with slow sine wave
    store.pushSample('temp-1', {
      timestamp: now,
      value: parseFloat((25 + 3 * Math.sin(tick * 0.05) + (Math.random() - 0.5) * 0.5).toFixed(2)),
    });

    // Voltage: ~5V with small noise, dips slightly under load
    const speedChannel = store.channels.find((c) => c.id === 'out-actuator-speed');
    const speedVal = speedChannel?.samples.length
      ? speedChannel.samples[speedChannel.samples.length - 1].value
      : 0;
    const loadFactor = speedVal / 1000; // 0..1
    store.pushSample('voltage-1', {
      timestamp: now,
      value: parseFloat((5.0 - loadFactor * 0.3 + 0.1 * Math.sin(tick * 0.08) + (Math.random() - 0.5) * 0.05).toFixed(3)),
    });

    // Current: correlates with actuator speed (more speed = more current)
    store.pushSample('current-1', {
      timestamp: now,
      value: parseFloat((0.2 + loadFactor * 1.5 + 0.5 * Math.sin(tick * 0.12) + (Math.random() - 0.5) * 0.1).toFixed(3)),
    });

    // --- Biometric simulation ---
    // EEG Alpha: simulates gradual relaxation over time (increases slowly)
    const relaxPhase = Math.min(tick * 0.002, 1); // 0→1 over ~500 ticks
    const alphaBase = 10 + relaxPhase * 25; // 10→35 µV as session progresses
    store.pushSample('bio-eeg-alpha', {
      timestamp: now,
      value: parseFloat((alphaBase + 5 * Math.sin(tick * 0.03) + (Math.random() - 0.5) * 3).toFixed(1)),
    });

    // Pulse: starts ~75 bpm, gradually decreases to ~60 as relaxation deepens
    const pulseBase = 75 - relaxPhase * 15;
    store.pushSample('bio-pulse', {
      timestamp: now,
      value: parseFloat((pulseBase + 3 * Math.sin(tick * 0.04) + (Math.random() - 0.5) * 2).toFixed(0)),
    });

    // Body temperature: stable around 36.5°C with tiny drift
    store.pushSample('bio-temp', {
      timestamp: now,
      value: parseFloat((36.5 + 0.3 * Math.sin(tick * 0.01) + (Math.random() - 0.5) * 0.1).toFixed(1)),
    });

    // GSR: decreases as relaxation deepens (less skin conductance)
    const gsrBase = 8 - relaxPhase * 4; // 8→4 µS
    store.pushSample('bio-gsr', {
      timestamp: now,
      value: parseFloat((gsrBase + 1.5 * Math.sin(tick * 0.06) + (Math.random() - 0.5) * 0.5).toFixed(2)),
    });

    // SpO2: stable 96-99%
    store.pushSample('bio-spo2', {
      timestamp: now,
      value: parseFloat((97.5 + Math.sin(tick * 0.02) + (Math.random() - 0.5) * 0.5).toFixed(1)),
    });

    // Update biometric store with simulated EEG bands
    const bioStore = useBiometricStore.getState();
    bioStore.setLatestEegBands({
      delta: parseFloat((5 + relaxPhase * 10 + (Math.random() - 0.5) * 2).toFixed(1)),
      theta: parseFloat((8 + relaxPhase * 12 + (Math.random() - 0.5) * 2).toFixed(1)),
      alpha: parseFloat((alphaBase + (Math.random() - 0.5) * 3).toFixed(1)),
      beta: parseFloat((15 - relaxPhase * 8 + (Math.random() - 0.5) * 2).toFixed(1)),
      gamma: parseFloat((5 - relaxPhase * 3 + (Math.random() - 0.5) * 1).toFixed(1)),
    });
    // Simulate relaxation score
    bioStore.setRelaxationScore(parseFloat((relaxPhase * 80 + (Math.random() - 0.5) * 10).toFixed(0)));
  }, 500);
}
