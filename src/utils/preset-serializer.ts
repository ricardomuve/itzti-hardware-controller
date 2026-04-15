/**
 * Módulo serializador de presets — funciones puras de serialización.
 * Requisitos: 6.2, 7.3, 7.4, 7.5, 7.6
 */

import type { SessionPreset, PresetsFile } from '../store/preset-types';

const CURRENT_VERSION = 1;

/**
 * Serializa una lista de presets a JSON con formato versionado.
 * Produce `{ version: 1, presets: [...] }`.
 */
export function serializePresets(presets: SessionPreset[]): string {
  const file: PresetsFile = {
    version: CURRENT_VERSION,
    presets,
  };
  return JSON.stringify(file);
}

/**
 * Deserializa una cadena JSON a una lista de presets.
 * Retorna lista vacía si el JSON es corrupto o inválido, registrando el error.
 */
export function deserializePresets(json: string): SessionPreset[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'presets' in parsed &&
      Array.isArray((parsed as PresetsFile).presets)
    ) {
      return (parsed as PresetsFile).presets;
    }
    console.error('preset-serializer: JSON válido pero estructura inesperada — se esperaba { presets: [...] }');
    return [];
  } catch (error) {
    console.error('preset-serializer: Error al parsear JSON de presets', error);
    return [];
  }
}

/**
 * Valida que un objeto desconocido cumpla la estructura de SessionPreset.
 * Verifica campos obligatorios (name, channels no vacío) y tipos correctos.
 */
export function validatePreset(preset: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof preset !== 'object' || preset === null || Array.isArray(preset)) {
    return { valid: false, errors: ['El preset debe ser un objeto no nulo'] };
  }

  const obj = preset as Record<string, unknown>;

  // Validar name
  if (!('name' in obj) || typeof obj.name !== 'string') {
    errors.push('El campo "name" es obligatorio y debe ser una cadena de texto');
  } else if (obj.name.trim() === '') {
    errors.push('El campo "name" no puede estar vacío');
  }

  // Validar channels
  if (!('channels' in obj) || !Array.isArray(obj.channels)) {
    errors.push('El campo "channels" es obligatorio y debe ser un arreglo');
  } else if (obj.channels.length === 0) {
    errors.push('El campo "channels" no puede estar vacío');
  }

  // Validar actuators (opcional pero si existe debe ser arreglo)
  if ('actuators' in obj && !Array.isArray(obj.actuators)) {
    errors.push('El campo "actuators" debe ser un arreglo si está presente');
  }

  return { valid: errors.length === 0, errors };
}
