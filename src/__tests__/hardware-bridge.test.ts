import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IHardwarePort } from '../communication/hardware-port';
import { useDeviceStore, type DeviceState } from '../store/device-store';
import { serialize } from '../communication/serialization';
import { CommandType } from '../communication/types';

// --- Mock port factory ---

function createMockPort(): IHardwarePort & {
  _triggerData: (data: Uint8Array) => void;
  _triggerError: (error: Error) => void;
  _triggerDisconnect: () => void;
  _written: Uint8Array[];
  _connected: boolean;
} {
  let dataCallback: ((data: Uint8Array) => void) | null = null;
  let errorCallback: ((error: Error) => void) | null = null;
  let disconnectCallback: (() => void) | null = null;
  let connected = false;
  const written: Uint8Array[] = [];

  return {
    _written: written,
    get _connected() { return connected; },
    _triggerData(data: Uint8Array) { dataCallback?.(data); },
    _triggerError(error: Error) { errorCallback?.(error); },
    _triggerDisconnect() { disconnectCallback?.(); },

    listPorts: vi.fn(async () => []),
    async connect() { connected = true; },
    async disconnect() { connected = false; },
    async write(data: Uint8Array) {
      if (!connected) throw new Error('Not connected');
      written.push(data);
    },
    onData(cb) { dataCallback = cb; },
    onError(cb) { errorCallback = cb; },
    onDisconnect(cb) { disconnectCallback = cb; },
    isConnected() { return connected; },
  };
}

// --- Mock createHardwarePort ---

let mockPort: ReturnType<typeof createMockPort>;

vi.mock('../communication/environment', () => ({
  createHardwarePort: vi.fn(async () => mockPort),
  detectEnvironment: vi.fn(() => 'web'),
}));

// Import after mock setup
import { initBridge, sendCommand, resetBridge, getPort } from '../communication/hardware-bridge';

function makeDevice(overrides: Partial<DeviceState> = {}): DeviceState {
  return {
    id: 'dev-1',
    portPath: '/dev/ttyUSB0',
    name: 'Test Device',
    status: 'disconnected',
    lastSeen: Date.now(),
    params: {},
    ...overrides,
  };
}

describe('hardware-bridge', () => {
  beforeEach(() => {
    resetBridge();
    mockPort = createMockPort();
    useDeviceStore.setState({ devices: [], error: null });
  });

  it('initBridge returns a port instance', async () => {
    const port = await initBridge();
    expect(port).toBeDefined();
    expect(port.isConnected).toBeDefined();
  });

  it('initBridge is idempotent — second call returns same port', async () => {
    const port1 = await initBridge();
    const port2 = await initBridge();
    expect(port1).toBe(port2);
  });

  it('getPort returns null before init', () => {
    expect(getPort()).toBeNull();
  });

  it('getPort returns port after init', async () => {
    await initBridge();
    expect(getPort()).toBe(mockPort);
  });

  // --- onData callback: deserialize and update store ---

  it('onData deserializes response and updates device param (Req 2.2)', async () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', status: 'connected' }));
    await initBridge();

    // Simulate device confirming brightness = 75
    const responseBytes = serialize({ type: CommandType.SetBrightness, payload: [75] });
    mockPort._triggerData(responseBytes);

    const device = useDeviceStore.getState().devices[0];
    expect(device.params.brightness).toBe(75);
  });

  it('onData handles uint16 params (position)', async () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', status: 'connected' }));
    await initBridge();

    // Position = 1000 → 0x03E8 → payload [3, 232]
    const responseBytes = serialize({ type: CommandType.SetActuatorPos, payload: [0x03, 0xE8] });
    mockPort._triggerData(responseBytes);

    const device = useDeviceStore.getState().devices[0];
    expect(device.params.position).toBe(1000);
  });

  it('onData silently discards invalid data (Req 11.5)', async () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', status: 'connected' }));
    await initBridge();

    // Send only 1 byte — invalid
    mockPort._triggerData(new Uint8Array([0xFF]));

    // No error set, no crash
    const device = useDeviceStore.getState().devices[0];
    expect(device.error).toBeUndefined();
  });

  it('onData does nothing when no connected device', async () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', status: 'disconnected' }));
    await initBridge();

    const responseBytes = serialize({ type: CommandType.SetBrightness, payload: [50] });
    mockPort._triggerData(responseBytes);

    const device = useDeviceStore.getState().devices[0];
    expect(device.params.brightness).toBeUndefined();
  });

  // --- onError callback ---

  it('onError sets device error in store', async () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', status: 'connected' }));
    await initBridge();

    mockPort._triggerError(new Error('Timeout de comunicación'));

    const device = useDeviceStore.getState().devices[0];
    expect(device.error).toBe('Timeout de comunicación');
  });

  // --- onDisconnect callback (Req 1.4) ---

  it('onDisconnect updates device status to disconnected (Req 1.4)', async () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', status: 'connected' }));
    await initBridge();

    mockPort._triggerDisconnect();

    const device = useDeviceStore.getState().devices[0];
    expect(device.status).toBe('disconnected');
    expect(device.error).toBe('Conexión perdida inesperadamente');
  });

  // --- sendCommand ---

  it('sendCommand serializes and writes to port', async () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', status: 'connected' }));
    await initBridge();
    await mockPort.connect('', 9600);

    const cmd = { type: CommandType.SetVolume, payload: [80] };
    await sendCommand('dev-1', cmd);

    expect(mockPort._written).toHaveLength(1);
    const expected = serialize(cmd);
    expect(mockPort._written[0]).toEqual(expected);
  });

  it('sendCommand throws when port is not connected', async () => {
    await initBridge();
    // Port is not connected

    await expect(
      sendCommand('dev-1', { type: CommandType.SetBrightness, payload: [50] })
    ).rejects.toThrow('No hay conexión activa');
  });
});
