/**
 * Unit tests for CSV export utility.
 * Requisito: 7.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportToCSV, downloadCSV } from '../utils/csv-export';

describe('exportToCSV', () => {
  it('generates correct header with channel names and units', () => {
    const channels = [
      { name: 'Temperatura', unit: '°C', samples: [] },
      { name: 'Voltaje', unit: 'V', samples: [] },
    ];
    const csv = exportToCSV(channels);
    expect(csv).toBe('timestamp,Temperatura (°C),Voltaje (V)');
  });

  it('generates rows with timestamps and values', () => {
    const channels = [
      {
        name: 'Temp',
        unit: '°C',
        samples: [
          { timestamp: 1000, value: 23.5 },
          { timestamp: 2000, value: 24.0 },
        ],
      },
      {
        name: 'Volt',
        unit: 'V',
        samples: [
          { timestamp: 1000, value: 5.0 },
          { timestamp: 2000, value: 5.1 },
        ],
      },
    ];
    const csv = exportToCSV(channels);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('timestamp,Temp (°C),Volt (V)');
    expect(lines[1]).toBe('1000,23.5,5');
    expect(lines[2]).toBe('2000,24,5.1');
  });

  it('handles missing values with empty cells', () => {
    const channels = [
      {
        name: 'A',
        unit: 'V',
        samples: [{ timestamp: 1000, value: 1.0 }],
      },
      {
        name: 'B',
        unit: 'A',
        samples: [{ timestamp: 2000, value: 2.0 }],
      },
    ];
    const csv = exportToCSV(channels);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('1000,1,');
    expect(lines[2]).toBe('2000,,2');
  });

  it('returns header only for empty channels', () => {
    const channels = [{ name: 'X', unit: 'Pa', samples: [] }];
    const csv = exportToCSV(channels);
    expect(csv).toBe('timestamp,X (Pa)');
  });

  it('sorts timestamps numerically', () => {
    const channels = [
      {
        name: 'S',
        unit: 'dB',
        samples: [
          { timestamp: 3000, value: 10 },
          { timestamp: 1000, value: 30 },
          { timestamp: 2000, value: 20 },
        ],
      },
    ];
    const csv = exportToCSV(channels);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('1000,30');
    expect(lines[2]).toBe('2000,20');
    expect(lines[3]).toBe('3000,10');
  });

  it('deduplicates shared timestamps across channels', () => {
    const channels = [
      {
        name: 'A',
        unit: 'V',
        samples: [{ timestamp: 1000, value: 1 }],
      },
      {
        name: 'B',
        unit: 'A',
        samples: [{ timestamp: 1000, value: 2 }],
      },
    ];
    const csv = exportToCSV(channels);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('1000,1,2');
  });
});

describe('downloadCSV', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a blob and triggers download', () => {
    const clickSpy = vi.fn();
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      style: { display: '' },
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    downloadCSV('a,b\n1,2', 'test.csv');

    expect(createObjectURLMock).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
    expect(appendChildSpy).toHaveBeenCalledOnce();
    expect(removeChildSpy).toHaveBeenCalledOnce();
  });
});
