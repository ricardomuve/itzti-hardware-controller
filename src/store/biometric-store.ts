/**
 * Store de biometría y lazo cerrado con Zustand.
 * Gestiona el estado de la sesión biométrica, umbrales,
 * score de relajación y sugerencias del motor de control.
 */

import { create } from 'zustand';
import type {
  BiometricSample,
  BiometricThreshold,
  ClosedLoopState,
  ThresholdViolation,
  EegBands,
} from '../communication/types';

export interface ExpertSuggestion {
  severity: 'info' | 'warning' | 'critical';
  message: string;
  channelId: string;
  suggestedAction: string;
  timestamp: number;
}

export interface BiometricStoreState {
  /** Whether a biometric session is active */
  sessionActive: boolean;
  sessionId: string | null;

  /** Current relaxation depth score 0–100 */
  relaxationScore: number;

  /** Configured thresholds */
  thresholds: BiometricThreshold[];

  /** Active threshold violations from the closed loop */
  violations: ThresholdViolation[];

  /** Expert suggestions queue (max 50) */
  suggestions: ExpertSuggestion[];

  /** Latest EEG band values for visualization */
  latestEegBands: EegBands | null;

  /** Latest closed-loop state from Rust backend */
  loopState: ClosedLoopState | null;

  // Actions
  setSessionActive: (active: boolean, sessionId?: string | null) => void;
  setRelaxationScore: (score: number) => void;
  setThresholds: (thresholds: BiometricThreshold[]) => void;
  setViolations: (violations: ThresholdViolation[]) => void;
  addSuggestion: (suggestion: ExpertSuggestion) => void;
  clearSuggestions: () => void;
  setLatestEegBands: (bands: EegBands) => void;
  updateFromLoopState: (state: ClosedLoopState) => void;
}

const MAX_SUGGESTIONS = 50;

export const useBiometricStore = create<BiometricStoreState>((set) => ({
  sessionActive: false,
  sessionId: null,
  relaxationScore: 0,
  thresholds: [],
  violations: [],
  suggestions: [],
  latestEegBands: null,
  loopState: null,

  setSessionActive: (active, sessionId = null) =>
    set({ sessionActive: active, sessionId: sessionId ?? null }),

  setRelaxationScore: (score) => set({ relaxationScore: score }),

  setThresholds: (thresholds) => set({ thresholds }),

  setViolations: (violations) => set({ violations }),

  addSuggestion: (suggestion) =>
    set((state) => ({
      suggestions: [...state.suggestions, suggestion].slice(-MAX_SUGGESTIONS),
    })),

  clearSuggestions: () => set({ suggestions: [] }),

  setLatestEegBands: (bands) => set({ latestEegBands: bands }),

  updateFromLoopState: (loopState) =>
    set({
      loopState,
      sessionActive: loopState.active,
      sessionId: loopState.sessionId,
      relaxationScore: loopState.relaxationScore,
      violations: loopState.violations,
    }),
}));
