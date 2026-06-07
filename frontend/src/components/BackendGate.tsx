/**
 * BackendGate — holds the UI behind a "Starting Knovex…" splash until the
 * backend is reachable, so cold-start requests never surface a raw "network
 * error". Renders the app once /api/health responds; offers a retry if the
 * backend can't be reached within the timeout.
 *
 * Sits OUTSIDE the app's ThemeProvider, so the splash uses inline brand styles.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE } from '@/api/client'
import { waitForBackendReady } from '@/lib/health/waitForBackend'

const COPPER = '#DDA76A'
const BG = '#0B0B0C'
const FG = '#F5F1EA'

async function pingHealth(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 2500)
    const res = await fetch(`${API_BASE}/api/health`, { signal: ctrl.signal })
    clearTimeout(t)
    return res.ok
  } catch {
    return false
  }
}

type GateState = 'checking' | 'ready' | 'failed'

export default function BackendGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>('checking')
  const runId = useRef(0)

  const start = useCallback(() => {
    const id = ++runId.current
    setState('checking')
    waitForBackendReady({ check: pingHealth }).then((ok) => {
      if (id === runId.current) setState(ok ? 'ready' : 'failed')
    })
  }, [])

  useEffect(() => { start() }, [start])

  if (state === 'ready') return <>{children}</>

  return (
    <div style={{
      position: 'fixed', inset: 0, background: BG, color: FG,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', gap: 18,
    }}>
      {state === 'checking' ? (
        <>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            border: `3px solid ${COPPER}33`, borderTopColor: COPPER,
            animation: 'kx-spin 0.8s linear infinite',
          }} />
          <div style={{ fontSize: 15, opacity: 0.85 }}>Starting Knovex…</div>
          <style>{'@keyframes kx-spin{to{transform:rotate(360deg)}}'}</style>
        </>
      ) : (
        <>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Couldn’t reach the Knovex backend</div>
          <div style={{ fontSize: 13, opacity: 0.6, maxWidth: 380, textAlign: 'center', lineHeight: 1.5 }}>
            The local backend didn’t respond. It may still be starting, or another
            program may be using its port.
          </div>
          <button
            onClick={start}
            style={{
              marginTop: 6, padding: '9px 20px', borderRadius: 999, border: 'none',
              background: COPPER, color: '#1A140C', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </>
      )}
    </div>
  )
}
