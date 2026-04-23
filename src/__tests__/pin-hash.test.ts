/**
 * Tests unitarios para el módulo pin-hash.
 * Updated for PBKDF2+salt format and rate limiting.
 * Requisitos: 2.3, 2.4, 2.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// Mock Tauri fs plugin
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  BaseDirectory: { AppData: 'AppData' },
}));

import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

const mockedReadTextFile = vi.mocked(readTextFile);
const mockedWriteTextFile = vi.mocked(writeTextFile);

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).__TAURI__ = true;
  resetAttempts();
});

afterEach(() => {
  delete (window as any).__TAURI__;
});

describe('hashPin', () => {
  it('returns salt:hash format (32 hex salt + colon + 64 hex hash)', async () => {
    const result = await hashPin('1234');
    expect(result).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
  });

  it('produces different outputs for the same PIN (random salt)', async () => {
    const hash1 = await hashPin('1234');
    const hash2 = await hashPin('1234');
    // Different salts → different stored values
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hashes for different PINs', async () => {
    const hash1 = await hashPin('1234');
    const hash2 = await hashPin('5678');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPin', () => {
  it('returns true for correct PIN', async () => {
    const stored = await hashPin('4567');
    const result = await verifyPin('4567', stored);
    expect(result).toBe(true);
  });

  it('returns false for wrong PIN', async () => {
    const stored = await hashPin('4567');
    const result = await verifyPin('9999', stored);
    expect(result).toBe(false);
  });

  it('handles legacy SHA-256 format (no salt)', async () => {
    // SHA-256 of "1234"
    const legacyHash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
    const result = await verifyPin('1234', legacyHash);
    expect(result).toBe(true);
  });

  it('rejects wrong PIN against legacy format', async () => {
    const legacyHash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
    const result = await verifyPin('9999', legacyHash);
    expect(result).toBe(false);
  });
});

describe('validatePinFormat', () => {
  it('returns true for valid 4-digit PIN', () => {
    expect(validatePinFormat('1234')).toBe(true);
  });

  it('returns true for valid 8-digit PIN', () => {
    expect(validatePinFormat('12345678')).toBe(true);
  });

  it('returns true for valid 6-digit PIN', () => {
    expect(validatePinFormat('000000')).toBe(true);
  });

  it('returns false for 3-digit PIN (too short)', () => {
    expect(validatePinFormat('123')).toBe(false);
  });

  it('returns false for 9-digit PIN (too long)', () => {
    expect(validatePinFormat('123456789')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validatePinFormat('')).toBe(false);
  });

  it('returns false for PIN with letters', () => {
    expect(validatePinFormat('12ab')).toBe(false);
  });

  it('returns false for PIN with special characters', () => {
    expect(validatePinFormat('12!4')).toBe(false);
  });

  it('returns false for PIN with spaces', () => {
    expect(validatePinFormat('12 4')).toBe(false);
  });
});

describe('rate limiting', () => {
  it('is not locked initially', () => {
    const result = checkRateLimit();
    expect(result.locked).toBe(false);
  });

  it('counts down remaining attempts', () => {
    expect(recordFailedAttempt()).toBe(4); // 5 max - 1 = 4 remaining
    expect(recordFailedAttempt()).toBe(3);
    expect(recordFailedAttempt()).toBe(2);
    expect(recordFailedAttempt()).toBe(1);
  });

  it('locks out after 5 failed attempts', () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt();
    const result = checkRateLimit();
    expect(result.locked).toBe(true);
    expect(result.remainingMs).toBeGreaterThan(0);
  });

  it('resets on resetAttempts()', () => {
    for (let i = 0; i < 3; i++) recordFailedAttempt();
    resetAttempts();
    const result = checkRateLimit();
    expect(result.locked).toBe(false);
    expect(recordFailedAttempt()).toBe(4); // back to fresh
  });
});

describe('readPinHash', () => {
  it('returns the hash when file exists', async () => {
    const storedValue = 'a'.repeat(32) + ':' + 'b'.repeat(64);
    mockedReadTextFile.mockResolvedValue(storedValue);
    const result = await readPinHash();
    expect(result).toBe(storedValue);
  });

  it('returns null when file does not exist', async () => {
    mockedReadTextFile.mockRejectedValue(new Error('File not found'));
    const result = await readPinHash();
    expect(result).toBeNull();
  });

  it('returns null when file is empty', async () => {
    mockedReadTextFile.mockResolvedValue('');
    const result = await readPinHash();
    expect(result).toBeNull();
  });

  it('trims whitespace from the hash', async () => {
    const storedValue = 'c'.repeat(32) + ':' + 'd'.repeat(64);
    mockedReadTextFile.mockResolvedValue(`  ${storedValue}  \n`);
    const result = await readPinHash();
    expect(result).toBe(storedValue);
  });
});

describe('writePinHash', () => {
  it('writes the hash to the file', async () => {
    mockedWriteTextFile.mockResolvedValue(undefined);
    const hash = 'e'.repeat(32) + ':' + 'f'.repeat(64);
    await writePinHash(hash);
    expect(mockedWriteTextFile).toHaveBeenCalledWith('pin-hash.dat', hash, {
      baseDir: 'AppData',
    });
  });
});
