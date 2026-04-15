/**
 * Feature: tauri-hardware-controller, Property 1: Round-trip de serialización de comandos
 *
 * Validates: Requirements 11.1, 11.2, 11.4
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { serialize, deserialize } from '../communication/serialization';
import { CommandType, type HardwareCommand } from '../communication/types';

const allCommandTypes = [
  CommandType.SetBrightness,
  CommandType.SetActuatorPos,
  CommandType.SetActuatorSpeed,
  CommandType.SetVolume,
  CommandType.SelectAudioSource,
  CommandType.ToggleLight,
  CommandType.ScanPorts,
  CommandType.Disconnect,
] as const;

/**
 * Arbitrary generator for valid HardwareCommand objects.
 * Uses fc.constantFrom() for CommandType values and
 * fc.array(fc.integer({min:0, max:255})) for payload bytes.
 */
const hardwareCommandArb: fc.Arbitrary<HardwareCommand> = fc
  .tuple(
    fc.constantFrom(...allCommandTypes),
    fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 200 })
  )
  .map(([type, payload]) => ({ type, payload }));

describe('Property 1: Round-trip de serialización de comandos', () => {
  it('deserialize(serialize(cmd)) produces an equivalent object for any valid HardwareCommand', () => {
    fc.assert(
      fc.property(hardwareCommandArb, (cmd) => {
        const serialized = serialize(cmd);
        const deserialized = deserialize(serialized);

        expect(deserialized.type).toBe(cmd.type);
        expect(deserialized.payload).toEqual(cmd.payload);
      }),
      { numRuns: 100 }
    );
  });
});
