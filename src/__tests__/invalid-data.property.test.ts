/**
 * Feature: tauri-hardware-controller, Property 11: Datos binarios inválidos producen error de deserialización
 *
 * Validates: Requirement 11.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { deserialize } from '../communication/serialization';

describe('Property 11: Datos binarios inválidos producen error de deserialización', () => {
  it('data less than 3 bytes throws error containing "Datos insuficientes"', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 2 }),
        (bytes) => {
          const data = new Uint8Array(bytes);
          expect(() => deserialize(data)).toThrowError(/Datos insuficientes/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('incomplete payload throws error containing "Payload incompleto"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),           // command type byte
        fc.integer({ min: 1, max: 65535 }),          // declared payload length (at least 1)
        fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 200 }),
        (typeByte, declaredLength, extraBytes) => {
          // Ensure actual remaining bytes are fewer than declared length
          const actualPayloadLength = Math.min(extraBytes.length, declaredLength - 1);
          const payloadBytes = extraBytes.slice(0, actualPayloadLength);

          // Build header: [type] [declaredLength big-endian]
          const header = new Uint8Array(3);
          header[0] = typeByte;
          header[1] = (declaredLength >> 8) & 0xff;
          header[2] = declaredLength & 0xff;

          // Combine header + truncated payload
          const data = new Uint8Array(3 + payloadBytes.length);
          data.set(header, 0);
          for (let i = 0; i < payloadBytes.length; i++) {
            data[3 + i] = payloadBytes[i];
          }

          expect(() => deserialize(data)).toThrowError(/Payload incompleto/);
        }
      ),
      { numRuns: 100 }
    );
  });
});
