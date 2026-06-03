/**
 * SearchSettings — multi-engine card list.
 */

import { type ReactElement } from 'react'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, createTheme } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AppSettings, SearchEngineConfig } from '@/api/settings.api'
import SearchSettingsTab from '@/pages/Settings/SearchSettings'

vi.mock('@/api/settings.api', () => ({
  settingsApi: { setSearchEngine: vi.fn().mockResolvedValue({}) },
}))
import { settingsApi } from '@/api/settings.api'

function eng(over: Partial<SearchEngineConfig> = {}): SearchEngineConfig {
  return { enabled: false, api_key: '', configured: false, ...over }
}

function makeSettings(engines: Record<string, SearchEngineConfig>): AppSettings {
  return {
    llm: { provider: 'openai', model: 'gpt-4o-mini', api_key: '', base_url: '', aws_region: 'us-east-1', aws_access_key_id: '', aws_secret_access_key: '' },
    llm_providers: {},
    search: { engine: 'duckduckgo', api_key: '' },
    search_engines: engines,
    embedding: { enabled: false, provider: 'local', model: 'text-embedding-3-small', api_key: '' },
    theme: 'dark', kb_storage_path: '', backend_port: 8765,
  }
}

function renderTab(settings: AppSettings): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={createTheme()}><SearchSettingsTab settings={settings} /></ThemeProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('SearchSettings grid', () => {
  it('renders every engine with the lab intro', () => {
    renderTab(makeSettings({ duckduckgo: eng({ enabled: true, configured: true }) }))
    expect(screen.getByText(/blends the top results from every active engine/i)).toBeInTheDocument()
    for (const name of ['DuckDuckGo', 'Wikipedia', 'Serper', 'Brave Search']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('shows a Free badge for free engines and a key field for paid ones', () => {
    renderTab(makeSettings({}))
    expect(screen.getAllByText('Free')).toHaveLength(2)   // DuckDuckGo + Wikipedia
    expect(screen.getByPlaceholderText(/Serper API key/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Brave Search API key/i)).toBeInTheDocument()
  })

  it('toggles an engine via its checkbox', async () => {
    renderTab(makeSettings({ wikipedia: eng() }))
    // Wikipedia is the 2nd card; grab all checkboxes, click index 1
    const checks = screen.getAllByRole('checkbox')
    fireEvent.click(checks[1])
    await waitFor(() => expect(settingsApi.setSearchEngine).toHaveBeenCalledWith('wikipedia', { enabled: true }))
  })

  it('saves a paid engine key on blur', async () => {
    renderTab(makeSettings({}))
    const input = screen.getByPlaceholderText(/Serper API key/i)
    await userEvent.type(input, 'serp-123')
    fireEvent.blur(input)
    await waitFor(() => expect(settingsApi.setSearchEngine).toHaveBeenCalledWith('serper', { api_key: 'serp-123' }))
  })
})
