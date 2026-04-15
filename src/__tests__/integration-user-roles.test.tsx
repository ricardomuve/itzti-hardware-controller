/**
 * Tests unitarios de integración — Roles de Usuario
 * Validates: Requirements 6.3, 6.5, 8.1, 8.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PresetSelector from '../components/PresetSelector';
import PresetEditor from '../components/PresetEditor';
import { usePresetStore } from '../store/preset-store';
import { useSignalStore } from '../store/signal-store';
import type { SessionPreset } from '../store/preset-types';

// Mock Tauri fs API
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn().mockResolvedValue('{"version":1,"presets":[]}'),
  writeTextFile: vi.fn().mockResolvedValue(undefined),
  BaseDirectory: { AppData: 'AppData' },
}));

// Mock uPlot (used by RealTimeChart inside SignalDashboard)
vi.mock('uplot', () => {
  const MockUPlot = vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    setData: vi.fn(),
  }));
  return { default: MockUPlot };
});
vi.mock('uplot/dist/uPlot.min.css', () => ({}));

const presetA: SessionPreset = {
  id: 'preset-a',
  name: 'Sesión Estándar',
  channels: [
    { channelId: 'temp-1', name: 'Temperatura Agua', unit: '°C', sampleRateHz: 2, thresholdMin: 34, thresholdMax: 37 },
    { channelId: 'pres-1', name: 'Presión', unit: 'Pa', sampleRateHz: 5, thresholdMin: 100, thresholdMax: 200 },
  ],
  actuators: [
    { deviceId: 'heater-1', paramName: 'temperature', value: 35 },
  ],
};

const presetB: SessionPreset = {
  id: 'preset-b',
  name: 'Sesión Nocturna',
  channels: [
    { channelId: 'light-1', name: 'Luz Ambiente', unit: 'V', sampleRateHz: 1 },
  ],
  actuators: [],
};

beforeEach(() => {
  usePresetStore.setState({
    presets: [],
    activePresetId: null,
    sessionActive: false,
    loading: false,
    error: null,
  });
  useSignalStore.setState({ channels: [] });
});

/**
 * Test 1: PresetSelector muestra lista de presets en modo solo lectura
 * Validates: Requirements 6.5, 8.1
 *
 * El Rol_Usuario ve la lista de presets disponibles sin botones de editar/eliminar,
 * y con botones para iniciar sesión.
 */
describe('PresetSelector — modo solo lectura (Req 6.5, 8.1)', () => {
  it('muestra nombres de presets y botones de iniciar sesión, sin controles de edición', () => {
    usePresetStore.setState({ presets: [presetA, presetB] });

    render(<PresetSelector />);

    // Preset names are displayed
    expect(screen.getByTestId('preset-name-preset-a')).toHaveTextContent('Sesión Estándar');
    expect(screen.getByTestId('preset-name-preset-b')).toHaveTextContent('Sesión Nocturna');

    // Start session buttons are present
    expect(screen.getByTestId('start-session-btn-preset-a')).toBeInTheDocument();
    expect(screen.getByTestId('start-session-btn-preset-b')).toBeInTheDocument();

    // No edit or delete buttons (read-only view)
    expect(screen.queryByTestId('edit-preset-btn-preset-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-preset-btn-preset-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-preset-btn-preset-b')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-preset-btn-preset-b')).not.toBeInTheDocument();
  });
});

/**
 * Test 2: Confirmación requerida antes de eliminar preset
 * Validates: Requirement 6.3
 *
 * Al hacer clic en eliminar, se llama a window.confirm.
 * Si el usuario confirma, el preset se elimina.
 * Si el usuario cancela, el preset permanece.
 */
describe('PresetEditor — confirmación antes de eliminar (Req 6.3)', () => {
  it('elimina el preset solo si el usuario confirma el diálogo', async () => {
    usePresetStore.setState({ presets: [presetA] });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<PresetEditor />);
    fireEvent.click(screen.getByTestId(`delete-preset-btn-${presetA.id}`));

    expect(confirmSpy).toHaveBeenCalledOnce();

    await waitFor(() => {
      expect(usePresetStore.getState().presets).toHaveLength(0);
    });

    confirmSpy.mockRestore();
  });

  it('no elimina el preset si el usuario cancela el diálogo', () => {
    usePresetStore.setState({ presets: [presetA] });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<PresetEditor />);
    fireEvent.click(screen.getByTestId(`delete-preset-btn-${presetA.id}`));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(usePresetStore.getState().presets).toHaveLength(1);

    confirmSpy.mockRestore();
  });
});

/**
 * Test 3: Sesión activa muestra gráficos correspondientes a canales del preset
 * Validates: Requirement 8.4
 *
 * Al iniciar sesión con un preset, signal-store debe contener los canales
 * definidos en el preset con sus tasas de muestreo y umbrales.
 */
describe('Sesión activa — canales del preset en signal-store (Req 8.4)', () => {
  it('startSession aplica los canales del preset al signal-store', () => {
    usePresetStore.setState({ presets: [presetA] });

    usePresetStore.getState().startSession(presetA.id);

    const signalState = useSignalStore.getState();

    // signal-store should have the channels from the preset
    expect(signalState.channels).toHaveLength(2);

    const tempChannel = signalState.channels.find((c) => c.id === 'temp-1');
    expect(tempChannel).toBeDefined();
    expect(tempChannel!.name).toBe('Temperatura Agua');
    expect(tempChannel!.unit).toBe('°C');
    expect(tempChannel!.sampleRateHz).toBe(2);
    expect(tempChannel!.thresholdMin).toBe(34);
    expect(tempChannel!.thresholdMax).toBe(37);

    const presChannel = signalState.channels.find((c) => c.id === 'pres-1');
    expect(presChannel).toBeDefined();
    expect(presChannel!.name).toBe('Presión');
    expect(presChannel!.unit).toBe('Pa');
    expect(presChannel!.sampleRateHz).toBe(5);
    expect(presChannel!.thresholdMin).toBe(100);
    expect(presChannel!.thresholdMax).toBe(200);

    // Session should be active
    const presetState = usePresetStore.getState();
    expect(presetState.sessionActive).toBe(true);
    expect(presetState.activePresetId).toBe(presetA.id);
  });
});
