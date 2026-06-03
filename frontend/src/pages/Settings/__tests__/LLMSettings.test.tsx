/**
 * LLMSettings — multi-provider card grid.
 *
 * Covers the grid: every provider renders as a card, the active provider is
 * marked + its toggle locked on, configured-but-inactive providers can be
 * activated, unconfigured ones are disabled, and saving/activating call the
 * right API.
 */

import { type ReactElement } from 'react'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, createTheme } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { AppSettings, LLMProviderConfig } from '@/api/settings.api'
import LLMSettingsTab from '@/pages/Settings/LLMSettings'

vi.mock('@/api/settings.api', () => ({
  settingsApi: {
    setProvider:      vi.fn().mockResolvedValue({}),
    activateProvider: vi.fn().mockResolvedValue({}),
    testProvider:     vi.fn().mockResolvedValue({ success: true, latency_ms: 42, error: null }),
    getModels:        vi.fn().mockResolvedValue({ provider: '', models: [] }),
  },
}))

import { settingsApi } from '@/api/settings.api'

function cfg(over: Partial<LLMProviderConfig> = {}): LLMProviderConfig {
  return {
    model: '', api_key: '', base_url: '', aws_region: 'us-east-1',
    aws_access_key_id: '', aws_secret_access_key: '', configured: false, ...over,
  }
}

function makeSettings(
  activeProvider = 'openai',
  providers: Record<string, LLMProviderConfig> = {},
): AppSettings {
  return {
    llm: {
      provider: activeProvider, model: 'gpt-4o-mini', api_key: '', base_url: '',
      aws_region: 'us-east-1', aws_access_key_id: '', aws_secret_access_key: '',
    },
    llm_providers: providers,
    search: { engine: 'duckduckgo', api_key: '' },
    embedding: { enabled: false, provider: 'local', model: 'text-embedding-3-small', api_key: '' },
    theme: 'dark', kb_storage_path: '', backend_port: 8765,
  }
}

function renderGrid(settings: AppSettings): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={createTheme()}>
        <LLMSettingsTab settings={settings} />
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('LLMSettings grid', () => {
  it('renders a card for every supported provider', () => {
    renderGrid(makeSettings())
    for (const id of ['openai', 'anthropic', 'groq', 'gemini', 'cerebras', 'bedrock', 'ollama']) {
      expect(screen.getByTestId(`provider-${id}`)).toBeInTheDocument()
    }
  })

  it('shows the configured · supported count', () => {
    renderGrid(makeSettings('openai', {
      openai: cfg({ configured: true }),
      anthropic: cfg({ configured: true }),
    }))
    expect(screen.getByText(/2 configured · 7 supported/)).toBeInTheDocument()
  })

  it('marks the active provider and locks its toggle on', () => {
    renderGrid(makeSettings('openai', { openai: cfg({ configured: true }) }))
    const card = screen.getByTestId('provider-openai')
    expect(within(card).getByText('Active')).toBeInTheDocument()
    const toggle = within(card).getByRole('checkbox') as HTMLInputElement
    expect(toggle).toBeChecked()
    expect(toggle).toBeDisabled()   // can't deactivate the active one
  })

  it('lets a configured non-active provider be activated', async () => {
    renderGrid(makeSettings('openai', {
      openai: cfg({ configured: true }),
      anthropic: cfg({ configured: true }),
    }))
    const card = screen.getByTestId('provider-anthropic')
    expect(within(card).getByText('Configured · standby')).toBeInTheDocument()
    const toggle = within(card).getByRole('checkbox')
    expect(toggle).toBeEnabled()
    fireEvent.click(toggle)
    await waitFor(() => expect(settingsApi.activateProvider).toHaveBeenCalledWith('anthropic'))
  })

  it('disables the toggle for an unconfigured provider', () => {
    renderGrid(makeSettings('openai', { openai: cfg({ configured: true }) }))
    const card = screen.getByTestId('provider-groq')
    expect(within(card).getByText('Not connected')).toBeInTheDocument()
    expect(within(card).getByRole('checkbox')).toBeDisabled()
  })

  it('saves a pasted key via setProvider', async () => {
    renderGrid(makeSettings('openai', { openai: cfg({ configured: true }) }))
    const card = screen.getByTestId('provider-anthropic')
    const input = within(card).getByPlaceholderText(/Paste API key/i)
    await userEvent.type(input, 'sk-ant-123')
    fireEvent.click(within(card).getByRole('button', { name: /Save/i }))
    await waitFor(() =>
      expect(settingsApi.setProvider).toHaveBeenCalledWith(
        'anthropic',
        expect.objectContaining({ api_key: 'sk-ant-123' }),
      ),
    )
  })

  it('does not render the old embeddings section (it has its own tab)', () => {
    renderGrid(makeSettings())
    expect(screen.queryByText(/Download Model/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/all-MiniLM/i)).not.toBeInTheDocument()
  })
})
