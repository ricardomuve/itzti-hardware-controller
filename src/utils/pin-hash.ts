/**
 * Módulo utilitario de hash de PIN para autenticación local.
 * Usa SHA-256 vía crypto.subtle y Tauri fs API para persistencia.
 * En modo web/dev usa localStorage como fallback.
 *
 * Requisitos: 2.3, 2.4, 2.5
 */

const PIN_HASH_FILENAME = 'pin-hash.dat';
const LOCAL_STORAGE_KEY = 'itzti:pin-hash';

/**
 * Detecta si estamos corriendo dentro de Tauri.
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Hashea un PIN usando SHA-256 y retorna el hash como hex string de 64 caracteres.
 * Requisito: 2.3
 */
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Valida que el PIN tenga formato correcto: 4-8 dígitos numéricos.
 * Retorna true solo si el PIN consiste exclusivamente en dígitos 0-9
 * y tiene longitud entre 4 y 8 inclusive.
 * Requisito: 2.4
 */
export function validatePinFormat(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

/**
 * Lee el hash del PIN almacenado.
 * En Tauri usa el filesystem (AppData), en web usa localStorage.
 * Retorna null si no existe.
 * Requisito: 2.5
 */
export async function readPinHash(): Promise<string | null> {
  if (isTauri()) {
    try {
      const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      const content = await readTextFile(PIN_HASH_FILENAME, {
        baseDir: BaseDirectory.AppData,
      });
      return content.trim() || null;
    } catch {
      return null;
    }
  }
  // Fallback: localStorage para modo web/dev
  try {
    const value = localStorage.getItem(LOCAL_STORAGE_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Escribe el hash del PIN.
 * En Tauri usa el filesystem (AppData), en web usa localStorage.
 * Requisito: 2.3
 */
export async function writePinHash(hash: string): Promise<void> {
  if (isTauri()) {
    const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(PIN_HASH_FILENAME, hash, {
      baseDir: BaseDirectory.AppData,
    });
    return;
  }
  // Fallback: localStorage para modo web/dev
  localStorage.setItem(LOCAL_STORAGE_KEY, hash);
}
