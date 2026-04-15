/**
 * Feature: tauri-hardware-controller, Property 10: Pretty-print de comandos contiene tipo y payload
 *
 * Validates: Requirements 11.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { prettyPrint } from '../communication/serialization';
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

const hardwareCommandArb: fc.Arbitrary<HardwareCommand> = fc
  .tuple(
    fc.constantFrom(...allCommandTypes),
    fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 200 })
  )
  .map(([type, payload]) => ({ type, payload }));

describe('Property 10: Pretty-print de comandos contiene tipo y payload', () => {
  it('prettyPrint output contains the CommandType name and each payload byte in hex', () => {
    fc.assert(
      fc.property(hardwareCommandArb, (cmd) => {
        const output = prettyPrint(cmd);

        // Verify the output contains the CommandType name
        const typeName = CommandType[cmd.type];
        expect(output).toContain(typeName);

        // Verify each payload byte appears in hex format
        for (const byte of cmd.payload) {
          const hex = byte.toString(16).padStart(2, '0');
          expect(output).toContain(hex);
        }
      }),
      { numRuns: 100 }
    );
  });
});
