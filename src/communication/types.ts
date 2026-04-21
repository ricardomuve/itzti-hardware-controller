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

// --- Biometric Types (Sensory Deprivation Tank) ---

/** EEG frequency band power values in µV² */
export interface EegBands {
  delta: number;   // 0.5–4 Hz  (deep sleep)
  theta: number;   // 4–8 Hz    (meditation, drowsiness)
  alpha: number;   // 8–13 Hz   (relaxation)
  beta: number;    // 13–30 Hz  (active thinking)
  gamma: number;   // 30–100 Hz (high-level processing)
}

/** A single biometric sample from any sensor type */
export interface BiometricSample {
  sensorType: BiometricSensorType;
  channelId: string;
  value: number;
  timestamp: number;
  /** Optional EEG band breakdown when sensorType is 'eeg' */
  eegBands?: EegBands;
}

export type BiometricSensorType = 'eeg' | 'pulse' | 'temperature' | 'gsr' | 'spo2';

/** Threshold configuration for a single biometric channel */
export interface BiometricThreshold {
  channelId: string;
  sensorType: BiometricSensorType;
  min: number;
  max: number;
  /** Action to take when threshold is crossed */
  action: ThresholdAction;
}

export type ThresholdAction =
  | { type: 'adjust_actuator'; deviceId: string; paramName: string; targetValue: number }
  | { type: 'adjust_audio'; volumeDelta: number; pitchDelta: number }
  | { type: 'alert_only' };

/** Closed-loop state emitted from Rust backend */
export interface ClosedLoopState {
  active: boolean;
  sessionId: string | null;
  /** Current relaxation depth score 0–100 */
  relaxationScore: number;
  /** Active threshold violations */
  violations: ThresholdViolation[];
  /** Timestamp of last evaluation cycle */
  lastCycleTimestamp: number;
}

export interface ThresholdViolation {
  channelId: string;
  sensorType: BiometricSensorType;
  currentValue: number;
  threshold: { min: number; max: number };
  action: ThresholdAction;
  timestamp: number;
}

/** Commands for closed-loop control (Rust ↔ Frontend) */
export enum ClosedLoopCommand {
  StartSession = 0x20,
  StopSession = 0x21,
  UpdateThresholds = 0x22,
  RequestState = 0x23,
}
