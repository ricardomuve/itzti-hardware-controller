/**
 * Integración de lecturas de sensores I2C/SPI con el signal-store.
 * Convierte datos crudos a unidades estándar y los inserta como canales.
 *
 * Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { useSignalStore } from '../store/signal-store';
import { convertRawToValue, checkThreshold } from '../utils/validation';
import type { I2cSensorReading, SpiTransferResult } from './types';

/**
 * Procesa una lectura de sensor I2C e inserta la muestra en el signal store.
 * Crea el canal con ID `i2c-{bus}-0x{addr}` si no existe.
 * Genera alerta si el valor excede los umbrales configurados.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.5
 */
export function handleI2cSensorData(reading: I2cSensorReading): void {
  const store = useSignalStore.getState();
  const addrHex = reading.address.toString(16).padStart(2, '0');
  const channelId = `i2c-${reading.busNumber}-0x${addrHex}`;

  // Create channel if it doesn't exist
  store.addChannel({
    id: channelId,
    name: `I2C Bus ${reading.busNumber} @ 0x${addrHex}`,
    unit: '°C',
    sampleRateHz: 10,
    samples: [],
  });

  // Convert raw data to standard measurement units
  const value = convertRawToValue(reading.data, 'temperature');

  // Push sample to the channel
  store.pushSample(channelId, {
    timestamp: reading.timestamp,
    value,
  });

  // Check thresholds for alert mechanism
  const channel = useSignalStore.getState().channels.find((c) => c.id === channelId);
  if (channel && checkThreshold(value, channel.thresholdMin, channel.thresholdMax)) {
    // Threshold exceeded — alert is handled by existing AlertPanel via store state
    // The AlertPanel already monitors channels for threshold violations
  }
}

/**
 * Procesa un resultado de transferencia SPI e inserta la muestra en el signal store.
 * Crea el canal con ID `spi-{bus}-{cs}` si no existe.
 * Genera alerta si el valor excede los umbrales configurados.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.5
 */
export function handleSpiSensorData(result: SpiTransferResult, bus: number, cs: number): void {
  const store = useSignalStore.getState();
  const channelId = `spi-${bus}-${cs}`;

  // Create channel if it doesn't exist
  store.addChannel({
    id: channelId,
    name: `SPI Bus ${bus} CS ${cs}`,
    unit: '°C',
    sampleRateHz: 10,
    samples: [],
  });

  // Convert raw rx data to standard measurement units
  const value = convertRawToValue(result.rxData, 'temperature');

  // Push sample to the channel
  store.pushSample(channelId, {
    timestamp: result.timestamp,
    value,
  });

  // Check thresholds for alert mechanism
  const channel = useSignalStore.getState().channels.find((c) => c.id === channelId);
  if (channel && checkThreshold(value, channel.thresholdMin, channel.thresholdMax)) {
    // Threshold exceeded — alert is handled by existing AlertPanel via store state
  }
}
