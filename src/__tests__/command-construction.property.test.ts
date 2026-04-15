/**
 * Feature: tauri-hardware-controller, Property 2: Construcción correcta de comandos para cualquier tipo y valor de parámetro
 *
 * Validates: Requirements 2.1, 3.1, 4.1
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { serialize, deserialize } from '../communication/serialization';
import { CommandType, type HardwareCommand } from '../communication/types';

/**
 * Helper: extract the parameter value from a deserialized command payload.
 * - 1-byte payloads: value is the single byte
 * - 2-byte payloads: value is uint16 big-endian (high << 8 | low)
 */
function extractValue(payload: number[]): number {
  if (payload.length === 1) return payload[0];
  if (payload.length === 2) return (payload[0] << 8) | payload[1];
  throw new Error(`Unexpected payload length: ${payload.length}`);
}

/**
 * Helper: build payload bytes for a uint16 value (big-endian).
 */
function uint16Payload(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

describe('Property 2: Construcción correcta de comandos para cualquier tipo y valor de parámetro', () => {
  it('SetBrightness: payload contains the brightness value (0-100)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (brightness) => {
        const cmd: HardwareCommand = {
          type: CommandType.SetBrightness,
          payload: [brightness],
        };

        const deserialized = deserialize(serialize(cmd));

        expect(deserialized.type).toBe(CommandType.SetBrightness);
        expect(deserialized.payload).toEqual([brightness]);
        expect(extractValue(deserialized.payload)).toBe(brightness);
      }),
      { numRuns: 100 }
    );
  });

  it('SetActuatorPos: payload contains the position as uint16 big-endian (0-65535)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 65535 }), (position) => {
        const cmd: HardwareCommand = {
          type: CommandType.SetActuatorPos,
          payload: uint16Payload(position),
        };

        const deserialized = deserialize(serialize(cmd));

        expect(deserialized.type).toBe(CommandType.SetActuatorPos);
        expect(deserialized.payload).toEqual(uint16Payload(position));
        expect(extractValue(deserialized.payload)).toBe(position);
      }),
      { numRuns: 100 }
    );
  });

  it('SetActuatorSpeed: payload contains the speed as uint16 big-endian (0-65535)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 65535 }), (speed) => {
        const cmd: HardwareCommand = {
          type: CommandType.SetActuatorSpeed,
          payload: uint16Payload(speed),
        };

        const deserialized = deserialize(serialize(cmd));

        expect(deserialized.type).toBe(CommandType.SetActuatorSpeed);
        expect(deserialized.payload).toEqual(uint16Payload(speed));
        expect(extractValue(deserialized.payload)).toBe(speed);
      }),
      { numRuns: 100 }
    );
  });

  it('SetVolume: payload contains the volume value (0-100)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (volume) => {
        const cmd: HardwareCommand = {
          type: CommandType.SetVolume,
          payload: [volume],
        };

        const deserialized = deserialize(serialize(cmd));

        expect(deserialized.type).toBe(CommandType.SetVolume);
        expect(deserialized.payload).toEqual([volume]);
        expect(extractValue(deserialized.payload)).toBe(volume);
      }),
      { numRuns: 100 }
    );
  });

  it('SelectAudioSource: payload contains the channel value (0-255)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), (channel) => {
        const cmd: HardwareCommand = {
          type: CommandType.SelectAudioSource,
          payload: [channel],
        };

        const deserialized = deserialize(serialize(cmd));

        expect(deserialized.type).toBe(CommandType.SelectAudioSource);
        expect(deserialized.payload).toEqual([channel]);
        expect(extractValue(deserialized.payload)).toBe(channel);
      }),
      { numRuns: 100 }
    );
  });

  it('ToggleLight: payload contains the toggle value (0 or 1)', () => {
    fc.assert(
      fc.property(fc.constantFrom(0, 1), (toggle) => {
        const cmd: HardwareCommand = {
          type: CommandType.ToggleLight,
          payload: [toggle],
        };

        const deserialized = deserialize(serialize(cmd));

        expect(deserialized.type).toBe(CommandType.ToggleLight);
        expect(deserialized.payload).toEqual([toggle]);
        expect(extractValue(deserialized.payload)).toBe(toggle);
      }),
      { numRuns: 100 }
    );
  });
});
