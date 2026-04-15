/**
 * Property-based tests for I2C/SPI signal store integration and raw data conversion.
 * Feature: i2c-spi-support, Properties 12–13
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { useSignalStore } from '../store/signal-store';
import { handleI2cSensorData, handleSpiSensorData } from '../communication/bus-integration';
import { convertRawToValue } from '../utils/validation';

// ─── Property 12 ────────────────────────────────────────────────────────────

describe('Property 12: Integración de lectura de sensor con signal store', () => {
  // Feature: i2c-spi-support, Property 12: Integración de lectura de sensor con signal store
  // **Validates: Requirements 8.1, 8.2**

  beforeEach(() => {
    useSignalStore.setState({ channels: [] });
  });

  it('handleI2cSensorData creates channel with correct ID pattern and pushes sample', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0x03, max: 0x77 }),
        fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 2, maxLength: 8 }),
        fc.integer({ min: 1, max: 2_000_000_000 }),
        (busNumber, address, data, timestamp) => {
          // Reset store before each run
          useSignalStore.setState({ channels: [] });

          const reading = { busNumber, address, data, timestamp };
          handleI2cSensorData(reading);

          const addrHex = address.toString(16).padStart(2, '0');
          const expectedId = `i2c-${busNumber}-0x${addrHex}`;

          const state = useSignalStore.getState();
          const channel = state.channels.find((c) => c.id === expectedId);

          expect(channel).toBeDefined();
          expect(channel!.samples.length).toBeGreaterThanOrEqual(1);

          const lastSample = channel!.samples[channel!.samples.length - 1];
          expect(lastSample.timestamp).toBe(timestamp);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('handleSpiSensorData creates channel with correct ID pattern and pushes sample', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 2, maxLength: 8 }),
        fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 2, maxLength: 8 }),
        fc.integer({ min: 1, max: 2_000_000_000 }),
        (bus, cs, txData, rxData, timestamp) => {
          // Reset store before each run
          useSignalStore.setState({ channels: [] });

          const result = { txData, rxData, timestamp };
          handleSpiSensorData(result, bus, cs);

          const expectedId = `spi-${bus}-${cs}`;

          const state = useSignalStore.getState();
          const channel = state.channels.find((c) => c.id === expectedId);

          expect(channel).toBeDefined();
          expect(channel!.samples.length).toBeGreaterThanOrEqual(1);

          const lastSample = channel!.samples[channel!.samples.length - 1];
          expect(lastSample.timestamp).toBe(timestamp);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 13 ────────────────────────────────────────────────────────────

describe('Property 13: Conversión de datos crudos de sensor', () => {
  // Feature: i2c-spi-support, Property 13: Conversión de datos crudos de sensor
  // **Validates: Requisito 8.3**

  it('convertRawToValue for temperature produces value in [-40, 125] and is deterministic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (byte0, byte1) => {
          const data = [byte0, byte1];

          const result1 = convertRawToValue(data, 'temperature');
          const result2 = convertRawToValue(data, 'temperature');

          // Value must be in physically plausible range
          expect(result1).toBeGreaterThanOrEqual(-40);
          expect(result1).toBeLessThanOrEqual(125);

          // Deterministic: same input → same output
          expect(result1).toBe(result2);
        },
      ),
      { numRuns: 100 },
    );
  });
});
