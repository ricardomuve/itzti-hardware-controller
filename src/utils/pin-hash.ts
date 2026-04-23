/**
 * Módulo utilitario de hash de PIN para autenticación local.
 *
 * Seguridad:
 * - PBKDF2 con 100,000 iteraciones (no SHA-256 directo)
 * - Salt aleatorio de 16 bytes por PIN (previene rainbow tables)
 * - Almacena "salt_hex:hash_hex" en el archivo
 * - Rate limiting: max 5 intentos, lockout de 30 segundos
 *
 * En modo Tauri usa filesystem (AppData), en web usa localStorage.
 *
 * Requisitos: 2.3, 2.4, 2.5
 */

const PIN_HASH_FILENAME = 'pin-hash.dat';
const LOCAL_STORAGE_KEY = 'itzti:pin-hash';
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;

// --- Rate limiting ---
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000; // 30 seconds

let failedAttempts = 0;
let lockoutUntil = 0;

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// --- Helpers ---

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// --- Core crypto ---

/**
 * Derives a key from a PIN using PBKDF2-SHA-256 with the given salt.
 * Returns the derived key as a hex string.
 */
async function deriveKey(pin: string, salt: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256, // 32 bytes
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

/**
 * Hashea un PIN con PBKDF2 y un salt aleatorio.
 * Retorna "salt_hex:hash_hex" para almacenamiento.
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveKey(pin, salt);
  return `${bytesToHex(salt)}:${hash}`;
}

/**
 * Verifica un PIN contra un hash almacenado ("salt_hex:hash_hex").
 * Retorna true si coincide.
 */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const colonIdx = stored.indexOf(':');
  if (colonIdx === -1) {
    // Legacy format (plain SHA-256 without salt) — migrate on next change
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const legacyHash = bytesToHex(new Uint8Array(hashBuffer));
    return legacyHash === stored;
  }

  const saltHex = stored.substring(0, colonIdx);
  const expectedHash = stored.substring(colonIdx + 1);
  const salt = hexToBytes(saltHex);
  const actualHash = await deriveKey(pin, salt);
  return actualHash === expectedHash;
}

/**
 * Valida que el PIN tenga formato correcto: 4-8 dígitos numéricos.
 */
export function validatePinFormat(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

// --- Rate limiting ---

/**
 * Checks if login attempts are currently locked out.
 * Returns { locked: true, remainingMs } if locked, { locked: false } otherwise.
 */
export function checkRateLimit(): { locked: boolean; remainingMs: number } {
  const now = Date.now();
  if (lockoutUntil > now) {
    return { locked: true, remainingMs: lockoutUntil - now };
  }
  return { locked: false, remainingMs: 0 };
}

/**
 * Records a failed login attempt. Returns the number of remaining attempts
 * before lockout, or 0 if lockout was just triggered.
 */
export function recordFailedAttempt(): number {
  failedAttempts++;
  if (failedAttempts >= MAX_ATTEMPTS) {
    lockoutUntil = Date.now() + LOCKOUT_MS;
    failedAttempts = 0;
    return 0;
  }
  return MAX_ATTEMPTS - failedAttempts;
}

/** Resets the failed attempt counter (call on successful login). */
export function resetAttempts(): void {
  failedAttempts = 0;
  lockoutUntil = 0;
}

/** Returns the current number of failed attempts. */
export function getFailedAttempts(): number {
  return failedAttempts;
}

// --- Persistence ---

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
  try {
    const value = localStorage.getItem(LOCAL_STORAGE_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export async function writePinHash(hash: string): Promise<void> {
  if (isTauri()) {
    const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(PIN_HASH_FILENAME, hash, {
      baseDir: BaseDirectory.AppData,
    });
    return;
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, hash);
}
