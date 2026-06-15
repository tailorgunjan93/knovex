/**
 * REAL-BACKEND E2E — slash commands + the /research agentic brief.
 *
 * Drives the real frontend against the real FastAPI backend with deterministic
 * offline fakes: KNOVEX_FAKE_LLM (the LLM) + KNOVEX_FAKE_SEARCH (web search). So
 * /web, /news and /research run over real HTTP/SSE without any network flakiness.
 *
 * Covers: the autocomplete menu, /help (local), /web (grounded chat), /research
 * (the multi-step agentic workflow), and /summarize's guidance when no source is
 * available — all asserting a clean stream with no "network error" toast.
 */

import { test, expect, type Page } from '@playwright/test'

const ERROR_TOAST = /network error|connection was interrupted|can't reach knovex|failed to/i
const DETERMINISTIC = /deterministic/i

async function openChat(page: Page) {
  await page.goto('/#/chat')
  const composer = page.locator('textarea').first()
  await expect(composer).toBeVisible({ timeout: 60_000 })
  return composer
}

// Configure a (fake) LLM so the first-run "Connect your AI" guard doesn't block
// chat (KNOVEX_FAKE_LLM ignores the key value; the frontend just needs one set).
test.beforeEach(async ({ page }) => {
  await page.request.put('http://localhost:8788/api/settings', {
    data: { onboarded: true, llm: { provider: 'openai', api_key: 'e2e-test-key' } },
  }).catch(() => {})
})

test.describe('Slash commands (real backend)', () => {
  test('typing "/" opens the command menu with every command', async ({ page }) => {
    const composer = await openChat(page)
    await composer.fill('/')
    await expect(page.locator('[data-testid="slash-menu"]')).toBeVisible()
    for (const name of ['web', 'news', 'summarize', 'research', 'help']) {
      await expect(page.locator(`[data-testid="slash-item-${name}"]`)).toBeVisible()
    }
  })

  test('/help lists the commands locally (no network)', async ({ page }) => {
    const composer = await openChat(page)
    await composer.fill('/help')
    await composer.press('Enter')
    await expect(page.getByText(/available commands/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(ERROR_TOAST)).toHaveCount(0)
  })

  test('/web streams a grounded reply', async ({ page }) => {
    const composer = await openChat(page)
    await composer.fill('/web what is knovex')
    await composer.press('Enter')
    await expect(page.getByText(DETERMINISTIC)).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText(ERROR_TOAST)).toHaveCount(0)
  })

  test('/research runs the agentic brief end-to-end (no error)', async ({ page }) => {
    const composer = await openChat(page)
    await composer.fill('/research circular motion')
    await composer.press('Enter')
    // The brief is synthesised by the fake LLM → contains "deterministic".
    await expect(page.getByText(DETERMINISTIC)).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(ERROR_TOAST)).toHaveCount(0)
  })

  test('/summarize is handled — summary stream or guidance, never an error', async ({ page }) => {
    // The resolved source depends on session state (a selected KB → summary;
    // nothing → guidance). Either outcome is valid; what must hold is that the
    // command produces a response and never drops into a network error.
    const composer = await openChat(page)
    await composer.fill('/summarize')
    await composer.press('Enter')
    await expect(page.getByText(/deterministic|attach a file/i)).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText(ERROR_TOAST)).toHaveCount(0)
  })
})
