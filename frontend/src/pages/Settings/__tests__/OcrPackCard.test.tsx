/**
 * OcrPackCard — on-demand OCR provisioning UI.
 */

import { type ReactElement } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OcrStatus } from '@/api/ocr.api'
import OcrPackCard from '@/pages/Settings/OcrPackCard'

vi.mock('@/api/ocr.api', () => ({
  ocrApi: { status: vi.fn(), install: vi.fn(), uninstall: vi.fn() },
}))
import { ocrApi } from '@/api/ocr.api'

function st(over: Partial<OcrStatus> = {}): OcrStatus {
  return { state: 'not_installed', detail: '', python_path: null, log_tail: [], ...over }
}

function renderCard(): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={createTheme()}><OcrPackCard /></ThemeProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('OcrPackCard', () => {
  it('offers install when not installed', async () => {
    vi.mocked(ocrApi.status).mockResolvedValue(st())
    renderCard()
    expect(await screen.findByRole('button', { name: /install ocr pack/i })).toBeEnabled()
  })

  it('clicking install calls the API', async () => {
    vi.mocked(ocrApi.status).mockResolvedValue(st())
    vi.mocked(ocrApi.install).mockResolvedValue(st({ state: 'installing', detail: 'Creating…' }))
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: /install ocr pack/i }))
    await waitFor(() => expect(ocrApi.install).toHaveBeenCalled())
  })

  it('shows progress + log tail while installing', async () => {
    vi.mocked(ocrApi.status).mockResolvedValue(
      st({ state: 'installing', detail: 'Downloading docnest-ai…', log_tail: ['$ uv pip install'] }),
    )
    renderCard()
    expect(await screen.findByText(/Downloading docnest-ai/i)).toBeInTheDocument()
    expect(screen.getByText(/uv pip install/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows ready state with a Remove button', async () => {
    vi.mocked(ocrApi.status).mockResolvedValue(st({ state: 'ready', python_path: '/x/python' }))
    renderCard()
    expect(await screen.findByRole('button', { name: /remove/i })).toBeInTheDocument()
  })

  it('disables install + warns when unavailable', async () => {
    vi.mocked(ocrApi.status).mockResolvedValue(st({ state: 'unavailable', detail: "No 'uv' binary available." }))
    renderCard()
    // Wait for the unavailable state to land (warning appears), then assert disabled.
    expect(await screen.findByText(/no 'uv' binary/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /install ocr pack/i })).toBeDisabled()
  })

  it('shows an error alert when install failed', async () => {
    vi.mocked(ocrApi.status).mockResolvedValue(st({ state: 'error', detail: 'pip install failed (exit 1).' }))
    renderCard()
    expect(await screen.findByText(/pip install failed/i)).toBeInTheDocument()
  })
})
