import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import BackendGate from '@/components/BackendGate'

describe('BackendGate', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('shows the splash first, then renders children once health is OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    render(<BackendGate><div>APP CONTENT</div></BackendGate>)
    // Splash appears immediately…
    expect(screen.getByText(/Starting Knovex/i)).toBeInTheDocument()
    // …then the app once the health check resolves.
    expect(await screen.findByText('APP CONTENT')).toBeInTheDocument()
    expect(screen.queryByText(/Starting Knovex/i)).not.toBeInTheDocument()
  })

  it('does not render children while the backend is unreachable', async () => {
    // fetch rejects (connection refused) → check returns false → stays on splash.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('refused')))
    render(<BackendGate><div>APP CONTENT</div></BackendGate>)
    expect(screen.getByText(/Starting Knovex/i)).toBeInTheDocument()
    // Give it a tick; children must NOT appear.
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('APP CONTENT')).not.toBeInTheDocument()
  })
})
