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
import { useCheckbackStore } from '../store/checkback-store';

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
      const checkback = useCheckbackStore.getState();
      const connectedDevice = store.devices.find((d) => d.status === 'connected');
      if (connectedDevice) {
        const paramName = commandTypeToParamName(response.type);
        if (paramName !== null && response.payload.length > 0) {
          const value = extractValue(response);
          // Update confirmed param in device store
          store.updateDeviceParam(connectedDevice.id, paramName, value);
          // Feed ACK into check-back system for verification
          checkback.handleAck(connectedDevice.id, paramName, value);
        }
      }
    } catch {
      // Deserialization errors are handled by onError or silently discarded
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

  // Wire up check-back retry callback
  useCheckbackStore.getState().setRetryCallback((deviceId, paramName, value) => {
    const cmdType = paramNameToCommandType(paramName);
    if (cmdType !== null) {
      const payload = buildPayload(cmdType, value);
      // Stagger retries by 50ms to avoid serial buffer saturation
      // when multiple CRITICAL params retry simultaneously
      const delay = getRetryPriority(paramName) === 'critical' ? 0 : 50;
      setTimeout(() => {
        sendCommand(deviceId, { type: cmdType, payload }).catch(() => {
          // Retry send failed — will be caught by timeout checker
        });
      }, delay);
    }
  });

  // Start periodic timeout checker (every 1s)
  setInterval(() => {
    useCheckbackStore.getState().checkTimeouts();
  }, 1000);

  return port;
}

/**
 * Sends a serialized command to the connected device via the hardware port.
 * Registers the command in the check-back store for ACK verification.
 *
 * SAFETY: Blocks actuator commands when MCU is in safe mode.
 * Only Heartbeat, EnterSafeMode, ExitSafeMode, and SafeModeAck are allowed through.
 *
 * @param deviceId - Target device identifier
 * @param command - The HardwareCommand to serialize and send
 */
export async function sendCommand(
  deviceId: string,
  command: HardwareCommand
): Promise<void> {
  if (!port || !port.isConnected()) {
    throw new Error('No hay conexión activa con el dispositivo.');
  }

  // SAFE MODE GUARD: block actuator commands during safe mode
  const isControlCommand = command.type !== CommandType.Heartbeat
    && command.type !== CommandType.EnterSafeMode
    && command.type !== CommandType.ExitSafeMode
    && command.type !== CommandType.SafeModeAck
    && command.type !== CommandType.ScanPorts
    && command.type !== CommandType.Disconnect;

  if (isControlCommand && _safeModeActive) {
    throw new Error(
      `Comando ${CommandType[command.type]} bloqueado: MCU en modo seguro. ` +
      'Los valores de safe_mode_defaults tienen prioridad absoluta.'
    );
  }

  // Register in check-back store before sending
  const paramName = commandTypeToParamName(command.type);
  if (paramName !== null && command.payload.length > 0) {
    const value = extractValue(command);
    useCheckbackStore.getState().registerCommand(deviceId, paramName, value);
  }

  const bytes = serialize(command);
  await port.write(bytes);
}

/** Safe mode flag — set by watchdog events, blocks actuator commands */
let _safeModeActive = false;

/** Called by the watchdog event listener to update the safe mode flag */
export function setSafeModeActive(active: boolean): void {
  _safeModeActive = active;
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
    case CommandType.Heartbeat:
    case CommandType.EnterSafeMode:
    case CommandType.ExitSafeMode:
    case CommandType.SafeModeAck:
      return null; // handled separately by watchdog
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

/** Reverse mapping: param name → CommandType for retries. */
function paramNameToCommandType(paramName: string): CommandType | null {
  switch (paramName) {
    case 'brightness': return CommandType.SetBrightness;
    case 'position': return CommandType.SetActuatorPos;
    case 'speed': return CommandType.SetActuatorSpeed;
    case 'volume': return CommandType.SetVolume;
    case 'audioSource': return CommandType.SelectAudioSource;
    case 'lightOn': return CommandType.ToggleLight;
    default: return null;
  }
}

/** Builds the payload array for a given command type and value. */
function buildPayload(type: CommandType, value: number): number[] {
  switch (type) {
    case CommandType.SetBrightness:
    case CommandType.SetVolume:
    case CommandType.SelectAudioSource:
    case CommandType.ToggleLight:
      return [value & 0xff];
    case CommandType.SetActuatorPos:
    case CommandType.SetActuatorSpeed:
      return [(value >> 8) & 0xff, value & 0xff];
    default:
      return [];
  }
}

/** Returns retry priority based on safe-mode-defaults classification. */
function getRetryPriority(paramName: string): 'critical' | 'high' | 'normal' {
  const critical = ['lidLock', 'airPump', 'lightOn'];
  const high = ['heater', 'actuatorSpeed', 'actuatorPos', 'uvSterilizer'];
  if (critical.includes(paramName)) return 'critical';
  if (high.includes(paramName)) return 'high';
  return 'normal';
}
