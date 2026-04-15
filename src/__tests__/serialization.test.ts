import { describe, it, expect } from 'vitest';
import { serialize, deserialize, prettyPrint } from '../communication/serialization';
import { CommandType, type HardwareCommand } from '../communication/types';

describe('serialize', () => {
  it('serializes a SetBrightness command correctly', () => {
    const cmd: HardwareCommand = { type: CommandType.SetBrightness, payload: [75] };
    const bytes = serialize(cmd);
    expect(bytes[0]).toBe(0x01); // type
    expect(bytes[1]).toBe(0x00); // payload length high byte
    expect(bytes[2]).toBe(0x01); // payload length low byte
    expect(bytes[3]).toBe(75);   // payload
    expect(bytes.length).toBe(4);
  });

  it('serializes a command with empty payload', () => {
    const cmd: HardwareCommand = { type: CommandType.ScanPorts, payload: [] };
    const bytes = serialize(cmd);
    expect(bytes.length).toBe(3);
    expect(bytes[0]).toBe(0x10);
    expect(bytes[1]).toBe(0x00);
    expect(bytes[2]).toBe(0x00);
  });

  it('serializes a SetActuatorPos command with 2-byte payload', () => {
    const cmd: HardwareCommand = { type: CommandType.SetActuatorPos, payload: [0x01, 0xF4] };
    const bytes = serialize(cmd);
    expect(bytes[0]).toBe(0x02);
    expect(bytes[1]).toBe(0x00);
    expect(bytes[2]).toBe(0x02); // payload length = 2
    expect(bytes[3]).toBe(0x01);
    expect(bytes[4]).toBe(0xF4);
  });
});

describe('deserialize', () => {
  it('deserializes a valid SetBrightness command', () => {
    const data = new Uint8Array([0x01, 0x00, 0x01, 75]);
    const cmd = deserialize(data);
    expect(cmd.type).toBe(CommandType.SetBrightness);
    expect(cmd.payload).toEqual([75]);
  });

  it('deserializes a command with empty payload', () => {
    const data = new Uint8Array([0x10, 0x00, 0x00]);
    const cmd = deserialize(data);
    expect(cmd.type).toBe(CommandType.ScanPorts);
    expect(cmd.payload).toEqual([]);
  });

  it('throws on data less than 3 bytes', () => {
    expect(() => deserialize(new Uint8Array([0x01]))).toThrow(
      'Datos insuficientes: se esperan al menos 3 bytes, se recibieron 1'
    );
    expect(() => deserialize(new Uint8Array([]))).toThrow(
      'Datos insuficientes: se esperan al menos 3 bytes, se recibieron 0'
    );
    expect(() => deserialize(new Uint8Array([0x01, 0x00]))).toThrow(
      'Datos insuficientes: se esperan al menos 3 bytes, se recibieron 2'
    );
  });

  it('throws on incomplete payload', () => {
    // Header says 3 bytes payload, but only 1 byte available
    const data = new Uint8Array([0x01, 0x00, 0x03, 0xFF]);
    expect(() => deserialize(data)).toThrow(
      'Payload incompleto: se esperan 3 bytes, se recibieron 1'
    );
  });
});

describe('prettyPrint', () => {
  it('formats a SetBrightness command', () => {
    const cmd: HardwareCommand = { type: CommandType.SetBrightness, payload: [75] };
    const result = prettyPrint(cmd);
    expect(result).toBe('[SetBrightness] payload: [4b]');
  });

  it('formats a command with empty payload', () => {
    const cmd: HardwareCommand = { type: CommandType.ScanPorts, payload: [] };
    const result = prettyPrint(cmd);
    expect(result).toBe('[ScanPorts] payload: []');
  });

  it('formats a command with multi-byte payload', () => {
    const cmd: HardwareCommand = { type: CommandType.SetActuatorPos, payload: [0x01, 0xF4] };
    const result = prettyPrint(cmd);
    expect(result).toBe('[SetActuatorPos] payload: [01 f4]');
  });
});
