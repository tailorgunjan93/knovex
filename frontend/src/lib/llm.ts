/**
 * LLM configuration status.
 *
 * A fresh install ships with provider "openai" and an EMPTY api_key, so the
 * user's first Chat/Learn attempt would fail with a raw auth error. The app uses
 * `llmConfigured` to detect that up front and guide the user to set up an AI
 * provider instead of letting them hit an error and leave.
 */
import type { AppSettings } from '@/api/settings.api'

/** True when the active LLM can actually answer (Ollama needs no key; others need one). */
export function llmConfigured(settings: AppSettings | null | undefined): boolean {
  const llm = settings?.llm
  if (!llm) return false
  if (llm.provider === 'ollama') return true          // local model — no key required
  return typeof llm.api_key === 'string' && llm.api_key.trim().length > 0
}
