/**
 * REAL-BACKEND streaming gate.
 *
 * Drives the real frontend against the real FastAPI backend (KNOVEX_FAKE_LLM=1,
 * deterministic offline LLM — no secrets) over real HTTP/SSE. These are the
 * journeys that broke with a bare "network error":
 *   - Learn → Animated  (a mid-stream drop when 'animated' wasn't a valid format)
 *   - Chat              (a mid-stream drop on the KB-retrieval numpy import)
 *
 * Mocked-API E2E (playwright.config.ts) cannot catch those because a page.route
 * stub can't drop a connection. This config can. See
 * docs/rca/2026-06-07-network-error.md.
 */

import { test, expect, type Page } from '@playwright/test'

const ERROR_TOAST = /network error|connection was interrupted|can't reach knovex|failed to/i

/** Wait past the BackendGate splash until the real app shell is interactive. */
async function waitForApp(page: Page, ready: string) {
  await expect(page.locator(`[data-testid="${ready}"]`).first()).toBeVisible({ timeout: 60_000 })
}

// Configure a (fake) LLM so the first-run "Connect your AI" guard doesn't block
// Chat/Learn. The backend runs KNOVEX_FAKE_LLM, so the key value is ignored — the
// frontend just needs a non-empty key to treat the AI as configured.
test.beforeEach(async ({ page }) => {
  await page.request.put('http://localhost:8788/api/settings', {
    data: { onboarded: true, llm: { provider: 'openai', api_key: 'e2e-test-key' } },
  }).catch(() => {})
})

test.describe('Real-backend streaming gate', () => {
  test('Learn → Animated generates and renders (no network error)', async ({ page }) => {
    await page.goto('/#/learn')
    await waitForApp(page, 'format-card-animated')

    // The format card is a Box with a React onClick + hover transform; in CI a
    // neighbouring overlay can intercept a normal click. dispatchEvent fires the
    // handler reliably regardless of overlay/animation.
    await page.locator('[data-testid="format-card-animated"]').dispatchEvent('click')
    const topic = page.getByPlaceholder(/type a topic/i)
    await topic.fill('circular motion')
    await topic.press('Enter') // triggers handleGenerate (avoids overlay-intercepted button click)

    // Positive signal: the deterministic scene text rendered by ScenePlayer.
    await expect(page.getByText('E2E animated scene')).toBeVisible({ timeout: 45_000 })

    // The lesson auto-advances; assert the `code` scene element renders (PR #27):
    // real code with line numbers + a highlighted line, for coding lessons.
    await expect(page.getByTestId('scene-code')).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText('def process(x):')).toBeVisible()

    // Negative signal: no streaming-error toast appeared at any point.
    await expect(page.getByText(ERROR_TOAST)).toHaveCount(0)
  })

  test('Chat streams a reply (no network error)', async ({ page }) => {
    await page.goto('/#/chat')
    const composer = page.locator('textarea').first()
    await expect(composer).toBeVisible({ timeout: 60_000 })
    // Wait until settings have loaded (LLM "configured") before sending —
    // otherwise the send guard silently drops the message. The empty-state
    // heading only renders once configured (else the Connect-AI card shows).
    await expect(page.getByText('Start a conversation')).toBeVisible({ timeout: 30_000 })

    await composer.fill('hi')
    await composer.press('Enter')

    // The fake client streams "...deterministic reply."
    await expect(page.getByText(/deterministic/i)).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText(ERROR_TOAST)).toHaveCount(0)
  })
})
