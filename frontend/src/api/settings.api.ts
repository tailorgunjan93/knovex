/**
 * Settings API — typed wrappers for all /api/settings/* endpoints
 */

import apiClient from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LLMSettings {
  provider: string
  model: string
  api_key: string
  base_url: string
  aws_region: string
  aws_access_key_id: string
  aws_secret_access_key: string
}

export interface SearchSettings {
  engine: string
  api_key: string
}

export interface EmbeddingSettings {
  provider: string   // "local" | "openai"
  model: string      // openai model (ignored when provider = "local")
  api_key: string    // openai key — empty = use local model
}

export interface AppSettings {
  llm: LLMSettings
  search: SearchSettings
  embedding: EmbeddingSettings
  theme: string
  kb_storage_path: string
  backend_port: number
}

export interface TestLLMResult {
  success: boolean
  latency_ms: number | null
  model: string
  error: string | null
}

export interface OllamaDetectResult {
  detected: boolean
  url: string
  models: string[]
}

export interface LLMModelInfo {
  id: string
  name: string
  context_window: number
}

export interface LLMModelsResult {
  provider: string
  models: LLMModelInfo[]
}

// ─── API calls ───────────────────────────────────────────────────────────────

export const settingsApi = {
  /** Get current settings (keys masked). */
  async get(): Promise<AppSettings> {
    const res = await apiClient.get<AppSettings>('/settings')
    return res.data
  },

  /** Update settings. Pass only the fields you want to change. */
  async update(patch: Partial<{
    llm: Partial<LLMSettings>
    search: Partial<SearchSettings>
    embedding: Partial<EmbeddingSettings>
    theme: string
    kb_storage_path: string
  }>): Promise<AppSettings> {
    const res = await apiClient.put<AppSettings>('/settings', patch)
    return res.data
  },

  /** Test the currently-saved LLM connection. */
  async testLLM(): Promise<TestLLMResult> {
    const res = await apiClient.post<TestLLMResult>('/settings/test-llm')
    return res.data
  },

  /** Probe for a running Ollama instance. */
  async detectOllama(): Promise<OllamaDetectResult> {
    const res = await apiClient.get<OllamaDetectResult>('/settings/ollama/detect')
    return res.data
  },

  /** Get available models for a provider. */
  async getModels(provider: string): Promise<LLMModelsResult> {
    const res = await apiClient.get<LLMModelsResult>('/settings/llm/models', {
      params: { provider },
    })
    return res.data
  },
}
