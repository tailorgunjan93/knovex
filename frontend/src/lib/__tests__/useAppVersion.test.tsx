import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAppVersion } from '@/lib/useAppVersion'

afterEach(() => { vi.restoreAllMocks(); delete (window as { knovex?: unknown }).knovex })

describe('useAppVersion', () => {
  it('prefers the Electron-exposed app version', async () => {
    ;(window as { knovex?: unknown }).knovex = { appVersion: () => Promise.resolve('0.11.3') }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '9.9.9' }) }))
    const { result } = renderHook(() => useAppVersion())
    await waitFor(() => expect(result.current).toBe('0.11.3'))
  })

  it('falls back to the backend health version (dev / no electron bridge)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '0.11.3' }) }))
    const { result } = renderHook(() => useAppVersion())
    await waitFor(() => expect(result.current).toBe('0.11.3'))
  })

  it('stays empty when nothing resolves', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const { result } = renderHook(() => useAppVersion())
    await new Promise((r) => setTimeout(r, 30))
    expect(result.current).toBe('')
  })
})
