/**
 * Tests for KnobControl and SliderControl components.
 * Validates: Requirements 2.1, 3.1, 4.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KnobControl, { valueToAngle } from '../components/KnobControl';
import SliderControl from '../components/SliderControl';
import { useDeviceStore } from '../store/device-store';

beforeEach(() => {
  useDeviceStore.setState({ devices: [], error: null });
});

describe('valueToAngle', () => {
  it('should return ARC_START (-135) for min value', () => {
    expect(valueToAngle(0, 0, 100)).toBe(-135);
  });

  it('should return ARC_END (135) for max value', () => {
    expect(valueToAngle(100, 0, 100)).toBe(135);
  });

  it('should return midpoint (0) for middle value', () => {
    expect(valueToAngle(50, 0, 100)).toBe(0);
  });

  it('should clamp below min', () => {
    expect(valueToAngle(-10, 0, 100)).toBe(-135);
  });

  it('should clamp above max', () => {
    expect(valueToAngle(200, 0, 100)).toBe(135);
  });

  it('should return ARC_START when min equals max', () => {
    expect(valueToAngle(5, 5, 5)).toBe(-135);
  });
});

describe('KnobControl', () => {
  it('should render with label and value', () => {
    render(<KnobControl min={0} max={100} value={50} onChange={() => {}} label="Brillo" unit="%" />);
    expect(screen.getByTestId('knob-label')).toHaveTextContent('Brillo');
    expect(screen.getByTestId('knob-value')).toHaveTextContent('50 %');
  });

  it('should render SVG knob element', () => {
    render(<KnobControl min={0} max={100} value={75} onChange={() => {}} />);
    expect(screen.getByTestId('knob-svg')).toBeInTheDocument();
    expect(screen.getByTestId('knob-indicator')).toBeInTheDocument();
  });

  it('should rotate indicator based on value', () => {
    render(<KnobControl min={0} max={100} value={100} onChange={() => {}} />);
    const indicator = screen.getByTestId('knob-indicator');
    expect(indicator.getAttribute('transform')).toBe('rotate(135, 40, 40)');
  });

  it('should call onChange when range input changes', () => {
    const onChange = vi.fn();
    render(<KnobControl min={0} max={100} value={50} onChange={onChange} />);
    const input = screen.getByTestId('knob-input');
    fireEvent.change(input, { target: { value: '75' } });
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it('should clamp value to range on change', () => {
    const onChange = vi.fn();
    render(<KnobControl min={0} max={100} value={50} onChange={onChange} />);
    const input = screen.getByTestId('knob-input');
    fireEvent.change(input, { target: { value: '150' } });
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('should update device store when deviceId and paramName are provided', () => {
    // Add a device to the store first
    useDeviceStore.setState({
      devices: [
        { id: 'dev1', portPath: 'COM3', name: 'LED', status: 'connected', lastSeen: Date.now(), params: {} },
      ],
    });

    const onChange = vi.fn();
    render(
      <KnobControl
        min={0}
        max={100}
        value={50}
        onChange={onChange}
        deviceId="dev1"
        paramName="brightness"
      />,
    );

    const input = screen.getByTestId('knob-input');
    fireEvent.change(input, { target: { value: '80' } });

    expect(onChange).toHaveBeenCalledWith(80);
    const device = useDeviceStore.getState().devices.find((d) => d.id === 'dev1');
    expect(device?.params.brightness).toBe(80);
  });
});

describe('SliderControl', () => {
  it('should render with label, value, and unit', () => {
    render(<SliderControl min={0} max={100} value={60} onChange={() => {}} label="Volumen" unit="%" />);
    expect(screen.getByTestId('slider-label')).toHaveTextContent('Volumen');
    expect(screen.getByTestId('slider-value')).toHaveTextContent('60 %');
  });

  it('should display min and max labels', () => {
    render(<SliderControl min={0} max={255} value={100} onChange={() => {}} />);
    expect(screen.getByTestId('slider-min')).toHaveTextContent('0');
    expect(screen.getByTestId('slider-max')).toHaveTextContent('255');
  });

  it('should call onChange when slider changes', () => {
    const onChange = vi.fn();
    render(<SliderControl min={0} max={100} value={50} onChange={onChange} />);
    const input = screen.getByTestId('slider-input');
    fireEvent.change(input, { target: { value: '75' } });
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it('should clamp value to range on change', () => {
    const onChange = vi.fn();
    render(<SliderControl min={10} max={90} value={50} onChange={onChange} />);
    const input = screen.getByTestId('slider-input');
    fireEvent.change(input, { target: { value: '200' } });
    expect(onChange).toHaveBeenCalledWith(90);
  });

  it('should update device store when deviceId and paramName are provided', () => {
    useDeviceStore.setState({
      devices: [
        { id: 'dev2', portPath: 'COM4', name: 'Motor', status: 'connected', lastSeen: Date.now(), params: {} },
      ],
    });

    const onChange = vi.fn();
    render(
      <SliderControl
        min={0}
        max={100}
        value={30}
        onChange={onChange}
        deviceId="dev2"
        paramName="volume"
      />,
    );

    const input = screen.getByTestId('slider-input');
    fireEvent.change(input, { target: { value: '65' } });

    expect(onChange).toHaveBeenCalledWith(65);
    const device = useDeviceStore.getState().devices.find((d) => d.id === 'dev2');
    expect(device?.params.volume).toBe(65);
  });

  it('should set correct aria attributes', () => {
    render(<SliderControl min={0} max={100} value={42} onChange={() => {}} label="Posición" />);
    const input = screen.getByTestId('slider-input');
    expect(input).toHaveAttribute('aria-valuemin', '0');
    expect(input).toHaveAttribute('aria-valuemax', '100');
    expect(input).toHaveAttribute('aria-valuenow', '42');
    expect(input).toHaveAttribute('aria-label', 'Posición');
  });
});
