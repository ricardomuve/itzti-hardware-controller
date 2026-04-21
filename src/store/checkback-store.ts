/**
 * Check-back store — Tracks desired vs confirmed parameter values.
 *
 * Every time the app sends a command to the MCU, a PendingCommand is created.
 * When the MCU ACKs with the confirmed value, it's compared against the desired.
 * If they don't match after MAX_RETRIES, the parameter is flagged as a hardware fault.
 *
 * The Dashboard reads this store to show red-blinking indicators on mismatched params.
 */

import { create } from 'zustand';

const MAX_RETRIES = 3;
const ACK_TIMEOUT_MS = 2000; // 2 seconds to receive ACK

export type CheckbackStatus =
  | 'pending'    // command sent, waiting for ACK
  | 'confirmed'  // ACK received, values match
  | 'mismatch'   // ACK received but value differs — will retry
  | 'fault'      // MAX_RETRIES exceeded — hardware fault
  | 'timeout';   // no ACK received within timeout

export interface PendingCommand {
  /** Unique ID for this command attempt chain */
  id: string;
  deviceId: string;
  paramName: string;
  /** Value the app wants to set */
  desiredValue: number;
  /** Value the MCU confirmed (null if no ACK yet) */
  confirmedValue: number | null;
  status: CheckbackStatus;
  /** Number of send attempts so far */
  attempts: number;
  /** Timestamp of the last send */
  sentAt: number;
  /** Timestamp of the ACK (if received) */
  ackedAt: number | null;
}

export interface ParamFault {
  deviceId: string;
  paramName: string;
  desiredValue: number;
  lastConfirmedValue: number | null;
  attempts: number;
  /** When the fault was first detected */
  faultedAt: number;
}

export interface CheckbackStoreState {
  /** Active pending commands awaiting ACK */
  pending: Map<string, PendingCommand>;
  /** Parameters with confirmed hardware faults */
  faults: ParamFault[];
  /** Recently confirmed params (for UI green flash) */
  recentConfirms: Set<string>;

  // Actions
  registerCommand: (deviceId: string, paramName: string, desiredValue: number) => string;
  handleAck: (deviceId: string, paramName: string, confirmedValue: number) => void;
  checkTimeouts: () => void;
  clearFault: (deviceId: string, paramName: string) => void;
  clearAllFaults: () => void;
  /** Get the retry callback (set by the bridge) */
  _retryCallback: ((deviceId: string, paramName: string, value: number) => void) | null;
  setRetryCallback: (cb: (deviceId: string, paramName: string, value: number) => void) => void;
}

function makeId(): string {
  return `cb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Key for deduplication: one pending per device+param */
function pendingKey(deviceId: string, paramName: string): string {
  return `${deviceId}:${paramName}`;
}

export const useCheckbackStore = create<CheckbackStoreState>((set, get) => ({
  pending: new Map(),
  faults: [],
  recentConfirms: new Set(),
  _retryCallback: null,

  setRetryCallback: (cb) => set({ _retryCallback: cb }),

  registerCommand: (deviceId, paramName, desiredValue) => {
    const id = makeId();
    const key = pendingKey(deviceId, paramName);
    const existing = get().pending.get(key);

    const cmd: PendingCommand = {
      id,
      deviceId,
      paramName,
      desiredValue,
      confirmedValue: null,
      status: 'pending',
      attempts: existing ? existing.attempts + 1 : 1,
      sentAt: Date.now(),
      ackedAt: null,
    };

    set((state) => {
      const next = new Map(state.pending);
      next.set(key, cmd);
      return { pending: next };
    });

    return id;
  },

  handleAck: (deviceId, paramName, confirmedValue) => {
    const key = pendingKey(deviceId, paramName);
    const state = get();
    const cmd = state.pending.get(key);

    if (!cmd) return; // no pending command for this param

    const matches = confirmedValue === cmd.desiredValue;

    if (matches) {
      // Success — remove from pending, add to recent confirms
      set((s) => {
        const next = new Map(s.pending);
        next.delete(key);
        const confirms = new Set(s.recentConfirms);
        confirms.add(key);
        // Clear confirm flash after 2 seconds
        setTimeout(() => {
          const current = get();
          const c = new Set(current.recentConfirms);
          c.delete(key);
          set({ recentConfirms: c });
        }, 2000);
        // Also clear any existing fault for this param
        return {
          pending: next,
          recentConfirms: confirms,
          faults: s.faults.filter(
            (f) => !(f.deviceId === deviceId && f.paramName === paramName),
          ),
        };
      });
    } else if (cmd.attempts >= MAX_RETRIES) {
      // Max retries exceeded — hardware fault
      set((s) => {
        const next = new Map(s.pending);
        next.delete(key);
        const fault: ParamFault = {
          deviceId,
          paramName,
          desiredValue: cmd.desiredValue,
          lastConfirmedValue: confirmedValue,
          attempts: cmd.attempts,
          faultedAt: Date.now(),
        };
        // Replace existing fault for same param or add new
        const faults = s.faults.filter(
          (f) => !(f.deviceId === deviceId && f.paramName === paramName),
        );
        return { pending: next, faults: [...faults, fault] };
      });
    } else {
      // Mismatch but retries remaining — retry
      const updated: PendingCommand = {
        ...cmd,
        confirmedValue,
        status: 'mismatch',
        ackedAt: Date.now(),
      };
      set((s) => {
        const next = new Map(s.pending);
        next.set(key, updated);
        return { pending: next };
      });

      // Trigger retry via callback
      const retryCb = get()._retryCallback;
      if (retryCb) {
        setTimeout(() => {
          get().registerCommand(deviceId, paramName, cmd.desiredValue);
          retryCb(deviceId, paramName, cmd.desiredValue);
        }, 300); // small delay before retry
      }
    }
  },

  checkTimeouts: () => {
    const now = Date.now();
    const state = get();

    for (const [key, cmd] of state.pending) {
      if (cmd.status === 'pending' && now - cmd.sentAt > ACK_TIMEOUT_MS) {
        if (cmd.attempts >= MAX_RETRIES) {
          // Timeout after max retries → fault
          set((s) => {
            const next = new Map(s.pending);
            next.delete(key);
            const fault: ParamFault = {
              deviceId: cmd.deviceId,
              paramName: cmd.paramName,
              desiredValue: cmd.desiredValue,
              lastConfirmedValue: null,
              attempts: cmd.attempts,
              faultedAt: now,
            };
            const faults = s.faults.filter(
              (f) => !(f.deviceId === cmd.deviceId && f.paramName === cmd.paramName),
            );
            return { pending: next, faults: [...faults, fault] };
          });
        } else {
          // Timeout but retries remaining — retry
          const retryCb = get()._retryCallback;
          if (retryCb) {
            get().registerCommand(cmd.deviceId, cmd.paramName, cmd.desiredValue);
            retryCb(cmd.deviceId, cmd.paramName, cmd.desiredValue);
          }
        }
      }
    }
  },

  clearFault: (deviceId, paramName) =>
    set((s) => ({
      faults: s.faults.filter(
        (f) => !(f.deviceId === deviceId && f.paramName === paramName),
      ),
    })),

  clearAllFaults: () => set({ faults: [] }),
}));
