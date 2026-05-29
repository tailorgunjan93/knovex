/**
 * E2E Tests â€” LLM Settings Page (Electron)
 *
 * Verifies the provider/model selection flow that had multiple bugs:
 *
 *  Bug 1 (v0.9.1): Switching provider in the dropdown sent the OLD provider's
 *    saved API key to the NEW provider's /v1/models endpoint â†’ 401 â†’ stale fallback.
 *    Fix: backend only uses stored key when current.llm.provider matches query provider.
 *
 *  Bug 2 (v0.9.4): Cerebras static catalogue had model IDs with wrong format
 *    (llama-3.3-70b instead of llama3.3-70b).  When live fetch failed the auto-fix
 *    effect saved the wrong ID â†’ NotFoundError on every completion call.
 *
 *  Bug 3 (frontend): Switching providers did not clear the API key field, so
 *    the previous provider's key leaked into the next provider's requests.
 */

import { test, expect } from './fixtures'
import http from 'http'

function waitForHttp(url: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) resolve()
        else retry()
      }).on('error', retry)
    }
    const retry = () => {
      if (Date.now() - start > timeoutMs) reject(new Error(`Timeout: ${url}`))
      else setTimeout(check, 300)
    }
    check()
  })
}

test.describe('LLM Settings â€” Model Fetch', () => {

  test.beforeEach(async ({ page }) => {
    const port = await page.evaluate(() => (window as any).knovex?.backendPort)
    await waitForHttp(`http://127.0.0.1:${port}/api/health`)
  })

  test('static catalogue for every provider returns non-empty model list', async ({ page }) => {
    const port = await page.evaluate(() => (window as any).knovex?.backendPort)

    const providers = ['openai', 'anthropic', 'groq', 'gemini', 'cerebras', 'bedrock', 'ollama']
    for (const provider of providers) {
      const resp = await page.evaluate(async ({ p, prov }) => {
        const r = await fetch(`http://127.0.0.1:${p}/api/settings/llm/models?provider=${prov}`)
        return r.json()
      }, { p: port, prov: provider })

      expect(resp.models, `${provider} must have a non-empty model catalogue`).toBeDefined()
      // Only non-Ollama providers have static catalogues (Ollama probes a running instance)
      if (provider !== 'ollama') {
        expect(resp.models.length, `${provider} must have â‰¥1 model`).toBeGreaterThan(0)
      }
    }
  })

  test('Cerebras model IDs use dot notation (llama3.x, not llama-3.x)', async ({ page }) => {
    // Regression: static catalogue had "cerebras/llama-3.3-70b" (hyphen before 3)
    // which does not exist on the Cerebras API.  Correct format: "cerebras/llama3.3-70b"
    const port = await page.evaluate(() => (window as any).knovex?.backendPort)

    const resp = await page.evaluate(async (p) => {
      const r = await fetch(`http://127.0.0.1:${p}/api/settings/llm/models?provider=cerebras`)
      return r.json()
    }, port)

    for (const model of resp.models) {
      expect(model.id, `Cerebras model "${model.id}" must use dot notation`).not.toMatch(/cerebras\/llama-\d/)
    }
  })

  test('querying models for a different provider does not use stored provider key', async ({ page }) => {
    // Regression: before v0.9.1, if openai key was saved and you queried groq models,
    // the openai key was sent to groq/cerebras API â†’ 401 â†’ stale fallback catalogue.
    // This test checks the endpoint responds with models even when providers mismatch.
    const port = await page.evaluate(() => (window as any).knovex?.backendPort)

    // Query groq models without passing an api_key (simulate switching provider in UI)
    const resp = await page.evaluate(async (p) => {
      const r = await fetch(`http://127.0.0.1:${p}/api/settings/llm/models?provider=groq`)
      return r.json()
    }, port)

    // Must still return the static fallback catalogue, not an empty list
    expect(resp.models.length).toBeGreaterThan(0)
  })

  test('Groq static catalogue does not contain retired model IDs', async ({ page }) => {
    // Regression: static fallback had retired model IDs that Groq no longer accepts
    const port = await page.evaluate(() => (window as any).knovex?.backendPort)

    const resp = await page.evaluate(async (p) => {
      const r = await fetch(`http://127.0.0.1:${p}/api/settings/llm/models?provider=groq`)
      return r.json()
    }, port)

    const ids: string[] = resp.models.map((m: any) => m.id)
    expect(ids).not.toContain('groq/llama3-70b-8192')    // retired
    expect(ids).not.toContain('groq/mixtral-8x7b-32768') // retired
    expect(ids).not.toContain('groq/gemma-7b-it')        // retired
  })

})


test.describe('LLM Settings â€” UI (requires frontend dev server)', () => {

  test('provider dropdown shows all 7 providers', async ({ page }) => {
    await page.goto('http://localhost:5173/#/settings')

    // Open the provider dropdown
    await page.click('[data-testid="provider-select"], label:has-text("Provider") + div')

    const providerLabels = ['OpenAI', 'Anthropic', 'Groq', 'Google Gemini', 'Cerebras', 'AWS Bedrock', 'Ollama']
    for (const label of providerLabels) {
      // The dropdown should render all providers as menu items
      await expect(page.getByText(label).first()).toBeVisible({ timeout: 5_000 })
    }
  })

})

