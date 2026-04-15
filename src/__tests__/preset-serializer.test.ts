/**
 * Tests unitarios para el módulo preset-serializer.
 * Requisitos: 6.2, 7.3, 7.4, 7.5, 7.6
 */

import { describe, it, expect, vi } from 'vitest';
import {
  serializePresets,
  deserializePresets,
  validatePreset,
} from '../utils/preset-serializer';
import type { SessionPreset } from '../store/preset-types';

const samplePreset: SessionPreset = {
  id: 'uuid-1',
  name: 'Sesión Estándar',
  channels: [
    {
      channelId: 'temp-1',
      name: 'Temperatura Agua',
      unit: '°C',
      sampleRateHz: 2,
      thresholdMin: 34.0,
      thresholdMax: 37.0,
    },
  ],
  actuators: [
    {
      deviceId: 'heater-1',
      paramName: 'temperature',
      value: 35,
    },
  ],
};

describe('serializePresets', () => {
  it('produces JSON with version 1 and presets array', () => {
    const json = serializePresets([samplePreset]);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.presets).toHaveLength(1);
    expect(parsed.presets[0].name).toBe('Sesión Estándar');
  });

  it('serializes empty list correctly', () => {
    const json = serializePresets([]);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.presets).toEqual([]);
  });
});

describe('deserializePresets', () => {
  it('round-trips correctly with serializePresets', () => {
    const json = serializePresets([samplePreset]);
    const result = deserializePresets(json);
    expect(result).toEqual([samplePreset]);
  });

  it('returns empty array for corrupt JSON', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = deserializePresets('not valid json {{{');
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('returns empty array for valid JSON without presets field', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = deserializePresets('{"version": 1}');
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('returns empty array for JSON with non-array presets', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = deserializePresets('{"version": 1, "presets": "not-array"}');
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('validatePreset', () => {
  it('returns valid for a complete preset', () => {
    const result = validatePreset(samplePreset);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects null', () => {
    const result = validatePreset(null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects missing name', () => {
    const result = validatePreset({ channels: [{ channelId: 'a' }] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('rejects empty name', () => {
    const result = validatePreset({ name: '  ', channels: [{ channelId: 'a' }] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('rejects missing channels', () => {
    const result = validatePreset({ name: 'Test' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('channels'))).toBe(true);
  });

  it('rejects empty channels array', () => {
    const result = validatePreset({ name: 'Test', channels: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('channels'))).toBe(true);
  });

  it('rejects non-array channels', () => {
    const result = validatePreset({ name: 'Test', channels: 'not-array' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('channels'))).toBe(true);
  });

  it('rejects non-object input', () => {
    const result = validatePreset('string');
    expect(result.valid).toBe(false);
  });

  it('rejects array input', () => {
    const result = validatePreset([1, 2, 3]);
    expect(result.valid).toBe(false);
  });

  it('allows missing actuators (optional field)', () => {
    const result = validatePreset({
      name: 'Test',
      channels: [{ channelId: 'a' }],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects non-array actuators when present', () => {
    const result = validatePreset({
      name: 'Test',
      channels: [{ channelId: 'a' }],
      actuators: 'not-array',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('actuators'))).toBe(true);
  });
});
