/**
 * Tests unitarios para el módulo pin-hash.
 * Requisitos: 2.3, 2.4, 2.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashPin, validatePinFormat, readPinHash, writePinHash } from '../utils/pin-hash';

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
  // Simulate Tauri environment so read/write use the mocked Tauri fs API
  (window as any).__TAURI__ = true;
});

import { afterEach } from 'vitest';
afterEach(() => {
  delete (window as any).__TAURI__;
});

describe('hashPin', () => {
  it('returns a 64-character hex string', async () => {
    const hash = await hashPin('1234');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces deterministic output for the same input', async () => {
    const hash1 = await hashPin('5678');
    const hash2 = await hashPin('5678');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different PINs', async () => {
    const hash1 = await hashPin('1234');
    const hash2 = await hashPin('5678');
    expect(hash1).not.toBe(hash2);
  });

  it('produces the known SHA-256 hash for "1234"', async () => {
    const hash = await hashPin('1234');
    // SHA-256 of "1234" is well-known
    expect(hash).toBe('03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4');
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

describe('readPinHash', () => {
  it('returns the hash when file exists', async () => {
    const expectedHash = 'a'.repeat(64);
    mockedReadTextFile.mockResolvedValue(expectedHash);

    const result = await readPinHash();
    expect(result).toBe(expectedHash);
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
    const expectedHash = 'b'.repeat(64);
    mockedReadTextFile.mockResolvedValue(`  ${expectedHash}  \n`);

    const result = await readPinHash();
    expect(result).toBe(expectedHash);
  });
});

describe('writePinHash', () => {
  it('writes the hash to the file', async () => {
    mockedWriteTextFile.mockResolvedValue(undefined);
    const hash = 'c'.repeat(64);

    await writePinHash(hash);

    expect(mockedWriteTextFile).toHaveBeenCalledWith('pin-hash.dat', hash, {
      baseDir: 'AppData',
    });
  });
});
