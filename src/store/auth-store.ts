/**
 * Store de autenticación con Zustand.
 * Gestiona el rol activo y la autenticación local por PIN.
 * Requisitos: 1.1, 1.2, 1.3, 2.1, 2.2, 2.5, 2.6, 3.1, 3.2, 3.3
 */

import { create } from 'zustand';
import { hashPin, validatePinFormat, readPinHash, writePinHash } from '../utils/pin-hash';

export type UserRole = 'expert' | 'user';

export interface AuthState {
  role: UserRole;
  pinHashExists: boolean;

  login: (pin: string) => Promise<boolean>;
  logout: () => void;
  setupPin: (pin: string) => Promise<void>;
  changePin: (currentPin: string, newPin: string) => Promise<boolean>;
  loadPinStatus: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  role: 'user',
  pinHashExists: false,

  login: async (pin: string): Promise<boolean> => {
    const storedHash = await readPinHash();
    if (!storedHash) {
      return false;
    }
    const pinHash = await hashPin(pin);
    if (pinHash === storedHash) {
      set({ role: 'expert' });
      return true;
    }
    return false;
  },

  logout: () => {
    set({ role: 'user' });
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
    if (!storedHash) {
      return false;
    }
    const currentHash = await hashPin(currentPin);
    if (currentHash !== storedHash) {
      return false;
    }
    if (!validatePinFormat(newPin)) {
      return false;
    }
    const newHash = await hashPin(newPin);
    await writePinHash(newHash);
    return true;
  },

  loadPinStatus: async (): Promise<void> => {
    const storedHash = await readPinHash();
    set({ pinHashExists: storedHash !== null });
  },
}));
