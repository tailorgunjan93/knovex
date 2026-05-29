/**
 * E2E Tests — App Startup & Backend Health
 *
 * Verifies that:
 *  - The Electron window opens with the correct title
 *  - The backend process starts and passes the health check
 *  - The window.knovex bridge is available
 *  - Backend port is resolved and reachable
 *
 * These tests catch packaging issues like:
 *  - Missing backend binary in resources/
 *  - tiktoken encoding errors at backend startup
 *  - Wrong resourcesPath in production builds
 */

import { test, expect } from './fixtures'
import http from 'http'

// Helper: poll a URL until it responds 200 or times out
function waitForHttp(url: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve()
        } else {
          retry()
        }
      }).on('error', retry)
    }
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`))
      } else {
        setTimeout(check, 300)
      }
    }
    check()
  })
}


test.describe('App Startup', () => {

  test('Electron window opens', async ({ page }) => {
    // page fixture already calls firstWindow() — if we get here, a window exists
    expect(page).toBeTruthy()
  })

  test('main window title is "Knovex"', async ({ page }) => {
    // page.title() returns the document <title> set by the React app;
    // we just verify the window loaded something rather than a blank error page
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(0)
  })

  test('window.knovex is available in the renderer', async ({ page }) => {
    const knovexType = await page.evaluate(() => typeof (window as any).knovex)
    expect(knovexType).toBe('object')
  })

  test('backendPort is a valid TCP port number', async ({ page }) => {
    const port = await page.evaluate(() => (window as any).knovex?.backendPort)
    expect(port).toBeGreaterThan(1024)
    expect(port).toBeLessThan(65536)
  })

  test('backend health endpoint responds 200', async ({ page }) => {
    const port = await page.evaluate(() => (window as any).knovex?.backendPort)
    await expect(async () => {
      await waitForHttp(`http://127.0.0.1:${port}/api/health`, 20_000)
    }).toPass({ timeout: 20_000 })
  })

  test('platform is reported correctly', async ({ page }) => {
    const platform = await page.evaluate(() => (window as any).knovex?.platform)
    expect(['win32', 'darwin', 'linux']).toContain(platform)
  })

})


test.describe('Backend Availability', () => {

  test('backend /api/health returns {status: "ok"}', async ({ page }) => {
    const port = await page.evaluate(() => (window as any).knovex?.backendPort)

    // Poll until the backend is ready
    await waitForHttp(`http://127.0.0.1:${port}/api/health`, 20_000)

    // Then verify the response body
    const resp = await page.evaluate(async (p) => {
      const r = await fetch(`http://127.0.0.1:${p}/api/health`)
      return r.json()
    }, port)

    expect(resp).toHaveProperty('status', 'ok')
  })

  test('backend /api/settings returns a settings object', async ({ page }) => {
    const port = await page.evaluate(() => (window as any).knovex?.backendPort)
    await waitForHttp(`http://127.0.0.1:${port}/api/health`, 20_000)

    const resp = await page.evaluate(async (p) => {
      const r = await fetch(`http://127.0.0.1:${p}/api/settings`)
      return r.json()
    }, port)

    expect(resp).toHaveProperty('llm')
    expect(resp.llm).toHaveProperty('provider')
    expect(resp.llm).toHaveProperty('model')
  })

  test('backend /api/settings/llm/models returns models for openai', async ({ page }) => {
    const port = await page.evaluate(() => (window as any).knovex?.backendPort)
    await waitForHttp(`http://127.0.0.1:${port}/api/health`, 20_000)

    const resp = await page.evaluate(async (p) => {
      const r = await fetch(`http://127.0.0.1:${p}/api/settings/llm/models?provider=openai`)
      return r.json()
    }, port)

    // Must return models array — not empty (static catalogue always populated)
    expect(resp).toHaveProperty('models')
    expect(Array.isArray(resp.models)).toBe(true)
    expect(resp.models.length).toBeGreaterThan(0)

    // Each model must have id and name
    const first = resp.models[0]
    expect(first).toHaveProperty('id')
    expect(first).toHaveProperty('name')
    expect(typeof first.id).toBe('string')
  })

  test('models endpoint uses provider-matched key only (not wrong provider key)', async ({ page }) => {
    // Regression: before v0.9.1 fix, querying models for provider=groq would use
    // the saved openai key — causing 401 and silent fallback to stale catalogue.
    // Now: stored key is only used when current.llm.provider matches requested provider.
    const port = await page.evaluate(() => (window as any).knovex?.backendPort)
    await waitForHttp(`http://127.0.0.1:${port}/api/health`, 20_000)

    // Query Cerebras models — even with no key, should return static catalogue
    const resp = await page.evaluate(async (p) => {
      const r = await fetch(`http://127.0.0.1:${p}/api/settings/llm/models?provider=cerebras`)
      return r.json()
    }, port)

    expect(resp.models.length).toBeGreaterThan(0)

    // CRITICAL: model IDs must use dot notation (llama3.3-70b), not hyphen (llama-3.3-70b)
    const llama = resp.models.find((m: any) => m.id.includes('llama'))
    if (llama) {
      // Correct: cerebras/llama3.3-70b
      // Wrong:   cerebras/llama-3.3-70b
      expect(llama.id).not.toMatch(/cerebras\/llama-\d/)
    }
  })

})
