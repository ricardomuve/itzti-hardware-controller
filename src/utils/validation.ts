/**
 * Validation and clamping utilities for hardware control.
 * Requisitos: 3.3, 5.2, 5.5, 6.2
 */

import type { SignalSample } from '../store/signal-store';

/**
 * Clamps a value within the inclusive range [min, max].
 * If value < min, returns min. If value > max, returns max.
 * Otherwise returns value unchanged.
 *
 * Validates: Requisito 3.3
 */
export function clampValue(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Validates that a sample rate is within the accepted range [1, 10000] Hz.
 * Returns true if valid, false otherwise.
 *
 * Validates: Requisito 5.2
 */
export function validateSampleRate(rate: number): boolean {
  return rate >= 1 && rate <= 10000;
}

/**
 * Checks whether a signal value exceeds configured thresholds.
 * Returns true if the value triggers an alert (outside bounds), false if within range.
 * If min or max is undefined, that bound is not checked.
 *
 * Validates: Requisito 5.5
 */
export function checkThreshold(value: number, min?: number, max?: number): boolean {
  if (min !== undefined && value < min) return true;
  if (max !== undefined && value > max) return true;
  return false;
}

/**
 * Filters an array of signal samples to only include those
 * with timestamps within the inclusive range [tStart, tEnd].
 *
 * Validates: Requisito 6.2
 */
export function filterByTimeRange(
  samples: SignalSample[],
  tStart: number,
  tEnd: number,
): SignalSample[] {
  return samples.filter((s) => s.timestamp >= tStart && s.timestamp <= tEnd);
}


import type { I2cConfig, SpiConfig } from '../communication/types';

// --- I2C/SPI Validation (Requisitos: 3.1, 3.3, 4.1, 4.4, 7.2) ---

/** Velocidades de reloj I2C válidas en kHz */
export const VALID_I2C_CLOCK_SPEEDS = [100, 400, 1000] as const;

/** Valida velocidad de reloj I2C. Retorna true si es 100, 400 o 1000 kHz. */
export function validateI2cClockSpeed(speedKhz: number): boolean {
  return (VALID_I2C_CLOCK_SPEEDS as readonly number[]).includes(speedKhz);
}

/** Valida velocidad de reloj SPI. Rango válido: 100 kHz a 50 MHz. */
export function validateSpiClockSpeed(speedHz: number): boolean {
  return Number.isInteger(speedHz) && speedHz >= 100_000 && speedHz <= 50_000_000;
}

/** Valida frecuencia de muestreo I2C. Rango válido: 1–1000 Hz. */
export function validateI2cSampleRate(rate: number): boolean {
  return Number.isInteger(rate) && rate >= 1 && rate <= 1000;
}

/** Valida frecuencia de muestreo SPI. Rango válido: 1–10000 Hz. */
export function validateSpiSampleRate(rate: number): boolean {
  return Number.isInteger(rate) && rate >= 1 && rate <= 10000;
}

/** Valida dirección I2C en modo 7 bits. Rango válido: 0x03–0x77. */
export function validateI2cAddress7Bit(address: number): boolean {
  return Number.isInteger(address) && address >= 0x03 && address <= 0x77;
}

/** Valida modo SPI. Valores válidos: 0, 1, 2, 3. */
export function validateSpiMode(mode: number): boolean {
  return Number.isInteger(mode) && mode >= 0 && mode <= 3;
}

// --- Hex Formatting & Pretty-Print (Requisitos: 2.2, 9.3) ---

/** Formatea una dirección I2C como string hexadecimal con prefijo "0x" y 2 dígitos. */
export function formatI2cAddress(address: number): string {
  return '0x' + (address & 0xff).toString(16).padStart(2, '0');
}

/** Pretty-print de configuración I2C. */
export function prettyPrintI2cConfig(config: I2cConfig): string {
  return `[I2C] bus: ${config.busNumber}, clock: ${config.clockSpeedKhz} kHz, addr_mode: ${config.addressMode}`;
}

/** Pretty-print de configuración SPI. */
export function prettyPrintSpiConfig(config: SpiConfig): string {
  return `[SPI] bus: ${config.busNumber}, cs: ${config.chipSelect}, clock: ${config.clockSpeedHz} Hz, mode: ${config.mode}, bit_order: ${config.bitOrder}`;
}

// --- JSON Config Validation (Requisitos: 9.1, 9.2, 9.6) ---

/** Validates a raw JSON value as a valid I2cConfig. Returns validation result with errors. */
export function validateI2cConfigJson(json: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { valid: false, errors: ['INVALID_CONFIG: expected an object'] };
  }
  const obj = json as Record<string, unknown>;

  if (typeof obj.busNumber !== 'number' || !Number.isInteger(obj.busNumber)) {
    errors.push('busNumber: must be an integer');
  }
  if (typeof obj.clockSpeedKhz !== 'number' || !(VALID_I2C_CLOCK_SPEEDS as readonly number[]).includes(obj.clockSpeedKhz)) {
    errors.push('clockSpeedKhz: must be one of 100, 400, 1000');
  }
  if (obj.addressMode !== 'SevenBit' && obj.addressMode !== 'TenBit') {
    errors.push('addressMode: must be "SevenBit" or "TenBit"');
  }

  return { valid: errors.length === 0, errors };
}

/** Validates a raw JSON value as a valid SpiConfig. Returns validation result with errors. */
export function validateSpiConfigJson(json: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { valid: false, errors: ['INVALID_CONFIG: expected an object'] };
  }
  const obj = json as Record<string, unknown>;

  if (typeof obj.busNumber !== 'number' || !Number.isInteger(obj.busNumber)) {
    errors.push('busNumber: must be an integer');
  }
  if (typeof obj.chipSelect !== 'number' || !Number.isInteger(obj.chipSelect)) {
    errors.push('chipSelect: must be an integer');
  }
  if (typeof obj.clockSpeedHz !== 'number' || !Number.isInteger(obj.clockSpeedHz) || obj.clockSpeedHz < 100_000 || obj.clockSpeedHz > 50_000_000) {
    errors.push('clockSpeedHz: must be an integer in [100000, 50000000]');
  }
  const validModes = ['Mode0', 'Mode1', 'Mode2', 'Mode3'];
  if (typeof obj.mode !== 'string' || !validModes.includes(obj.mode)) {
    errors.push('mode: must be one of "Mode0", "Mode1", "Mode2", "Mode3"');
  }
  if (typeof obj.bitsPerWord !== 'number' || !Number.isInteger(obj.bitsPerWord) || obj.bitsPerWord < 1) {
    errors.push('bitsPerWord: must be a positive integer');
  }
  if (obj.bitOrder !== 'MsbFirst' && obj.bitOrder !== 'LsbFirst') {
    errors.push('bitOrder: must be "MsbFirst" or "LsbFirst"');
  }

  return { valid: errors.length === 0, errors };
}

// --- Raw Sensor Data Conversion (Requisito: 8.3) ---

/**
 * Convierte datos crudos de sensor a valor en unidades estándar.
 * - 'temperature': 2 bytes big-endian, resultado en °C clamped a [-40, 125].
 * - Tipo desconocido: retorna 0.
 */
export function convertRawToValue(data: number[], sensorType: string): number {
  if (sensorType === 'temperature') {
    if (data.length < 2) return 0;
    const raw = (data[0] << 8) | data[1];
    // Interpret as signed 16-bit value then scale
    const signed = raw > 0x7fff ? raw - 0x10000 : raw;
    const celsius = signed / 256.0;
    return Math.max(-40, Math.min(125, celsius));
  }
  return 0;
}
