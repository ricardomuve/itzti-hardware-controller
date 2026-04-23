/**
 * Store de autenticación con Zustand.
 * Gestiona el rol activo y la autenticación local por PIN.
 *
 * Seguridad:
 * - PBKDF2 con salt (no SHA-256 directo)
 * - Rate limiting: 5 intentos, lockout 30s
 * - Verificación via verifyPin() (timing-safe comparison via PBKDF2)
 *
 * Requisitos: 1.1, 1.2, 1.3, 2.1, 2.2, 2.5, 2.6, 3.1, 3.2, 3.3
 */

import { create } from 'zustand';
import {
  hashPin,
  verifyPin,
  validatePinFormat,
  readPinHash,
  writePinHash,
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
} from '../utils/pin-hash';

export type UserRole = 'expert' | 'user';

export interface AuthState {
  role: UserRole;
  pinHashExists: boolean;
  /** Number of remaining login attempts before lockout */
  remainingAttempts: number | null;
  /** Milliseconds until lockout expires (0 if not locked) */
  lockoutRemainingMs: number;

  login: (pin: string) => Promise<{ success: boolean; remainingAttempts?: number; lockedMs?: number }>;
  logout: () => void;
  setupPin: (pin: string) => Promise<void>;
  changePin: (currentPin: string, newPin: string) => Promise<boolean>;
  loadPinStatus: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  role: 'user',
  pinHashExists: false,
  remainingAttempts: null,
  lockoutRemainingMs: 0,

  login: async (pin: string) => {
    // Check rate limit first
    const limit = checkRateLimit();
    if (limit.locked) {
      set({ lockoutRemainingMs: limit.remainingMs });
      return { success: false, lockedMs: limit.remainingMs };
    }

    const storedHash = await readPinHash();
    if (!storedHash) {
      return { success: false };
    }

    const valid = await verifyPin(pin, storedHash);
    if (valid) {
      resetAttempts();
      set({ role: 'expert', remainingAttempts: null, lockoutRemainingMs: 0 });
      return { success: true };
    }

    // Failed attempt
    const remaining = recordFailedAttempt();
    if (remaining === 0) {
      const newLimit = checkRateLimit();
      set({ remainingAttempts: 0, lockoutRemainingMs: newLimit.remainingMs });
      return { success: false, remainingAttempts: 0, lockedMs: newLimit.remainingMs };
    }

    set({ remainingAttempts: remaining });
    return { success: false, remainingAttempts: remaining };
  },

  logout: () => {
    set({ role: 'user', remainingAttempts: null, lockoutRemainingMs: 0 });
  },

  setupPin: async (pin: string): Promise<void> => {
    if (get().pinHashExists) {
      throw new Error('PIN already configured. Use changePin instead.');
    }
    if (!validatePinFormat(pin)) {
      throw new Error('Invalid PIN format. PIN must be 4-8 numeric digits.');
    }
    const hash = await hashPin(pin);
    await writePinHash(hash);
    set({ pinHashExists: true });
  },

  changePin: async (currentPin: string, newPin: string): Promise<boolean> => {
    const storedHash = await readPinHash();
    if (!storedHash) return false;

    const valid = await verifyPin(currentPin, storedHash);
    if (!valid) return false;

    if (!validatePinFormat(newPin)) return false;

    const newHash = await hashPin(newPin);
    await writePinHash(newHash);
    return true;
  },

  loadPinStatus: async (): Promise<void> => {
    const storedHash = await readPinHash();
    set({ pinHashExists: storedHash !== null });
  },
}));
