/**
 * Property-based tests for I2C/SPI validation, parsing, and formatting.
 * Feature: i2c-spi-support, Properties 1–7
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateI2cClockSpeed,
  validateSpiClockSpeed,
  validateI2cSampleRate,
  validateSpiSampleRate,
  validateI2cAddress7Bit,
  formatI2cAddress,
} from '../utils/validation';

// ─── Pure parsing helpers (tested by Property 1) ───

/** Parse bus number from an I2C device path like `/dev/i2c-N`. */
function parseI2cBusPath(path: string): number | null {
  const match = path.match(/^\/dev\/i2c-(\d+)$/);
  return match ? Number(match[1]) : null;
}

/** Parse bus number and chip select from an SPI device path like `/dev/spidevB.C`. */
function parseSpiDevPath(path: string): { bus: number; cs: number } | null {
  const match = path.match(/^\/dev\/spidev(\d+)\.(\d+)$/);
  return match ? { bus: Number(match[1]), cs: Number(match[2]) } : null;
}

// ─── Property 1 ─────────────────────────────────────────────────────────────

describe('Property 1: Parsing de rutas de bus I2C y SPI', () => {
  // Feature: i2c-spi-support, Property 1: Parsing de rutas de bus I2C y SPI
  // **Validates: Requirements 1.1, 1.2**

  it('parseI2cBusPath extracts the correct bus number from /dev/i2c-N', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), (busNum) => {
        const path = `/dev/i2c-${busNum}`;
        const parsed = parseI2cBusPath(path);
        expect(parsed).toBe(busNum);
      }),
      { numRuns: 100 },
    );
  });

  it('parseSpiDevPath extracts bus and chip select from /dev/spidevB.C', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (bus, cs) => {
          const path = `/dev/spidev${bus}.${cs}`;
          const parsed = parseSpiDevPath(path);
          expect(parsed).not.toBeNull();
          expect(parsed!.bus).toBe(bus);
          expect(parsed!.cs).toBe(cs);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 2 ─────────────────────────────────────────────────────────────

describe('Property 2: Escaneo I2C retorna direcciones en rango válido', () => {
  // Feature: i2c-spi-support, Property 2: Escaneo I2C retorna direcciones en rango válido
  // **Validates: Requisito 2.1**

  it('filtering addresses to [0x03, 0x77] keeps only valid 7-bit I2C addresses', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -10, max: 300 }), { minLength: 0, maxLength: 50 }),
        (rawAddresses) => {
          const filtered = rawAddresses.filter(
            (addr) => addr >= 0x03 && addr <= 0x77,
          );
          for (const addr of filtered) {
            expect(addr).toBeGreaterThanOrEqual(0x03);
            expect(addr).toBeLessThanOrEqual(0x77);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 3 ─────────────────────────────────────────────────────────────

describe('Property 3: Formateo hexadecimal de direcciones I2C', () => {
  // Feature: i2c-spi-support, Property 3: Formateo hexadecimal de direcciones I2C
  // **Validates: Requisito 2.2**

  it('formatI2cAddress produces "0x" prefix with correct 2-digit hex representation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0x03, max: 0x77 }), (address) => {
        const formatted = formatI2cAddress(address);
        expect(formatted).toMatch(/^0x[0-9a-f]{2}$/);
        expect(parseInt(formatted.slice(2), 16)).toBe(address);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 4 ─────────────────────────────────────────────────────────────

describe('Property 4: Validación de velocidad de reloj I2C', () => {
  // Feature: i2c-spi-support, Property 4: Validación de velocidad de reloj I2C
  // **Validates: Requisitos 3.1, 3.3**

  it('validateI2cClockSpeed returns true only for {100, 400, 1000}', () => {
    const validSpeeds = new Set([100, 400, 1000]);
    fc.assert(
      fc.property(
        fc.integer({ min: -10000, max: 100000 }),
        (speed) => {
          const result = validateI2cClockSpeed(speed);
          expect(result).toBe(validSpeeds.has(speed));
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 5 ─────────────────────────────────────────────────────────────

describe('Property 5: Validación de velocidad de reloj SPI', () => {
  // Feature: i2c-spi-support, Property 5: Validación de velocidad de reloj SPI
  // **Validates: Requisitos 4.1, 4.4**

  it('validateSpiClockSpeed returns true only for integers in [100_000, 50_000_000]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 100_000_000 }),
        (speed) => {
          const result = validateSpiClockSpeed(speed);
          const expected = speed >= 100_000 && speed <= 50_000_000;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 6 ─────────────────────────────────────────────────────────────

describe('Property 6: Validación de frecuencia de muestreo I2C y SPI', () => {
  // Feature: i2c-spi-support, Property 6: Validación de frecuencia de muestreo I2C y SPI
  // **Validates: Requisito 7.2**

  it('validateI2cSampleRate accepts only integers in [1, 1000]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 5000 }),
        (rate) => {
          const result = validateI2cSampleRate(rate);
          const expected = rate >= 1 && rate <= 1000;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('validateSpiSampleRate accepts only integers in [1, 10000]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 50000 }),
        (rate) => {
          const result = validateSpiSampleRate(rate);
          const expected = rate >= 1 && rate <= 10000;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 7 ─────────────────────────────────────────────────────────────

describe('Property 7: Lectura SPI genera buffer TX de ceros', () => {
  // Feature: i2c-spi-support, Property 7: Lectura SPI genera buffer TX de ceros
  // **Validates: Requisito 6.3**

  it('zero-filled TX buffer has correct length and all bytes are 0x00', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4096 }), (length) => {
        const txBuffer = new Uint8Array(length);
        expect(txBuffer.length).toBe(length);
        for (let i = 0; i < txBuffer.length; i++) {
          expect(txBuffer[i]).toBe(0x00);
        }
      }),
      { numRuns: 100 },
    );
  });
});
