/**
 * Control deslizador para ajustar parámetros de dispositivos.
 * Requisitos: 2.1, 3.1, 4.1
 */

import { useCallback } from 'react';
import { useDeviceStore } from '../store/device-store';
import { clampValue } from '../utils/validation';

export interface SliderControlProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  label?: string;
  unit?: string;
  deviceId?: string;
  paramName?: string;
  step?: number;
}

export default function SliderControl({ min, max, value, onChange, label, unit, deviceId, paramName, step = 1 }: SliderControlProps) {
  const updateDeviceParam = useDeviceStore((s) => s.updateDeviceParam);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = clampValue(Number(e.target.value), min, max);
      onChange(newValue);
      if (deviceId && paramName) updateDeviceParam(deviceId, paramName, newValue);
    },
    [min, max, onChange, deviceId, paramName, updateDeviceParam],
  );

  const clampedValue = clampValue(value, min, max);

  return (
    <div data-testid={`slider-control${paramName ? `-${paramName}` : ''}`} className="w-full">
      {label && <label data-testid="slider-label" className="block text-xs text-text-muted mb-1">{label}</label>}
      <div className="flex items-center gap-3">
        <span data-testid="slider-min" className="text-xs text-text-muted tabular-nums w-8 text-right">{min}</span>
        <input
          data-testid="slider-input"
          type="range" min={min} max={max} step={step}
          value={clampedValue}
          onChange={handleChange}
          aria-label={label ?? 'Slider control'}
          aria-valuemin={min} aria-valuemax={max} aria-valuenow={clampedValue}
          className="flex-1 accent-accent"
        />
        <span data-testid="slider-max" className="text-xs text-text-muted tabular-nums w-8">{max}</span>
      </div>
      <div data-testid="slider-value" className="text-center text-sm font-bold text-accent tabular-nums mt-1">
        {clampedValue}{unit ? <span className="text-text-muted font-normal ml-0.5">{unit}</span> : ''}
      </div>
    </div>
  );
}
