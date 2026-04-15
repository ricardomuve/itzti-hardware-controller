/**
 * Tipos de datos para presets de sesión.
 * Requisito: 6.1
 */

import type { SignalUnit } from './signal-store';

export interface PresetChannel {
  channelId: string;
  name: string;
  unit: SignalUnit;
  sampleRateHz: number;
  thresholdMin?: number;
  thresholdMax?: number;
}

export interface PresetActuator {
  deviceId: string;
  paramName: string;
  value: number;
}

export interface SessionPreset {
  id: string;
  name: string;
  channels: PresetChannel[];
  actuators: PresetActuator[];
}

export interface PresetsFile {
  version: number;
  presets: SessionPreset[];
}
