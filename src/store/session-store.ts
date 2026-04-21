/**
 * Store de sesiones con Zustand.
 * Gestiona el ciclo de vida de sesiones biométricas y la comunicación
 * con el backend SQLite vía Tauri commands.
 * En modo web/dev usa localStorage como fallback.
 */

import { create } from 'zustand';

export interface SessionSummary {
  id: string;
  startedAt: number;
  endedAt: number | null;
  presetId: string | null;
  notes: string | null;
  sampleCount: number;
  eventCount: number;
}

export interface SessionStoreState {
  /** Currently active session ID */
  activeSessionId: string | null;
  /** List of past sessions */
  sessions: SessionSummary[];
  loading: boolean;

  startSession: (presetId?: string, notes?: string) => Promise<string>;
  endSession: () => Promise<void>;
  loadSessions: () => Promise<void>;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

function generateId(): string {
  return crypto.randomUUID();
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  activeSessionId: null,
  sessions: [],
  loading: false,

  startSession: async (presetId?: string, notes?: string): Promise<string> => {
    const sessionId = generateId();

    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('db_create_session', {
        sessionId,
        presetId: presetId ?? null,
        notes: notes ?? null,
      });
    } else {
      // localStorage fallback for web dev
      const sessions = JSON.parse(localStorage.getItem('itzti:sessions') || '[]');
      sessions.push({
        id: sessionId,
        startedAt: Date.now(),
        endedAt: null,
        presetId: presetId ?? null,
        notes: notes ?? null,
        sampleCount: 0,
        eventCount: 0,
      });
      localStorage.setItem('itzti:sessions', JSON.stringify(sessions));
    }

    set({ activeSessionId: sessionId });
    return sessionId;
  },

  endSession: async (): Promise<void> => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;

    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('db_end_session', { sessionId: activeSessionId });
    } else {
      const sessions = JSON.parse(localStorage.getItem('itzti:sessions') || '[]');
      const updated = sessions.map((s: any) =>
        s.id === activeSessionId ? { ...s, endedAt: Date.now() } : s,
      );
      localStorage.setItem('itzti:sessions', JSON.stringify(updated));
    }

    set({ activeSessionId: null });
  },

  loadSessions: async (): Promise<void> => {
    set({ loading: true });

    try {
      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core');
        const rows = await invoke<any[]>('db_list_sessions');
        const sessions: SessionSummary[] = rows.map((r) => ({
          id: r.id,
          startedAt: r.started_at,
          endedAt: r.ended_at ?? null,
          presetId: r.preset_id ?? null,
          notes: r.notes ?? null,
          sampleCount: r.sample_count ?? 0,
          eventCount: r.event_count ?? 0,
        }));
        set({ sessions, loading: false });
      } else {
        const raw = JSON.parse(localStorage.getItem('itzti:sessions') || '[]');
        const sessions: SessionSummary[] = raw.map((r: any) => ({
          id: r.id,
          startedAt: r.startedAt,
          endedAt: r.endedAt ?? null,
          presetId: r.presetId ?? null,
          notes: r.notes ?? null,
          sampleCount: r.sampleCount ?? 0,
          eventCount: r.eventCount ?? 0,
        }));
        set({ sessions, loading: false });
      }
    } catch (e) {
      console.error('[session-store] Load error:', e);
      set({ sessions: [], loading: false });
    }
  },
}));
