/**
 * Hardware Bridge — Wires the communication layer with Zustand stores.
 *
 * Connects createHardwarePort() with device-store, registering callbacks
 * for data, errors, and disconnections. Provides sendCommand() for the
 * complete UI → Store → Communication → Device → Store → UI flow.
 *
 * Requirements: 1.4, 2.2, 10.2, 10.3
 */

import type { IHardwarePort } from './hardware-port';
import { createHardwarePort } from './environment';
import { serialize, deserialize } from './serialization';
import type { HardwareCommand } from './types';
import { useDeviceStore } from '../store/device-store';

let port: IHardwarePort | null = null;
let initialized = false;

/**
 * Initializes the hardware bridge: creates the appropriate port adapter
 * and registers onData, onError, and onDisconnect callbacks.
 *
 * Safe to call multiple times — only initializes once.
 * Returns the IHardwarePort instance.
 */
export async function initBridge(): Promise<IHardwarePort> {
  if (initialized && port) {
    return port;
  }

  port = await createHardwarePort();

  // onData: deserialize incoming bytes and update confirmed params in store
  port.onData((data: Uint8Array) => {
    try {
      const response = deserialize(data);
      const store = useDeviceStore.getState();
      const connectedDevice = store.devices.find((d) => d.status === 'connected');
      if (connectedDevice) {
        // Update confirmed params based on response command type
        const paramName = commandTypeToParamName(response.type);
        if (paramName !== null && response.payload.length > 0) {
          const value = extractValue(response);
          store.updateDeviceParam(connectedDevice.id, paramName, value);
        }
      }
    } catch {
      // Deserialization errors are handled by onError or silently discarded
      // per Req 11.5 — invalid data is discarded
    }
  });

  // onError: set device error in the store
  port.onError((error: Error) => {
    const store = useDeviceStore.getState();
    const connectedDevice = store.devices.find((d) => d.status === 'connected');
    if (connectedDevice) {
      store.setDeviceError(connectedDevice.id, error.message);
    }
  });

  // onDisconnect: update device status to 'disconnected' within 2 seconds (Req 1.4)
  port.onDisconnect(() => {
    const store = useDeviceStore.getState();
    const connectedDevice = store.devices.find((d) => d.status === 'connected');
    if (connectedDevice) {
      store.updateDeviceStatus(connectedDevice.id, 'disconnected');
      store.setDeviceError(connectedDevice.id, 'Conexión perdida inesperadamente');
    }
  });

  initialized = true;
  return port;
}

/**
 * Sends a serialized command to the connected device via the hardware port.
 *
 * @param _deviceId - Target device identifier (reserved for multi-device support)
 * @param command - The HardwareCommand to serialize and send
 */
export async function sendCommand(
  _deviceId: string,
  command: HardwareCommand
): Promise<void> {
  if (!port || !port.isConnected()) {
    throw new Error('No hay conexión activa con el dispositivo.');
  }
  const bytes = serialize(command);
  await port.write(bytes);
}

/**
 * Returns the current hardware port instance, or null if not initialized.
 */
export function getPort(): IHardwarePort | null {
  return port;
}

/**
 * Resets the bridge state. Useful for testing.
 */
export function resetBridge(): void {
  port = null;
  initialized = false;
}

// --- Internal helpers ---

import { CommandType } from './types';

/** Maps a CommandType to the corresponding device param name. */
function commandTypeToParamName(type: CommandType): string | null {
  switch (type) {
    case CommandType.SetBrightness:
      return 'brightness';
    case CommandType.SetActuatorPos:
      return 'position';
    case CommandType.SetActuatorSpeed:
      return 'speed';
    case CommandType.SetVolume:
      return 'volume';
    case CommandType.SelectAudioSource:
      return 'audioSource';
    case CommandType.ToggleLight:
      return 'lightOn';
    default:
      return null;
  }
}

/** Extracts the numeric value from a deserialized command response. */
function extractValue(cmd: HardwareCommand): number {
  if (cmd.payload.length === 1) {
    return cmd.payload[0];
  }
  if (cmd.payload.length >= 2) {
    // uint16 big-endian
    return (cmd.payload[0] << 8) | cmd.payload[1];
  }
  return 0;
}
