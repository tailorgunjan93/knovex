import { describe, it, expect, vi } from 'vitest'
import { waitForBackendReady } from '../waitForBackend'

function fakeClock() {
  let t = 0
  return { now: () => t, sleep: async (ms: number) => { t += ms } }
}

describe('waitForBackendReady', () => {
  it('returns true immediately when already healthy', async () => {
    const check = vi.fn().mockResolvedValue(true)
    const res = await waitForBackendReady({ check, ...fakeClock() })
    expect(res).toBe(true)
    expect(check).toHaveBeenCalledTimes(1)   // no polling needed
  })

  it('polls until healthy', async () => {
    let n = 0
    const check = vi.fn(async () => ++n >= 4)   // healthy on 4th call
    const res = await waitForBackendReady({ check, intervalMs: 500, ...fakeClock() })
    expect(res).toBe(true)
    expect(check).toHaveBeenCalledTimes(4)
  })

  it('returns false after the timeout', async () => {
    const check = vi.fn().mockResolvedValue(false)
    const res = await waitForBackendReady({ check, intervalMs: 500, timeoutMs: 3000, ...fakeClock() })
    expect(res).toBe(false)
  })

  it('treats a check that resolves false (e.g. fetch failed) as not-ready, not an error', async () => {
    let n = 0
    const check = vi.fn(async () => ++n >= 2)
    const res = await waitForBackendReady({ check, intervalMs: 100, timeoutMs: 5000, ...fakeClock() })
    expect(res).toBe(true)
  })
})
