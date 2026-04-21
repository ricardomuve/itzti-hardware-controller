/**
 * Biometric Bridge — Efficient batched ingestion of biometric samples
 * from the frontend to the Rust closed-loop engine.
 *
 * Instead of 1 IPC call per sample (1,280/s for EEG), this accumulates
 * samples in a JS buffer and flushes them as a single batch every
 * FLUSH_INTERVAL_MS (default 100ms). This reduces IPC overhead by ~50x.
 *
 * In web/dev mode, samples go directly to the signal store (no Rust).
 */

import type { BiometricSample } from './types';

const FLUSH_INTERVAL_MS = 100; // 10 flushes/second
const MAX_BUFFER_SIZE = 256;   // force flush if buffer gets too large

let buffer: BiometricSample[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let started = false;

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Queues a biometric sample for batched delivery to Rust.
 * Call this at sensor rate (e.g. 256 Hz) — it's cheap, just an array push.
 */
export function queueBiometricSample(sample: BiometricSample): void {
  buffer.push(sample);

  // Force flush if buffer is getting large (backpressure)
  if (buffer.length >= MAX_BUFFER_SIZE) {
    flush();
  }
}

/**
 * Queues multiple samples at once (e.g. from a decoded serial frame).
 */
export function queueBiometricBatch(samples: BiometricSample[]): void {
  buffer.push(...samples);
  if (buffer.length >= MAX_BUFFER_SIZE) {
    flush();
  }
}

/**
 * Flushes the accumulated buffer to Rust via a single IPC call.
 */
async function flush(): Promise<void> {
  if (buffer.length === 0) return;

  // Swap buffer (non-blocking for producers)
  const batch = buffer;
  buffer = [];

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('push_biometric_batch', { samples: batch });
    } catch (e) {
      console.error('[biometric-bridge] Batch flush error:', e);
    }
  }
  // In web mode, samples are already pushed to signal-store by the simulation
  // in App.tsx, so no action needed here.
}

/**
 * Starts the periodic flush timer. Call once on app init.
 */
export function startBiometricBridge(): void {
  if (started) return;
  started = true;

  flushTimer = setInterval(() => {
    flush();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Stops the bridge and flushes remaining samples.
 */
export function stopBiometricBridge(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flush(); // final flush
  started = false;
}
