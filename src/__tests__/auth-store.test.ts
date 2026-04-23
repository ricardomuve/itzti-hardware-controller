/**
 * Tests unitarios del auth-store.
 * Requisitos: 1.1, 2.2, 2.5, 3.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tauri fs plugin before importing the store
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  BaseDirectory: { AppData: 'AppData' },
}));

// Known hash for PIN '1234' via SHA-256
const KNOWN_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

// Mock pin-hash utilities with controllable behavior
const mockReadPinHash = vi.fn<() => Promise<string | null>>();
const mockWritePinHash = vi.fn<(hash: string) => Promise<void>>();
const mockHashPin = vi.fn<(pin: string) => Promise<string>>();
const mockValidatePinFormat = vi.fn<(pin: string) => boolean>();
const mockVerifyPin = vi.fn<(pin: string, stored: string) => Promise<boolean>>();
const mockCheckRateLimit = vi.fn(() => ({ locked: false, remainingMs: 0 }));
const mockRecordFailedAttempt = vi.fn(() => 4);
const mockResetAttempts = vi.fn();

vi.mock('../utils/pin-hash', () => ({
  hashPin: (...args: unknown[]) => mockHashPin(args[0] as string),
  verifyPin: (...args: unknown[]) => mockVerifyPin(args[0] as string, args[1] as string),
  validatePinFormat: (...args: unknown[]) => mockValidatePinFormat(args[0] as string),
  readPinHash: () => mockReadPinHash(),
  writePinHash: (...args: unknown[]) => mockWritePinHash(args[0] as string),
  checkRateLimit: () => mockCheckRateLimit(),
  recordFailedAttempt: () => mockRecordFailedAttempt(),
  resetAttempts: () => mockResetAttempts(),
}));

import { useAuthStore } from '../store/auth-store';

beforeEach(() => {
  // Reset store to initial state
  useAuthStore.setState({ role: 'user', pinHashExists: false });
  vi.clearAllMocks();
});

describe('auth-store: estado inicial', () => {
  /**
   * Validates: Requisitos 1.1, 3.3
   * La aplicación inicia en Rol_Usuario como rol predeterminado.
   */
  it('initial state has role === "user"', () => {
    const state = useAuthStore.getState();
    expect(state.role).toBe('user');
  });

  it('initial state has pinHashExists === false', () => {
    const state = useAuthStore.getState();
    expect(state.pinHashExists).toBe(false);
  });
});

describe('auth-store: flujo de configuración inicial de PIN', () => {
  /**
   * Validates: Requisito 2.5
   * Si no existe PIN configurado, setupPin permite establecer uno nuevo.
   */
  it('setupPin stores hash and sets pinHashExists when no PIN exists', async () => {
    mockValidatePinFormat.mockReturnValue(true);
    mockHashPin.mockResolvedValue(KNOWN_HASH);
    mockWritePinHash.mockResolvedValue(undefined);

    await useAuthStore.getState().setupPin('1234');

    expect(mockValidatePinFormat).toHaveBeenCalledWith('1234');
    expect(mockHashPin).toHaveBeenCalledWith('1234');
    expect(mockWritePinHash).toHaveBeenCalledWith(KNOWN_HASH);
    expect(useAuthStore.getState().pinHashExists).toBe(true);
  });

  it('setupPin throws when PIN already exists', async () => {
    useAuthStore.setState({ pinHashExists: true });

    await expect(useAuthStore.getState().setupPin('1234')).rejects.toThrow(
      'PIN already configured',
    );
  });

  it('setupPin throws when PIN format is invalid', async () => {
    mockValidatePinFormat.mockReturnValue(false);

    await expect(useAuthStore.getState().setupPin('ab')).rejects.toThrow('Invalid PIN format');
  });

  it('loadPinStatus sets pinHashExists to true when hash file exists', async () => {
    mockReadPinHash.mockResolvedValue(KNOWN_HASH);

    await useAuthStore.getState().loadPinStatus();

    expect(useAuthStore.getState().pinHashExists).toBe(true);
  });

  it('loadPinStatus sets pinHashExists to false when no hash file', async () => {
    mockReadPinHash.mockResolvedValue(null);

    await useAuthStore.getState().loadPinStatus();

    expect(useAuthStore.getState().pinHashExists).toBe(false);
  });
});

describe('auth-store: login con PIN inválido', () => {
  it('login with wrong PIN keeps role "user" and returns result object', async () => {
    mockReadPinHash.mockResolvedValue(KNOWN_HASH);
    mockVerifyPin.mockResolvedValue(false);
    mockRecordFailedAttempt.mockReturnValue(4);

    const result = await useAuthStore.getState().login('9999');

    expect(result.success).toBe(false);
    expect(result.remainingAttempts).toBe(4);
    expect(useAuthStore.getState().role).toBe('user');
  });

  it('login returns false when no stored hash exists', async () => {
    mockReadPinHash.mockResolvedValue(null);

    const result = await useAuthStore.getState().login('1234');

    expect(result.success).toBe(false);
    expect(useAuthStore.getState().role).toBe('user');
  });
});
