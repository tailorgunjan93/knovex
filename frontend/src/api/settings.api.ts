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

/** Per-provider saved config (multi-provider grid). Keys masked in responses. */
export interface LLMProviderConfig {
  model: string
  api_key: string
  base_url: string
  aws_region: string
  aws_access_key_id: string
  aws_secret_access_key: string
  configured: boolean
}

export interface SearchSettings {
  engine: string
  api_key: string
}

/** Per-engine multi-search config. Free engines need no key. */
export interface SearchEngineConfig {
  enabled: boolean
  api_key: string
  configured: boolean
}

export interface EmbeddingSettings {
  enabled: boolean   // master switch — false = FTS5 only
  provider: string   // "local" | "openai"
  model: string      // openai model (ignored when provider = "local")
  api_key: string    // openai key — empty = use local model
}

export interface EmbeddingModelStatus {
  ready: boolean
  model_name: string
  size_mb: number
  model_dir: string
}

export interface DownloadProgress {
  running: boolean
  downloaded: number
  total: number
  error: string
  ready: boolean
}

export interface AppSettings {
  llm: LLMSettings
  /** Per-provider saved configs (multi-provider). Keyed by provider id. */
  llm_providers: Record<string, LLMProviderConfig>
  search: SearchSettings
  /** Per-engine multi-search configs. Keyed by engine id. */
  search_engines: Record<string, SearchEngineConfig>
  embedding: EmbeddingSettings
  theme: string
  kb_storage_path: string
  backend_port: number
  /** User's display name (added in the redesign; optional for forward-compat
   *  until the backend field + onboarding ship). Empty/undefined → "You". */
  display_name?: string
  /** Whether first-run onboarding completed. */
  onboarded?: boolean
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
    display_name: string
    onboarded: boolean
  }>): Promise<AppSettings> {
    const res = await apiClient.put<AppSettings>('/settings', patch)
    return res.data
  },

  /** Test the currently-saved LLM connection. */
  async testLLM(): Promise<TestLLMResult> {
    const res = await apiClient.post<TestLLMResult>('/settings/test-llm')
    return res.data
  },

  /** Save one provider's config (multi-provider grid). Only changed fields. */
  async setProvider(providerId: string, patch: Partial<Omit<LLMProviderConfig, 'configured'>>): Promise<AppSettings> {
    const res = await apiClient.post<AppSettings>(`/settings/llm/providers/${providerId}`, patch)
    return res.data
  },

  /** Make a saved provider the active one. */
  async activateProvider(providerId: string): Promise<AppSettings> {
    const res = await apiClient.post<AppSettings>('/settings/llm/activate', { provider: providerId })
    return res.data
  },

  /** Test a specific provider without changing the active one. */
  async testProvider(providerId: string): Promise<TestLLMResult> {
    const res = await apiClient.post<TestLLMResult>(`/settings/llm/providers/${providerId}/test`)
    return res.data
  },

  /** Enable/disable a search engine or set its key (multi-engine). */
  async setSearchEngine(engineId: string, patch: Partial<{ enabled: boolean; api_key: string }>): Promise<AppSettings> {
    const res = await apiClient.post<AppSettings>(`/settings/search/engines/${engineId}`, patch)
    return res.data
  },

  /** Probe for a running Ollama instance. */
  async detectOllama(): Promise<OllamaDetectResult> {
    const res = await apiClient.get<OllamaDetectResult>('/settings/ollama/detect')
    return res.data
  },

  /** Get available models for a provider.
   *  Pass apiKey to fetch live models even before the key has been saved. */
  async getModels(provider: string, apiKey?: string): Promise<LLMModelsResult> {
    const res = await apiClient.get<LLMModelsResult>('/settings/llm/models', {
      params: { provider, ...(apiKey ? { api_key: apiKey } : {}) },
    })
    return res.data
  },

  /** Check if the local ONNX model is downloaded. */
  async getEmbeddingModelStatus(): Promise<EmbeddingModelStatus> {
    const res = await apiClient.get<EmbeddingModelStatus>('/settings/embedding/model-status')
    return res.data
  },

  /** Trigger background download of the ONNX model (~45 MB). */
  async downloadEmbeddingModel(): Promise<{ status: string }> {
    const res = await apiClient.post<{ status: string }>('/settings/embedding/download-model')
    return res.data
  },

  /** Poll download progress. */
  async getDownloadProgress(): Promise<DownloadProgress> {
    const res = await apiClient.get<DownloadProgress>('/settings/embedding/download-progress')
    return res.data
  },
}
