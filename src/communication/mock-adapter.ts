/**
 * Mock hardware adapter for development/testing.
 * Simulates a hardware device that:
 * - Lists fake serial ports
 * - Echoes back commands as confirmations
 * - Generates periodic analog signal data (temperature, voltage, current)
 */

import type { IHardwarePort } from './hardware-port';
import type { PortInfo } from './types';
import { serialize } from './serialization';
import { CommandType } from './types';

export class MockAdapter implements IHardwarePort {
  private connected = false;
  private dataCallback: ((data: Uint8Array) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private disconnectCallback: (() => void) | null = null;
  private signalInterval: ReturnType<typeof setInterval> | null = null;
  private connectedPort = '';

  async listPorts(): Promise<PortInfo[]> {
    // Simulate a short delay
    await delay(200);
    return [
      { path: 'MOCK-COM1', manufacturer: 'Simulated Arduino' },
      { path: 'MOCK-COM2', manufacturer: 'Simulated Sensor Hub' },
      { path: 'MOCK-COM3', manufacturer: 'Simulated Motor Controller' },
    ];
  }

  async connect(portPath: string, _baudRate: number): Promise<void> {
    await delay(300);
    this.connected = true;
    this.connectedPort = portPath;
    console.log(`[MockAdapter] Connected to ${portPath}`);
    this.startSignalSimulation();
  }

  async disconnect(): Promise<void> {
    this.stopSignalSimulation();
    this.connected = false;
    this.connectedPort = '';
    console.log('[MockAdapter] Disconnected');
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.connected) {
      throw new Error('MockAdapter: no hay conexión activa.');
    }
    console.log(`[MockAdapter] Write ${data.length} bytes to ${this.connectedPort}`);

    // Echo back the command as a "confirmation" after a short delay
    await delay(50);
    if (this.dataCallback) {
      this.dataCallback(new Uint8Array(data));
    }
  }

  onData(callback: (data: Uint8Array) => void): void {
    this.dataCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Starts generating simulated analog signals every 500ms.
   * Sends serialized SetBrightness commands with varying values
   * to exercise the data pipeline.
   */
  private startSignalSimulation(): void {
    this.stopSignalSimulation();
    let tick = 0;

    this.signalInterval = setInterval(() => {
      if (!this.connected || !this.dataCallback) return;
      tick++;

      // Every 10 ticks, simulate a brief "error" to exercise error handling
      if (tick % 50 === 0 && this.errorCallback) {
        this.errorCallback(new Error('Simulated transient communication error'));
        return;
      }

      // Send a brightness confirmation with a sine-wave value
      const brightness = Math.round(50 + 40 * Math.sin(tick * 0.1));
      const cmd = serialize({ type: CommandType.SetBrightness, payload: [brightness] });
      this.dataCallback(new Uint8Array(cmd));
    }, 500);
  }

  private stopSignalSimulation(): void {
    if (this.signalInterval) {
      clearInterval(this.signalInterval);
      this.signalInterval = null;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
