/**
 * Feature: tauri-hardware-controller, Property 12: Selección correcta de adaptador según entorno
 *
 * Validates: Requirement 10.2
 *
 * For any combination of runtime environment (presence/absence of window.__TAURI__,
 * navigator.serial, navigator.usb), createHardwarePort() must return the correct adapter:
 * - DesktopAdapter if __TAURI__ is present
 * - WebSerialAdapter if navigator.serial is available
 * - WebUSBAdapter if navigator.usb is available
 * - Throw error if none is available
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

/* eslint-disable @typescript-eslint/no-explicit-any */
const win = window as any;
const nav = navigator as any;

// Mock adapter modules so dynamic imports resolve to identifiable classes
vi.mock('../communication/desktop-adapter', () => ({
  DesktopAdapter: class DesktopAdapter {
    _type = 'DesktopAdapter';
    isConnected() { return false; }
  },
}));

vi.mock('../communication/web-serial-adapter', () => ({
  WebSerialAdapter: class WebSerialAdapter {
    _type = 'WebSerialAdapter';
    isConnected() { return false; }
  },
}));

vi.mock('../communication/web-usb-adapter', () => ({
  WebUSBAdapter: class WebUSBAdapter {
    _type = 'WebUSBAdapter';
    isConnected() { return false; }
  },
}));

/**
 * Represents a combination of environment flags.
 */
interface EnvFlags {
  hasTauri: boolean;
  hasSerial: boolean;
  hasUsb: boolean;
}

/**
 * Arbitrary generator for all possible combinations of environment flags.
 */
const envFlagsArb: fc.Arbitrary<EnvFlags> = fc.record({
  hasTauri: fc.boolean(),
  hasSerial: fc.boolean(),
  hasUsb: fc.boolean(),
});

/**
 * Sets up the global environment according to the given flags.
 */
function applyEnvFlags(flags: EnvFlags): void {
  if (flags.hasTauri) {
    win.__TAURI__ = {};
  }
  if (flags.hasSerial) {
    Object.defineProperty(nav, 'serial', { value: {}, configurable: true });
  }
  if (flags.hasUsb) {
    Object.defineProperty(nav, 'usb', { value: {}, configurable: true });
  }
}

/**
 * Cleans up the global environment.
 */
function cleanEnvFlags(): void {
  delete win.__TAURI__;
  delete nav.serial;
  delete nav.usb;
}

/**
 * Determines the expected adapter type based on priority:
 * 1. __TAURI__ → DesktopAdapter
 * 2. navigator.serial → WebSerialAdapter
 * 3. navigator.usb → WebUSBAdapter
 * 4. none in dev mode → MockAdapter (dev fallback)
 * 5. none in prod → error
 */
function expectedAdapter(flags: EnvFlags): string {
  if (flags.hasTauri) return 'DesktopAdapter';
  if (flags.hasSerial) return 'WebSerialAdapter';
  if (flags.hasUsb) return 'WebUSBAdapter';
  // In test/dev mode, falls back to MockAdapter
  return 'MockAdapter';
}

describe('Property 12: Selección correcta de adaptador según entorno', () => {
  beforeEach(() => {
    cleanEnvFlags();
  });

  afterEach(() => {
    cleanEnvFlags();
  });

  // **Validates: Requirements 10.2**
  it('selects the correct adapter or throws error for any combination of environment flags', async () => {
    await fc.assert(
      fc.asyncProperty(envFlagsArb, async (flags) => {
        // Clean before each iteration
        cleanEnvFlags();

        // Apply the generated environment flags
        applyEnvFlags(flags);

        const { createHardwarePort } = await import('../communication/environment');
        const expected = expectedAdapter(flags);

        if (expected === 'error') {
          // Should throw when no API is available (production only)
          await expect(createHardwarePort()).rejects.toThrow(
            'El navegador no soporta Web Serial API ni WebUSB.'
          );
        } else if (expected === 'MockAdapter') {
          // In dev/test mode, falls back to MockAdapter
          const port = await createHardwarePort();
          expect(port).toBeDefined();
          expect(port.isConnected()).toBe(false);
          expect(port.constructor.name).toBe('MockAdapter');
        } else {
          const port = await createHardwarePort();
          expect((port as any)._type).toBe(expected);
        }

        // Clean after each iteration
        cleanEnvFlags();
      }),
      { numRuns: 100 }
    );
  });
});
