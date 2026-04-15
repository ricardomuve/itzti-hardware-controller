/**
 * Control rotativo SVG para ajustar parámetros de dispositivos.
 * Requisitos: 2.1, 3.1, 4.1
 */

import { useCallback } from 'react';
import { useDeviceStore } from '../store/device-store';
import { clampValue } from '../utils/validation';

export interface KnobControlProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  label?: string;
  unit?: string;
  deviceId?: string;
  paramName?: string;
}

const ARC_START = -135;
const ARC_END = 135;
const ARC_RANGE = ARC_END - ARC_START;

export function valueToAngle(value: number, min: number, max: number): number {
  if (max === min) return ARC_START;
  const normalized = (value - min) / (max - min);
  const clamped = clampValue(normalized, 0, 1);
  return ARC_START + clamped * ARC_RANGE;
}

export default function KnobControl({ min, max, value, onChange, label, unit, deviceId, paramName }: KnobControlProps) {
  const updateDeviceParam = useDeviceStore((s) => s.updateDeviceParam);

  const handleChange = useCallback(
    (newValue: number) => {
      const clamped = clampValue(newValue, min, max);
      onChange(clamped);
      if (deviceId && paramName) updateDeviceParam(deviceId, paramName, clamped);
    },
    [min, max, onChange, deviceId, paramName, updateDeviceParam],
  );

  const angle = valueToAngle(value, min, max);
  const step = max > min ? Math.max(1, Math.round((max - min) / 100)) : 1;

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      handleChange(value + (e.deltaY < 0 ? 1 : -1) * step);
    },
    [value, step, handleChange],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange(Number(e.target.value)),
    [handleChange],
  );

  return (
    <div data-testid={`knob-control${paramName ? `-${paramName}` : ''}`} className="flex flex-col items-center gap-1">
      {label && <label data-testid="knob-label" className="text-xs text-text-muted">{label}</label>}
      <svg
        data-testid="knob-svg"
        width={72} height={72} viewBox="0 0 80 80"
        onWheel={handleWheel}
        role="img"
        aria-label={`${label ?? 'Knob'}: ${value}${unit ? ` ${unit}` : ''}`}
        className="cursor-pointer"
      >
        <circle cx={40} cy={40} r={35} className="fill-surface stroke-border" strokeWidth={2} />
        <line
          data-testid="knob-indicator"
          x1={40} y1={40} x2={40} y2={10}
          className="stroke-accent" strokeWidth={3} strokeLinecap="round"
          transform={`rotate(${angle}, 40, 40)`}
        />
        <circle cx={40} cy={40} r={4} className="fill-accent" />
      </svg>
      <div data-testid="knob-value" className="text-sm font-bold text-accent tabular-nums">
        {value}{unit ? <span className="text-text-muted font-normal ml-0.5">{unit}</span> : ''}
      </div>
      <input
        data-testid="knob-input"
        type="range" min={min} max={max}
        value={clampValue(value, min, max)}
        onChange={handleInputChange}
        aria-label={label ?? 'Knob control'}
        className="w-16 accent-accent"
      />
    </div>
  );
}
