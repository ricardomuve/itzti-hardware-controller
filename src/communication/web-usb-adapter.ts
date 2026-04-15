/// <reference path="./web-usb.d.ts" />

import type { IHardwarePort } from './hardware-port';
import type { PortInfo } from './types';

/**
 * Default read transfer size in bytes.
 * 64 bytes is a common max packet size for USB bulk endpoints.
 */
const READ_TRANSFER_LENGTH = 64;

/**
 * Adaptador WebUSB para comunicación USB desde el navegador.
 *
 * Usa navigator.usb para solicitar permisos, abrir dispositivo, transferir datos.
 * Requiere navegadores compatibles con WebUSB (Chrome 61+, Edge 79+).
 *
 * Requisitos: 9.2, 9.3
 */
export class WebUSBAdapter implements IHardwarePort {
  private device: USBDevice | null = null;
  private connected = false;
  private reading = false;

  /** Interface number claimed on the device */
  private interfaceNumber = 0;
  /** Endpoint number for bulk IN transfers (device → host) */
  private inEndpoint = 0;
  /** Endpoint number for bulk OUT transfers (host → device) */
  private outEndpoint = 0;

  private dataCallback: ((data: Uint8Array) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private disconnectCallback: (() => void) | null = null;

  /** Bound handler for the navigator.usb disconnect event */
  private boundOnUsbDisconnect: ((ev: USBConnectionEvent) => void) | null = null;

  /**
   * Lista dispositivos USB ya autorizados por el usuario.
   * Usa navigator.usb.getDevices() que retorna dispositivos con permisos previos.
   */
  async listPorts(): Promise<PortInfo[]> {
    if (!('usb' in navigator)) {
      throw new Error('WebUSB no está disponible en este navegador.');
    }

    const devices = await navigator.usb.getDevices();
    return devices.map((device, index) => ({
      path: `web-usb-${index}`,
      manufacturer: device.manufacturerName ?? undefined,
      vendorId: device.vendorId.toString(16),
      productId: device.productId.toString(16),
    }));
  }

  /**
   * Solicita permisos al usuario y abre el dispositivo USB seleccionado.
   * Usa navigator.usb.requestDevice() para mostrar el diálogo de selección
   * del navegador (requisito 9.2: solicitar permisos antes de conectar).
   *
   * The baudRate parameter is accepted for interface compatibility but is
   * not used by USB — transfer speed is negotiated by the USB protocol.
   */
  async connect(_portPath: string, _baudRate: number): Promise<void> {
    if (!('usb' in navigator)) {
      throw new Error('WebUSB no está disponible en este navegador.');
    }

    if (this.connected) {
      throw new Error('Ya existe una conexión activa. Desconecte primero.');
    }

    // Solicitar permiso y selección de dispositivo al usuario (req 9.2)
    // Accept any USB device — the user picks from the browser dialog.
    this.device = await navigator.usb.requestDevice({ filters: [] });

    // Open the device
    await this.device.open();

    // Select the first configuration if not already selected
    if (!this.device.configuration && this.device.configurations.length > 0) {
      await this.device.selectConfiguration(
        this.device.configurations[0].configurationValue
      );
    }

    // Find a suitable interface with bulk IN and OUT endpoints
    this.findEndpoints();

    // Claim the interface
    await this.device.claimInterface(this.interfaceNumber);

    this.connected = true;

    // Listen for unexpected disconnection via navigator.usb
    this.boundOnUsbDisconnect = (ev: USBConnectionEvent) => {
      if (ev.device === this.device) {
        this.handleDisconnect();
      }
    };
    navigator.usb.addEventListener(
      'disconnect',
      this.boundOnUsbDisconnect as EventListener
    );

    // Start continuous read loop
    this.startReadLoop();
  }

  /**
   * Cierra la conexión activa, liberando la interfaz y cerrando el dispositivo.
   */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.device) {
      return;
    }

    this.reading = false;

    // Remove the global disconnect listener
    if (this.boundOnUsbDisconnect) {
      navigator.usb.removeEventListener(
        'disconnect',
        this.boundOnUsbDisconnect as EventListener
      );
      this.boundOnUsbDisconnect = null;
    }

    try {
      await this.device.releaseInterface(this.interfaceNumber);
    } catch {
      // Ignore errors releasing interface (may already be released)
    }

    try {
      await this.device.close();
    } catch {
      // Ignore errors closing device (may already be closed)
    }

    this.device = null;
    this.connected = false;
  }

  /**
   * Envía bytes al dispositivo a través de un bulk OUT transfer.
   */
  async write(data: Uint8Array): Promise<void> {
    if (!this.connected || !this.device) {
      throw new Error('No hay conexión activa. Conecte un dispositivo primero.');
    }

    const result = await this.device.transferOut(
      this.outEndpoint,
      data.buffer as ArrayBuffer
    );
    if (result.status !== 'ok') {
      throw new Error(`Error en transferencia USB OUT: status=${result.status}`);
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
   * Scans the device configuration to find a suitable interface with
   * bulk IN and bulk OUT endpoints. Sets interfaceNumber, inEndpoint,
   * and outEndpoint.
   */
  private findEndpoints(): void {
    if (!this.device?.configuration) {
      throw new Error('El dispositivo USB no tiene una configuración activa.');
    }

    for (const iface of this.device.configuration.interfaces) {
      const alt = iface.alternate;
      let bulkIn: USBEndpoint | undefined;
      let bulkOut: USBEndpoint | undefined;

      for (const ep of alt.endpoints) {
        if (ep.type === 'bulk' && ep.direction === 'in' && !bulkIn) {
          bulkIn = ep;
        }
        if (ep.type === 'bulk' && ep.direction === 'out' && !bulkOut) {
          bulkOut = ep;
        }
      }

      if (bulkIn && bulkOut) {
        this.interfaceNumber = iface.interfaceNumber;
        this.inEndpoint = bulkIn.endpointNumber;
        this.outEndpoint = bulkOut.endpointNumber;
        return;
      }
    }

    throw new Error(
      'No se encontró una interfaz USB con endpoints bulk IN y OUT.'
    );
  }

  /**
   * Inicia un bucle de lectura continua usando transferIn.
   * Lee chunks de datos y los pasa al callback registrado.
   */
  private startReadLoop(): void {
    if (!this.device) {
      return;
    }

    this.reading = true;

    const readLoop = async (): Promise<void> => {
      try {
        while (this.reading && this.device) {
          const result = await this.device.transferIn(
            this.inEndpoint,
            READ_TRANSFER_LENGTH
          );

          if (result.status !== 'ok') {
            throw new Error(
              `Error en transferencia USB IN: status=${result.status}`
            );
          }

          if (result.data && result.data.byteLength > 0 && this.dataCallback) {
            this.dataCallback(new Uint8Array(result.data.buffer));
          }
        }
      } catch (error) {
        if (this.reading) {
          // Only report error if not an intentional stop
          if (this.errorCallback) {
            this.errorCallback(
              error instanceof Error ? error : new Error(String(error))
            );
          }
          this.handleDisconnect();
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

    // Clean up the global listener
    if (this.boundOnUsbDisconnect) {
      navigator.usb.removeEventListener(
        'disconnect',
        this.boundOnUsbDisconnect as EventListener
      );
      this.boundOnUsbDisconnect = null;
    }

    this.device = null;

    if (this.disconnectCallback) {
      this.disconnectCallback();
    }
  }
}
