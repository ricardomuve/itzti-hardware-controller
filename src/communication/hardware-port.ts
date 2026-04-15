import type { PortInfo } from './types';

/**
 * Interfaz abstracta para comunicación con hardware.
 * Encapsula las diferencias entre Canal_Serial nativo (Tauri/Rust)
 * y Web_Serial_API/WebUSB.
 */
export interface IHardwarePort {
  /** Lista puertos disponibles */
  listPorts(): Promise<PortInfo[]>;

  /** Abre conexión con un puerto específico */
  connect(portPath: string, baudRate: number): Promise<void>;

  /** Cierra la conexión activa */
  disconnect(): Promise<void>;

  /** Envía bytes al dispositivo */
  write(data: Uint8Array): Promise<void>;

  /** Registra callback para datos entrantes */
  onData(callback: (data: Uint8Array) => void): void;

  /** Registra callback para errores de conexión */
  onError(callback: (error: Error) => void): void;

  /** Registra callback para desconexión */
  onDisconnect(callback: () => void): void;

  /** Indica si hay una conexión activa */
  isConnected(): boolean;
}
