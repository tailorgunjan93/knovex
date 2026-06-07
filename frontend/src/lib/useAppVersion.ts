/**
 * Resolve the running app version for display.
 *
 * Prefers the Electron-exposed packaged app version (`window.knovex.appVersion`);
 * falls back to the backend's reported version via /api/health (which also works
 * in the dev browser). Returns "" until resolved so the caller can render nothing.
 */

import { useEffect, useState } from 'react'
import { API_BASE } from '@/api/client'

export function useAppVersion(): string {
  const [version, setVersion] = useState('')

  useEffect(() => {
    let cancelled = false
    const set = (v?: string | null) => { if (!cancelled && v) setVersion(v) }

    const run = async () => {
      // Prefer the Electron-exposed packaged app version.
      const knovex = (window as { knovex?: { appVersion?: () => Promise<string> } }).knovex
      if (knovex?.appVersion) {
        try {
          const v = await knovex.appVersion()
          if (v) { set(v); return }
        } catch { /* fall through to health */ }
      }
      // Fallback (and dev browser): the running backend reports its version.
      try {
        const r = await fetch(`${API_BASE}/api/health`)
        if (r.ok) set((await r.json())?.version)
      } catch { /* leave empty */ }
    }
    run()

    return () => { cancelled = true }
  }, [])

  return version
}
