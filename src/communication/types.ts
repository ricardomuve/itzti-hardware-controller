/**
 * Tipos e interfaces compartidas de comunicación.
 *
 * Formato binario de un Comando_Hardware:
 * [1 byte: tipo de comando] [2 bytes: longitud payload big-endian] [N bytes: payload]
 *
 * Tipos de comando:
 *   0x01 = SetBrightness    payload: [1 byte: valor 0-100]
 *   0x02 = SetActuatorPos   payload: [2 bytes: posición uint16]
 *   0x03 = SetActuatorSpeed payload: [2 bytes: velocidad uint16]
 *   0x04 = SetVolume        payload: [1 byte: valor 0-100]
 *   0x05 = SelectAudioSource payload: [1 byte: canal]
 *   0x06 = ToggleLight      payload: [1 byte: 0=off, 1=on]
 *   0x10 = ScanPorts        payload: vacío
 *   0x11 = Disconnect       payload: vacío
 */

export enum CommandType {
  SetBrightness = 0x01,
  SetActuatorPos = 0x02,
  SetActuatorSpeed = 0x03,
  SetVolume = 0x04,
  SelectAudioSource = 0x05,
  ToggleLight = 0x06,
  ScanPorts = 0x10,
  Disconnect = 0x11,
}

export interface HardwareCommand {
  type: CommandType;
  payload: number[];
}

export interface PortInfo {
  path: string;
  manufacturer?: string;
  productId?: string;
  vendorId?: string;
}


// --- I2C Types ---

export interface I2cBusInfo {
  busNumber: number;
  path: string;
  accessible: boolean;
  errorMessage?: string;
}

export type I2cAddressMode = 'SevenBit' | 'TenBit';

export interface I2cConfig {
  busNumber: number;
  clockSpeedKhz: number;
  addressMode: I2cAddressMode;
}

export interface I2cSensorReading {
  busNumber: number;
  address: number;
  data: number[];
  timestamp: number;
}

// --- SPI Types ---

export interface SpiBusInfo {
  busNumber: number;
  chipSelect: number;
  path: string;
  accessible: boolean;
  errorMessage?: string;
}

export type SpiMode = 'Mode0' | 'Mode1' | 'Mode2' | 'Mode3';
export type SpiBitOrder = 'MsbFirst' | 'LsbFirst';

export interface SpiConfig {
  busNumber: number;
  chipSelect: number;
  clockSpeedHz: number;
  mode: SpiMode;
  bitsPerWord: number;
  bitOrder: SpiBitOrder;
}

export interface SpiTransferResult {
  txData: number[];
  rxData: number[];
  timestamp: number;
}
