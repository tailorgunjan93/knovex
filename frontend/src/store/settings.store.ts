/**
 * Settings Zustand Store
 *
 * Manages app settings client-side state and the active MUI theme mode.
 */

import { create } from 'zustand'
import type { AppSettings } from '@/api/settings.api'

interface SettingsState {
  settings: AppSettings | null
  loading: boolean
  error: string | null

  // Actions
  setSettings: (s: AppSettings) => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,
  error: null,

  setSettings: (s) => set({ settings: s }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
}))

// Convenience selector for the current theme mode
export const useThemeMode = () =>
  useSettingsStore((s) => (s.settings?.theme ?? 'dark') as 'light' | 'medium' | 'dark')
