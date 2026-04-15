/**
 * Serialización y deserialización binaria de comandos de hardware.
 *
 * Formato binario de un Comando_Hardware:
 * [1 byte: tipo de comando] [2 bytes: longitud payload big-endian] [N bytes: payload]
 *
 * @module serialization
 */

import { CommandType, type HardwareCommand } from './types';

/**
 * Serializa un HardwareCommand a formato binario Uint8Array.
 *
 * @param command - Comando a serializar
 * @returns Uint8Array con el formato [tipo][longitud BE][payload]
 */
export function serialize(command: HardwareCommand): Uint8Array {
  const payloadLength = command.payload.length;
  const buffer = new ArrayBuffer(3 + payloadLength);
  const view = new DataView(buffer);
  view.setUint8(0, command.type);
  view.setUint16(1, payloadLength, false); // big-endian
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < payloadLength; i++) {
    arr[3 + i] = command.payload[i];
  }
  return arr;
}

/**
 * Deserializa un Uint8Array en formato binario a un HardwareCommand.
 *
 * @param data - Bytes a deserializar
 * @returns HardwareCommand deserializado
 * @throws Error si los datos son insuficientes o el payload está incompleto
 */
export function deserialize(data: Uint8Array): HardwareCommand {
  if (data.length < 3) {
    throw new Error(
      `Datos insuficientes: se esperan al menos 3 bytes, se recibieron ${data.length}`
    );
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const type = view.getUint8(0) as CommandType;
  const payloadLength = view.getUint16(1, false); // big-endian
  if (data.length < 3 + payloadLength) {
    throw new Error(
      `Payload incompleto: se esperan ${payloadLength} bytes, se recibieron ${data.length - 3}`
    );
  }
  const payload: number[] = [];
  for (let i = 0; i < payloadLength; i++) {
    payload.push(data[3 + i]);
  }
  return { type, payload };
}

/**
 * Formatea un HardwareCommand como string legible para depuración.
 *
 * @param command - Comando a formatear
 * @returns String con el nombre del tipo y payload en hexadecimal
 */
export function prettyPrint(command: HardwareCommand): string {
  const typeName =
    CommandType[command.type] ?? `Unknown(0x${command.type.toString(16)})`;
  const payloadHex = command.payload
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
  return `[${typeName}] payload: [${payloadHex}]`;
}
