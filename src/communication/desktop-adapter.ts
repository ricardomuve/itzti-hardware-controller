import type { IHardwarePort } from './hardware-port';
import type {
  PortInfo,
  I2cBusInfo,
  I2cConfig,
  I2cSensorReading,
  SpiBusInfo,
  SpiConfig,
  SpiTransferResult,
} from './types';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * Adaptador de escritorio que usa Tauri commands (Rust backend)
 * para comunicación serial, ADC, I2C y SPI.
 *
 * Invoca comandos Rust: list_ports, connect_port, disconnect_port, write_data,
 * list_i2c_buses, scan_i2c, configure_i2c, i2c_read, i2c_write, i2c_write_read,
 * start_i2c_continuous, stop_i2c_continuous, list_spi_buses, configure_spi,
 * spi_transfer, spi_write, spi_read, start_spi_continuous, stop_spi_continuous.
 *
 * Escucha eventos Tauri: serial-data, serial-disconnect, serial-error,
 * i2c-sensor-data, spi-sensor-data, i2c-error, spi-error,
 * i2c-continuous-stopped, spi-continuous-stopped.
 *
 * Requisitos: 1.4, 2.4, 5.5, 6.5
 */
export class DesktopAdapter implements IHardwarePort {
  private connected = false;
  private dataCallback: ((data: Uint8Array) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private disconnectCallback: (() => void) | null = null;
  private unlistenData: UnlistenFn | null = null;
  private unlistenDisconnect: UnlistenFn | null = null;
  private unlistenError: UnlistenFn | null = null;

  // I2C/SPI event listeners
  private unlistenI2cSensorData: UnlistenFn | null = null;
  private unlistenSpiSensorData: UnlistenFn | null = null;
  private unlistenI2cError: UnlistenFn | null = null;
  private unlistenSpiError: UnlistenFn | null = null;
  private unlistenI2cContinuousStopped: UnlistenFn | null = null;
  private unlistenSpiContinuousStopped: UnlistenFn | null = null;

  // I2C/SPI event callbacks
  private i2cSensorDataCallback: ((reading: I2cSensorReading) => void) | null = null;
  private spiSensorDataCallback: ((result: SpiTransferResult, bus: number, cs: number) => void) | null = null;
  private i2cErrorCallback: ((error: string) => void) | null = null;
  private spiErrorCallback: ((error: string) => void) | null = null;
  private i2cContinuousStoppedCallback: ((info: { bus: number; address: number; reason: string }) => void) | null = null;
  private spiContinuousStoppedCallback: ((info: { bus: number; cs: number; reason: string }) => void) | null = null;

  async listPorts(): Promise<PortInfo[]> {
    const ports = await invoke<PortInfo[]>('list_ports');
    return ports;
  }

  async connect(portPath: string, baudRate: number): Promise<void> {
    await invoke('connect_port', { portPath, baudRate });
    this.connected = true;
    await this.registerListeners();
  }

  async disconnect(): Promise<void> {
    await this.removeListeners();
    await invoke('disconnect_port');
    this.connected = false;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.connected) {
      throw new Error('No hay conexión activa. Conecte un dispositivo primero.');
    }
    await invoke('write_data', { data: Array.from(data) });
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

  // --- I2C/SPI event callback setters ---

  onI2cSensorData(callback: (reading: I2cSensorReading) => void): void {
    this.i2cSensorDataCallback = callback;
  }

  onSpiSensorData(callback: (result: SpiTransferResult, bus: number, cs: number) => void): void {
    this.spiSensorDataCallback = callback;
  }

  onI2cError(callback: (error: string) => void): void {
    this.i2cErrorCallback = callback;
  }

  onSpiError(callback: (error: string) => void): void {
    this.spiErrorCallback = callback;
  }

  onI2cContinuousStopped(callback: (info: { bus: number; address: number; reason: string }) => void): void {
    this.i2cContinuousStoppedCallback = callback;
  }

  onSpiContinuousStopped(callback: (info: { bus: number; cs: number; reason: string }) => void): void {
    this.spiContinuousStoppedCallback = callback;
  }

  // --- I2C command wrappers (Requisitos: 1.4, 2.4, 5.5) ---

  async listI2cBuses(): Promise<I2cBusInfo[]> {
    return invoke<I2cBusInfo[]>('list_i2c_buses');
  }

  async scanI2c(busNumber: number): Promise<number[]> {
    return invoke<number[]>('scan_i2c', { busNumber });
  }

  async configureI2c(config: I2cConfig): Promise<void> {
    await invoke('configure_i2c', { config });
  }

  async i2cRead(busNumber: number, address: number, length: number): Promise<number[]> {
    return invoke<number[]>('i2c_read', { busNumber, address, length });
  }

  async i2cWrite(busNumber: number, address: number, data: number[]): Promise<void> {
    await invoke('i2c_write', { busNumber, address, data });
  }

  async i2cWriteRead(busNumber: number, address: number, writeData: number[], readLength: number): Promise<number[]> {
    return invoke<number[]>('i2c_write_read', { busNumber, address, writeData, readLength });
  }

  async startI2cContinuous(busNumber: number, address: number, readLength: number, sampleRateHz: number): Promise<void> {
    await invoke('start_i2c_continuous', { busNumber, address, readLength, sampleRateHz });
  }

  async stopI2cContinuous(busNumber: number, address: number): Promise<void> {
    await invoke('stop_i2c_continuous', { busNumber, address });
  }

  // --- SPI command wrappers (Requisitos: 6.5) ---

  async listSpiBuses(): Promise<SpiBusInfo[]> {
    return invoke<SpiBusInfo[]>('list_spi_buses');
  }

  async configureSpi(config: SpiConfig): Promise<void> {
    await invoke('configure_spi', { config });
  }

  async spiTransfer(busNumber: number, chipSelect: number, txData: number[]): Promise<number[]> {
    return invoke<number[]>('spi_transfer', { busNumber, chipSelect, txData });
  }

  async spiWrite(busNumber: number, chipSelect: number, data: number[]): Promise<void> {
    await invoke('spi_write', { busNumber, chipSelect, data });
  }

  async spiRead(busNumber: number, chipSelect: number, length: number): Promise<number[]> {
    return invoke<number[]>('spi_read', { busNumber, chipSelect, length });
  }

  async startSpiContinuous(busNumber: number, chipSelect: number, txData: number[], sampleRateHz: number): Promise<void> {
    await invoke('start_spi_continuous', { busNumber, chipSelect, txData, sampleRateHz });
  }

  async stopSpiContinuous(busNumber: number, chipSelect: number): Promise<void> {
    await invoke('stop_spi_continuous', { busNumber, chipSelect });
  }

  /**
   * Registra listeners para eventos I2C/SPI emitidos por el backend Rust.
   * Debe llamarse una vez para habilitar la recepción de datos de sensores.
   */
  async registerBusListeners(): Promise<void> {
    this.unlistenI2cSensorData = await listen<I2cSensorReading>('i2c-sensor-data', (event) => {
      if (this.i2cSensorDataCallback) {
        this.i2cSensorDataCallback(event.payload);
      }
    });

    this.unlistenSpiSensorData = await listen<{ result: SpiTransferResult; bus: number; cs: number }>('spi-sensor-data', (event) => {
      if (this.spiSensorDataCallback) {
        this.spiSensorDataCallback(event.payload.result, event.payload.bus, event.payload.cs);
      }
    });

    this.unlistenI2cError = await listen<string>('i2c-error', (event) => {
      if (this.i2cErrorCallback) {
        this.i2cErrorCallback(event.payload);
      }
    });

    this.unlistenSpiError = await listen<string>('spi-error', (event) => {
      if (this.spiErrorCallback) {
        this.spiErrorCallback(event.payload);
      }
    });

    this.unlistenI2cContinuousStopped = await listen<{ bus: number; address: number; reason: string }>('i2c-continuous-stopped', (event) => {
      if (this.i2cContinuousStoppedCallback) {
        this.i2cContinuousStoppedCallback(event.payload);
      }
    });

    this.unlistenSpiContinuousStopped = await listen<{ bus: number; cs: number; reason: string }>('spi-continuous-stopped', (event) => {
      if (this.spiContinuousStoppedCallback) {
        this.spiContinuousStoppedCallback(event.payload);
      }
    });
  }

  /**
   * Elimina los listeners de eventos I2C/SPI.
   */
  removeBusListeners(): void {
    if (this.unlistenI2cSensorData) { this.unlistenI2cSensorData(); this.unlistenI2cSensorData = null; }
    if (this.unlistenSpiSensorData) { this.unlistenSpiSensorData(); this.unlistenSpiSensorData = null; }
    if (this.unlistenI2cError) { this.unlistenI2cError(); this.unlistenI2cError = null; }
    if (this.unlistenSpiError) { this.unlistenSpiError(); this.unlistenSpiError = null; }
    if (this.unlistenI2cContinuousStopped) { this.unlistenI2cContinuousStopped(); this.unlistenI2cContinuousStopped = null; }
    if (this.unlistenSpiContinuousStopped) { this.unlistenSpiContinuousStopped(); this.unlistenSpiContinuousStopped = null; }
  }

  /**
   * Registra listeners para eventos Tauri emitidos por el backend Rust.
   * - serial-data: datos entrantes del dispositivo (payload: number[])
   * - serial-disconnect: desconexión inesperada del dispositivo
   * - serial-error: error de comunicación
   */
  private async registerListeners(): Promise<void> {
    this.unlistenData = await listen<number[]>('serial-data', (event) => {
      if (this.dataCallback) {
        this.dataCallback(new Uint8Array(event.payload));
      }
    });

    this.unlistenDisconnect = await listen('serial-disconnect', () => {
      this.connected = false;
      if (this.disconnectCallback) {
        this.disconnectCallback();
      }
    });

    this.unlistenError = await listen<string>('serial-error', (event) => {
      if (this.errorCallback) {
        this.errorCallback(new Error(event.payload));
      }
    });
  }

  /**
   * Elimina todos los listeners de eventos Tauri registrados.
   */
  private async removeListeners(): Promise<void> {
    if (this.unlistenData) {
      this.unlistenData();
      this.unlistenData = null;
    }
    if (this.unlistenDisconnect) {
      this.unlistenDisconnect();
      this.unlistenDisconnect = null;
    }
    if (this.unlistenError) {
      this.unlistenError();
      this.unlistenError = null;
    }
  }
}
