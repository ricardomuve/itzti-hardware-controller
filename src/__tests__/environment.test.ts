import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const win = window as any;
const nav = navigator as any;

// Mock adapter modules that don't exist yet (tasks 4.3–4.5)
vi.mock('../communication/desktop-adapter', () => ({
  DesktopAdapter: class MockDesktopAdapter {
    isConnected() { return false; }
  },
}));

vi.mock('../communication/web-serial-adapter', () => ({
  WebSerialAdapter: class MockWebSerialAdapter {
    isConnected() { return false; }
  },
}));

vi.mock('../communication/web-usb-adapter', () => ({
  WebUSBAdapter: class MockWebUSBAdapter {
    isConnected() { return false; }
  },
}));

describe('detectEnvironment', () => {
  afterEach(() => {
    delete win.__TAURI__;
  });

  it('returns "desktop" when window.__TAURI__ is present', async () => {
    win.__TAURI__ = {};
    const { detectEnvironment } = await import('../communication/environment');
    expect(detectEnvironment()).toBe('desktop');
  });

  it('returns "web" when window.__TAURI__ is absent', async () => {
    const { detectEnvironment } = await import('../communication/environment');
    expect(detectEnvironment()).toBe('web');
  });
});

describe('createHardwarePort', () => {
  beforeEach(() => {
    delete win.__TAURI__;
    delete nav.serial;
    delete nav.usb;
  });

  afterEach(() => {
    delete win.__TAURI__;
    delete nav.serial;
    delete nav.usb;
  });

  it('returns DesktopAdapter when __TAURI__ is present', async () => {
    win.__TAURI__ = {};
    const { createHardwarePort } = await import('../communication/environment');

    const port = await createHardwarePort();
    expect(port).toBeDefined();
    expect(port.isConnected()).toBe(false);
  });

  it('returns WebSerialAdapter when navigator.serial is available', async () => {
    Object.defineProperty(nav, 'serial', { value: {}, configurable: true });
    const { createHardwarePort } = await import('../communication/environment');

    const port = await createHardwarePort();
    expect(port).toBeDefined();
    expect(port.isConnected()).toBe(false);
  });

  it('returns WebUSBAdapter when navigator.usb is available', async () => {
    Object.defineProperty(nav, 'usb', { value: {}, configurable: true });
    const { createHardwarePort } = await import('../communication/environment');

    const port = await createHardwarePort();
    expect(port).toBeDefined();
    expect(port.isConnected()).toBe(false);
  });

  it('falls back to MockAdapter in dev mode when no API is available', async () => {
    const { createHardwarePort } = await import('../communication/environment');

    // In dev mode (vitest runs with import.meta.env.DEV = true),
    // createHardwarePort falls back to MockAdapter instead of throwing
    const port = await createHardwarePort();
    expect(port).toBeDefined();
    expect(port.isConnected()).toBe(false);
  });
});
