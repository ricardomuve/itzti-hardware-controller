/**
 * Store de dispositivos con Zustand.
 * Requisitos: 1.3, 1.4, 2.2, 2.4
 */

import { create } from 'zustand';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface DeviceState {
  id: string;
  portPath: string;
  name: string;
  status: ConnectionStatus;
  lastSeen: number; // timestamp
  params: Record<string, number>; // e.g. { brightness: 75, volume: 50 }
  error?: string | null;
}

export interface DeviceStoreState {
  devices: DeviceState[];
  error: string | null;

  addDevice: (device: DeviceState) => void;
  removeDevice: (id: string) => void;
  updateDeviceStatus: (id: string, status: ConnectionStatus) => void;
  updateDeviceParam: (id: string, paramName: string, value: number) => void;
  setDeviceError: (id: string, error: string | null) => void;
}

export const useDeviceStore = create<DeviceStoreState>((set) => ({
  devices: [],
  error: null,

  addDevice: (device) =>
    set((state) => {
      // Don't add duplicates
      if (state.devices.some((d) => d.id === device.id)) {
        return state;
      }
      return { devices: [...state.devices, device] };
    }),

  removeDevice: (id) =>
    set((state) => ({
      devices: state.devices.filter((d) => d.id !== id),
    })),

  updateDeviceStatus: (id, status) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === id ? { ...d, status, lastSeen: Date.now() } : d
      ),
    })),

  updateDeviceParam: (id, paramName, value) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === id
          ? {
              ...d,
              params: { ...d.params, [paramName]: value },
              lastSeen: Date.now(),
            }
          : d
      ),
    })),

  setDeviceError: (id, error) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === id ? { ...d, error } : d
      ),
    })),
}));
