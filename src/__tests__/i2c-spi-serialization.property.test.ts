/**
 * Property-based tests for I2C/SPI serialization, pretty-print, and error objects.
 * Feature: i2c-spi-support, Properties 8–11
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { I2cConfig, SpiConfig, I2cAddressMode, SpiMode, SpiBitOrder } from '../communication/types';
import {
  prettyPrintI2cConfig,
  prettyPrintSpiConfig,
} from '../utils/validation';

// ─── Arbitraries ────────────────────────────────────────────────────────────

const i2cConfigArb: fc.Arbitrary<I2cConfig> = fc.record({
  busNumber: fc.integer({ min: 0, max: 255 }),
  clockSpeedKhz: fc.constantFrom(100, 400, 1000),
  addressMode: fc.constantFrom<I2cAddressMode>('SevenBit', 'TenBit'),
});

const spiConfigArb: fc.Arbitrary<SpiConfig> = fc.record({
  busNumber: fc.integer({ min: 0, max: 255 }),
  chipSelect: fc.integer({ min: 0, max: 255 }),
  clockSpeedHz: fc.integer({ min: 100_000, max: 50_000_000 }),
  mode: fc.constantFrom<SpiMode>('Mode0', 'Mode1', 'Mode2', 'Mode3'),
  bitsPerWord: fc.integer({ min: 1, max: 32 }),
  bitOrder: fc.constantFrom<SpiBitOrder>('MsbFirst', 'LsbFirst'),
});

// ─── Property 8 ─────────────────────────────────────────────────────────────

describe('Property 8: Round-trip de serialización JSON de configuración I2C', () => {
  // Feature: i2c-spi-support, Property 8: Round-trip de serialización JSON de configuración I2C
  // **Validates: Requirements 9.1, 9.2, 9.4**

  it('JSON.stringify → JSON.parse produces a deeply equal I2cConfig', () => {
    fc.assert(
      fc.property(i2cConfigArb, (config) => {
        const json = JSON.stringify(config);
        const parsed = JSON.parse(json) as I2cConfig;
        expect(parsed).toEqual(config);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 9 ─────────────────────────────────────────────────────────────

describe('Property 9: Round-trip de serialización JSON de configuración SPI', () => {
  // Feature: i2c-spi-support, Property 9: Round-trip de serialización JSON de configuración SPI
  // **Validates: Requirements 9.1, 9.2, 9.5**

  it('JSON.stringify → JSON.parse produces a deeply equal SpiConfig', () => {
    fc.assert(
      fc.property(spiConfigArb, (config) => {
        const json = JSON.stringify(config);
        const parsed = JSON.parse(json) as SpiConfig;
        expect(parsed).toEqual(config);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 10 ────────────────────────────────────────────────────────────

describe('Property 10: Pretty-print de configuraciones contiene todos los campos', () => {
  // Feature: i2c-spi-support, Property 10: Pretty-print de configuraciones contiene todos los campos
  // **Validates: Requirements 9.3, 10.4**

  it('prettyPrintI2cConfig output contains bus number, clock speed, and address mode', () => {
    fc.assert(
      fc.property(i2cConfigArb, (config) => {
        const output = prettyPrintI2cConfig(config);
        expect(output).toContain(String(config.busNumber));
        expect(output).toContain(String(config.clockSpeedKhz));
        expect(output).toContain(config.addressMode);
      }),
      { numRuns: 100 },
    );
  });

  it('prettyPrintSpiConfig output contains bus, cs, clock speed, mode, and bit order', () => {
    fc.assert(
      fc.property(spiConfigArb, (config) => {
        const output = prettyPrintSpiConfig(config);
        expect(output).toContain(String(config.busNumber));
        expect(output).toContain(String(config.chipSelect));
        expect(output).toContain(String(config.clockSpeedHz));
        expect(output).toContain(config.mode);
        expect(output).toContain(config.bitOrder);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 11 ────────────────────────────────────────────────────────────

describe('Property 11: Errores de bus contienen código y mensaje descriptivo', () => {
  // Feature: i2c-spi-support, Property 11: Errores de bus contienen código y mensaje descriptivo
  // **Validates: Requirements 10.1, 10.4**

  const errorCodeArb = fc.constantFrom(
    'BUS_NOT_FOUND',
    'PERMISSION_DENIED',
    'INVALID_CLOCK_SPEED',
    'DEVICE_NACK',
    'TIMEOUT',
    'BUS_ERROR',
    'INVALID_CONFIG',
  );

  const i2cErrorArb = fc.record({
    code: errorCodeArb,
    message: fc.tuple(
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0x03, max: 0x77 }),
    ).map(([bus, addr]) => `Error on I2C bus ${bus} at address 0x${addr.toString(16).padStart(2, '0')}`),
  });

  const spiErrorArb = fc.record({
    code: errorCodeArb,
    message: fc.tuple(
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
    ).map(([bus, cs]) => `Error on SPI bus ${bus} CS ${cs}`),
  });

  it('I2C error objects have non-empty code and message with bus/address context', () => {
    fc.assert(
      fc.property(i2cErrorArb, (error) => {
        expect(error.code.length).toBeGreaterThan(0);
        expect(error.message.length).toBeGreaterThan(0);
        expect(error.message).toMatch(/bus|address|0x/i);
      }),
      { numRuns: 100 },
    );
  });

  it('SPI error objects have non-empty code and message with bus/CS context', () => {
    fc.assert(
      fc.property(spiErrorArb, (error) => {
        expect(error.code.length).toBeGreaterThan(0);
        expect(error.message.length).toBeGreaterThan(0);
        expect(error.message).toMatch(/bus|CS/i);
      }),
      { numRuns: 100 },
    );
  });
});
