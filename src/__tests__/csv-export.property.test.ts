/**
 * Feature: tauri-hardware-controller, Property 9: Exportación CSV contiene todos los datos
 *
 * Validates: Requirements 7.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { exportToCSV, CSVChannel } from '../utils/csv-export';

/**
 * Arbitrary generator for a single sample with integer timestamp and finite value.
 * Uses unique integer timestamps to avoid floating point ambiguity in string comparison.
 */
const sampleArb = fc.record({
  timestamp: fc.integer({ min: 1, max: 1_000_000_000 }),
  value: fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 }),
});

/**
 * Arbitrary generator for a channel with unique timestamps per channel.
 */
const channelArb = fc.record({
  name: fc.stringMatching(/^[A-Za-z][A-Za-z0-9_]{0,9}$/),
  unit: fc.constantFrom('°C', 'V', 'A', 'Pa', 'dB'),
  samples: fc
    .uniqueArray(sampleArb, { minLength: 1, maxLength: 20, selector: (s) => s.timestamp })
});

/**
 * Arbitrary generator for an array of channels with unique names.
 */
const channelsArb = fc.uniqueArray(channelArb, {
  minLength: 1,
  maxLength: 5,
  selector: (c) => c.name,
});

/**
 * Parse a CSV string into header and rows.
 */
function parseCSV(csv: string): { header: string[]; rows: string[][] } {
  const lines = csv.split('\n');
  const header = lines[0].split(',');
  const rows = lines.slice(1).map((line) => line.split(','));
  return { header, rows };
}

describe('Property 9: Exportación CSV contiene todos los datos', () => {
  it('header row contains all channel names with their units', () => {
    fc.assert(
      fc.property(channelsArb, (channels) => {
        const csv = exportToCSV(channels);
        const { header } = parseCSV(csv);

        // First column is always "timestamp"
        expect(header[0]).toBe('timestamp');

        // Each channel should appear as "name (unit)" in the header
        for (let i = 0; i < channels.length; i++) {
          const expected = `${channels[i].name} (${channels[i].unit})`;
          expect(header[i + 1]).toBe(expected);
        }

        // Header should have exactly 1 + channels.length columns
        expect(header.length).toBe(channels.length + 1);
      }),
      { numRuns: 100 },
    );
  });

  it('every timestamp present in any channel appears as a row in the CSV', () => {
    fc.assert(
      fc.property(channelsArb, (channels) => {
        const csv = exportToCSV(channels);
        const { rows } = parseCSV(csv);

        // Collect all unique timestamps across all channels
        const allTimestamps = new Set<number>();
        for (const ch of channels) {
          for (const s of ch.samples) {
            allTimestamps.add(s.timestamp);
          }
        }

        // Extract timestamps from CSV rows
        const csvTimestamps = new Set(rows.map((row) => Number(row[0])));

        // Every source timestamp must appear in the CSV
        for (const ts of allTimestamps) {
          expect(csvTimestamps.has(ts)).toBe(true);
        }

        // CSV should have exactly as many rows as unique timestamps
        expect(rows.length).toBe(allTimestamps.size);
      }),
      { numRuns: 100 },
    );
  });

  it('every value for a given timestamp and channel appears in the correct cell', () => {
    fc.assert(
      fc.property(channelsArb, (channels) => {
        const csv = exportToCSV(channels);
        const { rows } = parseCSV(csv);

        // Build a lookup: timestamp -> row
        const rowByTimestamp = new Map<number, string[]>();
        for (const row of rows) {
          rowByTimestamp.set(Number(row[0]), row);
        }

        for (let chIdx = 0; chIdx < channels.length; chIdx++) {
          const ch = channels[chIdx];
          for (const sample of ch.samples) {
            const row = rowByTimestamp.get(sample.timestamp);
            expect(row).toBeDefined();

            // Column index is chIdx + 1 (first column is timestamp)
            const cellValue = row![chIdx + 1];
            expect(cellValue).toBe(sample.value.toString());
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
