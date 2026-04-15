/**
 * Tests for PresetEditor component.
 * Validates: Requirements 4.4, 4.6, 6.1, 6.2, 6.3, 6.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PresetEditor from '../components/PresetEditor';
import { usePresetStore } from '../store/preset-store';
import type { SessionPreset } from '../store/preset-types';

// Mock Tauri fs API so preset-store persistence doesn't throw
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn().mockResolvedValue('{"version":1,"presets":[]}'),
  writeTextFile: vi.fn().mockResolvedValue(undefined),
  BaseDirectory: { AppData: 'AppData' },
}));

// Mock uPlot
vi.mock('uplot', () => {
  const MockUPlot = vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    setData: vi.fn(),
  }));
  return { default: MockUPlot };
});
vi.mock('uplot/dist/uPlot.min.css', () => ({}));

const samplePreset: SessionPreset = {
  id: 'preset-1',
  name: 'Test Preset',
  channels: [
    { channelId: 'ch-1', name: 'Temp', unit: '°C', sampleRateHz: 2, thresholdMin: 10, thresholdMax: 40 },
  ],
  actuators: [
    { deviceId: 'dev-1', paramName: 'temperature', value: 35 },
  ],
};

beforeEach(() => {
  usePresetStore.setState({
    presets: [],
    activePresetId: null,
    sessionActive: false,
    loading: false,
    error: null,
  });
});

describe('PresetEditor — list mode', () => {
  it('should render the editor in list mode by default', () => {
    render(<PresetEditor />);
    expect(screen.getByTestId('preset-editor')).toBeInTheDocument();
    expect(screen.getByTestId('create-preset-btn')).toBeInTheDocument();
  });

  it('should show "no presets" message when list is empty', () => {
    render(<PresetEditor />);
    expect(screen.getByTestId('no-presets-message')).toBeInTheDocument();
  });

  it('should list existing presets with edit and delete buttons', () => {
    usePresetStore.setState({ presets: [samplePreset] });
    render(<PresetEditor />);
    expect(screen.getByTestId(`preset-editor-name-${samplePreset.id}`)).toHaveTextContent('Test Preset');
    expect(screen.getByTestId(`edit-preset-btn-${samplePreset.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`delete-preset-btn-${samplePreset.id}`)).toBeInTheDocument();
  });
});

describe('PresetEditor — create mode', () => {
  it('should switch to create form when "Nuevo Preset" is clicked', () => {
    render(<PresetEditor />);
    fireEvent.click(screen.getByTestId('create-preset-btn'));
    expect(screen.getByTestId('preset-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('channels-section')).toBeInTheDocument();
    expect(screen.getByTestId('actuators-section')).toBeInTheDocument();
    expect(screen.getByTestId('save-preset-btn')).toHaveTextContent('Crear Preset');
  });

  it('should show validation errors when saving with empty name (Req 6.2)', () => {
    render(<PresetEditor />);
    fireEvent.click(screen.getByTestId('create-preset-btn'));
    // Leave name empty, click save
    fireEvent.click(screen.getByTestId('save-preset-btn'));
    expect(screen.getByTestId('validation-errors')).toBeInTheDocument();
  });

  it('should return to list mode when cancel is clicked', () => {
    render(<PresetEditor />);
    fireEvent.click(screen.getByTestId('create-preset-btn'));
    fireEvent.click(screen.getByTestId('cancel-btn'));
    expect(screen.getByTestId('create-preset-btn')).toBeInTheDocument();
  });

  it('should add and remove channels', () => {
    render(<PresetEditor />);
    fireEvent.click(screen.getByTestId('create-preset-btn'));
    // Initially one channel row
    expect(screen.getByTestId('channel-row-0')).toBeInTheDocument();
    // Add another
    fireEvent.click(screen.getByTestId('add-channel-btn'));
    expect(screen.getByTestId('channel-row-1')).toBeInTheDocument();
    // Remove second
    fireEvent.click(screen.getByTestId('remove-channel-btn-1'));
    expect(screen.queryByTestId('channel-row-1')).not.toBeInTheDocument();
  });

  it('should add and remove actuators', () => {
    render(<PresetEditor />);
    fireEvent.click(screen.getByTestId('create-preset-btn'));
    // Initially no actuator rows
    expect(screen.queryByTestId('actuator-row-0')).not.toBeInTheDocument();
    // Add one
    fireEvent.click(screen.getByTestId('add-actuator-btn'));
    expect(screen.getByTestId('actuator-row-0')).toBeInTheDocument();
    // Remove it
    fireEvent.click(screen.getByTestId('remove-actuator-btn-0'));
    expect(screen.queryByTestId('actuator-row-0')).not.toBeInTheDocument();
  });

  it('should create a preset successfully with valid data (Req 4.4, 6.1)', async () => {
    render(<PresetEditor />);
    fireEvent.click(screen.getByTestId('create-preset-btn'));

    // Fill in name
    fireEvent.change(screen.getByTestId('preset-name-input'), { target: { value: 'Mi Preset' } });
    // Fill in channel
    fireEvent.change(screen.getByTestId('channel-id-0'), { target: { value: 'ch-1' } });
    fireEvent.change(screen.getByTestId('channel-name-0'), { target: { value: 'Temp' } });
    fireEvent.change(screen.getByTestId('channel-samplerate-0'), { target: { value: '5' } });

    fireEvent.click(screen.getByTestId('save-preset-btn'));

    await waitFor(() => {
      // Should return to list mode with the new preset
      expect(screen.getByTestId('preset-editor-list')).toBeInTheDocument();
      expect(usePresetStore.getState().presets).toHaveLength(1);
      expect(usePresetStore.getState().presets[0].name).toBe('Mi Preset');
    });
  });
});

describe('PresetEditor — edit mode', () => {
  it('should populate form with preset data when editing', () => {
    usePresetStore.setState({ presets: [samplePreset] });
    render(<PresetEditor />);
    fireEvent.click(screen.getByTestId(`edit-preset-btn-${samplePreset.id}`));

    expect(screen.getByTestId('preset-name-input')).toHaveValue('Test Preset');
    expect(screen.getByTestId('save-preset-btn')).toHaveTextContent('Guardar Cambios');
    expect(screen.getByTestId('channel-id-0')).toHaveValue('ch-1');
    expect(screen.getByTestId('actuator-deviceid-0')).toHaveValue('dev-1');
  });

  it('should update a preset successfully', async () => {
    usePresetStore.setState({ presets: [samplePreset] });
    render(<PresetEditor />);
    fireEvent.click(screen.getByTestId(`edit-preset-btn-${samplePreset.id}`));

    fireEvent.change(screen.getByTestId('preset-name-input'), { target: { value: 'Updated Preset' } });
    fireEvent.click(screen.getByTestId('save-preset-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('preset-editor-list')).toBeInTheDocument();
      expect(usePresetStore.getState().presets[0].name).toBe('Updated Preset');
    });
  });
});

describe('PresetEditor — delete with confirmation (Req 6.3)', () => {
  it('should call window.confirm before deleting a preset', async () => {
    usePresetStore.setState({ presets: [samplePreset] });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<PresetEditor />);
    fireEvent.click(screen.getByTestId(`delete-preset-btn-${samplePreset.id}`));

    expect(confirmSpy).toHaveBeenCalledWith('¿Eliminar el preset "Test Preset"?');

    await waitFor(() => {
      expect(usePresetStore.getState().presets).toHaveLength(0);
    });

    confirmSpy.mockRestore();
  });

  it('should NOT delete when user cancels confirmation dialog', () => {
    usePresetStore.setState({ presets: [samplePreset] });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<PresetEditor />);
    fireEvent.click(screen.getByTestId(`delete-preset-btn-${samplePreset.id}`));

    expect(confirmSpy).toHaveBeenCalled();
    expect(usePresetStore.getState().presets).toHaveLength(1);

    confirmSpy.mockRestore();
  });
});
