import { describe, it, expect, beforeEach } from 'vitest';
import { useDeviceStore, type DeviceState } from '../store/device-store';

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

describe('device-store', () => {
  beforeEach(() => {
    // Reset store between tests
    useDeviceStore.setState({ devices: [], error: null });
  });

  // --- addDevice ---

  it('adds a device to an empty store', () => {
    const device = makeDevice();
    useDeviceStore.getState().addDevice(device);

    const { devices } = useDeviceStore.getState();
    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual(device);
  });

  it('does not add a duplicate device with the same id', () => {
    const device = makeDevice();
    useDeviceStore.getState().addDevice(device);
    useDeviceStore.getState().addDevice({ ...device, name: 'Duplicate' });

    const { devices } = useDeviceStore.getState();
    expect(devices).toHaveLength(1);
    expect(devices[0].name).toBe('Test Device');
  });

  it('adds multiple devices with different ids', () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'a' }));
    useDeviceStore.getState().addDevice(makeDevice({ id: 'b' }));

    expect(useDeviceStore.getState().devices).toHaveLength(2);
  });

  // --- removeDevice ---

  it('removes a device by id', () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'a' }));
    useDeviceStore.getState().addDevice(makeDevice({ id: 'b' }));
    useDeviceStore.getState().removeDevice('a');

    const { devices } = useDeviceStore.getState();
    expect(devices).toHaveLength(1);
    expect(devices[0].id).toBe('b');
  });

  it('does nothing when removing a non-existent device', () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'a' }));
    useDeviceStore.getState().removeDevice('non-existent');

    expect(useDeviceStore.getState().devices).toHaveLength(1);
  });

  // --- updateDeviceStatus ---

  it('updates device connection status', () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', status: 'disconnected' }));
    useDeviceStore.getState().updateDeviceStatus('dev-1', 'connected');

    const device = useDeviceStore.getState().devices[0];
    expect(device.status).toBe('connected');
  });

  it('updates lastSeen when status changes', () => {
    const oldTime = Date.now() - 10000;
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', lastSeen: oldTime }));
    useDeviceStore.getState().updateDeviceStatus('dev-1', 'connecting');

    const device = useDeviceStore.getState().devices[0];
    expect(device.lastSeen).toBeGreaterThan(oldTime);
  });

  it('does not affect other devices when updating status', () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'a', status: 'disconnected' }));
    useDeviceStore.getState().addDevice(makeDevice({ id: 'b', status: 'disconnected' }));
    useDeviceStore.getState().updateDeviceStatus('a', 'connected');

    const devices = useDeviceStore.getState().devices;
    expect(devices.find((d) => d.id === 'a')!.status).toBe('connected');
    expect(devices.find((d) => d.id === 'b')!.status).toBe('disconnected');
  });

  // --- updateDeviceParam ---

  it('updates a device parameter', () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', params: {} }));
    useDeviceStore.getState().updateDeviceParam('dev-1', 'brightness', 75);

    const device = useDeviceStore.getState().devices[0];
    expect(device.params.brightness).toBe(75);
  });

  it('preserves existing params when adding a new one', () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', params: { volume: 50 } }));
    useDeviceStore.getState().updateDeviceParam('dev-1', 'brightness', 80);

    const device = useDeviceStore.getState().devices[0];
    expect(device.params).toEqual({ volume: 50, brightness: 80 });
  });

  it('overwrites an existing param value', () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', params: { brightness: 50 } }));
    useDeviceStore.getState().updateDeviceParam('dev-1', 'brightness', 100);

    expect(useDeviceStore.getState().devices[0].params.brightness).toBe(100);
  });

  it('updates lastSeen when param changes', () => {
    const oldTime = Date.now() - 10000;
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', lastSeen: oldTime }));
    useDeviceStore.getState().updateDeviceParam('dev-1', 'brightness', 50);

    expect(useDeviceStore.getState().devices[0].lastSeen).toBeGreaterThan(oldTime);
  });

  // --- setDeviceError ---

  it('sets an error message on a device', () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1' }));
    useDeviceStore.getState().setDeviceError('dev-1', 'Dispositivo no respondió');

    expect(useDeviceStore.getState().devices[0].error).toBe('Dispositivo no respondió');
  });

  it('clears an error by setting null', () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'dev-1', error: 'some error' }));
    useDeviceStore.getState().setDeviceError('dev-1', null);

    expect(useDeviceStore.getState().devices[0].error).toBeNull();
  });

  it('does not affect other devices when setting error', () => {
    useDeviceStore.getState().addDevice(makeDevice({ id: 'a' }));
    useDeviceStore.getState().addDevice(makeDevice({ id: 'b' }));
    useDeviceStore.getState().setDeviceError('a', 'timeout');

    expect(useDeviceStore.getState().devices.find((d) => d.id === 'a')!.error).toBe('timeout');
    expect(useDeviceStore.getState().devices.find((d) => d.id === 'b')!.error).toBeUndefined();
  });
});
