/// <reference path="./web-serial.d.ts" />

import type { IHardwarePort } from './hardware-port';
import type { PortInfo } from './types';

/**
 * Adaptador Web Serial API para comunicación serial desde el navegador.
 *
 * Usa navigator.serial para solicitar permisos, abrir puerto, leer/escribir datos.
 * Requiere navegadores compatibles (Chrome 89+, Edge 89+).
 *
 * Requisitos: 9.1, 9.2, 9.3
 */
export class WebSerialAdapter implements IHardwarePort {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private connected = false;
  private reading = false;

  private dataCallback: ((data: Uint8Array) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private disconnectCallback: (() => void) | null = null;

  /**
   * Lista puertos seriales ya autorizados por el usuario.
   * Usa navigator.serial.getPorts() que retorna puertos con permisos previos.
   */
  async listPorts(): Promise<PortInfo[]> {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API no está disponible en este navegador.');
    }

    const ports = await navigator.serial.getPorts();
    return ports.map((port, index) => {
      const info = port.getInfo();
      return {
        path: `web-serial-${index}`,
        vendorId: info.usbVendorId?.toString(16),
        productId: info.usbProductId?.toString(16),
      };
    });
  }

  /**
   * Solicita permisos al usuario y abre el puerto serial seleccionado.
   * Usa navigator.serial.requestPort() para mostrar el diálogo de selección
   * del navegador (requisito 9.2: solicitar permisos antes de conectar).
   */
  async connect(_portPath: string, baudRate: number): Promise<void> {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API no está disponible en este navegador.');
    }

    if (this.connected) {
      throw new Error('Ya existe una conexión activa. Desconecte primero.');
    }

    // Solicitar permiso y selección de puerto al usuario (req 9.2)
    this.port = await navigator.serial.requestPort();

    // Abrir el puerto con la velocidad de baudios especificada
    await this.port.open({ baudRate });
    this.connected = true;

    // Registrar handler de desconexión inesperada en el puerto
    this.port.ondisconnect = () => {
      this.handleDisconnect();
    };

    // Iniciar lectura continua de datos entrantes
    this.startReadLoop();
  }

  /**
   * Cierra la conexión activa, liberando reader, writer y puerto.
   */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.port) {
      return;
    }

    this.reading = false;

    // Cancelar el reader activo
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // Ignorar errores al cancelar (puede ya estar cerrado)
      }
      this.reader = null;
    }

    // Cerrar el puerto
    try {
      await this.port.close();
    } catch {
      // Ignorar errores al cerrar (puede ya estar cerrado)
    }

    this.port = null;
    this.connected = false;
  }

  /**
   * Envía bytes al dispositivo a través del WritableStream del puerto.
   */
  async write(data: Uint8Array): Promise<void> {
    if (!this.connected || !this.port) {
      throw new Error('No hay conexión activa. Conecte un dispositivo primero.');
    }

    if (!this.port.writable) {
      throw new Error('El puerto no tiene un stream de escritura disponible.');
    }

    const writer = this.port.writable.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }

  onData(callback: (data: Uint8Array) => void): void {
    this.dataCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Inicia un bucle de lectura continua del ReadableStream del puerto.
   * Lee chunks de datos y los pasa al callback registrado.
   */
  private startReadLoop(): void {
    if (!this.port?.readable) {
      return;
    }

    this.reading = true;
    this.reader = this.port.readable.getReader();

    const readLoop = async (): Promise<void> => {
      try {
        while (this.reading && this.reader) {
          const { value, done } = await this.reader.read();
          if (done) {
            break;
          }
          if (value && this.dataCallback) {
            this.dataCallback(value);
          }
        }
      } catch (error) {
        if (this.reading) {
          // Solo reportar error si no fue una cancelación intencional
          if (this.errorCallback) {
            this.errorCallback(
              error instanceof Error ? error : new Error(String(error))
            );
          }
          this.handleDisconnect();
        }
      } finally {
        if (this.reader) {
          try {
            this.reader.releaseLock();
          } catch {
            // Ignorar errores al liberar lock
          }
          this.reader = null;
        }
      }
    };

    readLoop();
  }

  /**
   * Maneja desconexión inesperada: actualiza estado y notifica callback.
   */
  private handleDisconnect(): void {
    this.connected = false;
    this.reading = false;
    this.reader = null;
    this.port = null;

    if (this.disconnectCallback) {
      this.disconnectCallback();
    }
  }
}
