/**
 * Cálculo de métricas derivadas para señales analógicas.
 * Requisito: 7.4
 */

import type { SignalMetrics } from '../store/signal-store';

export function computeMetrics(values: number[]): SignalMetrics {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0 };
  }
  let min = values[0];
  let max = values[0];
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, avg: sum / values.length };
}
