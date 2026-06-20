/**
 * REAL-BACKEND attach / upload journeys (no secrets; fake LLM).
 *
 * Covers QA cases CH-8 (chat attach-file as context) and the KB upload→ingestion
 * path (KB-3/KB-4). Both use the browser <input type="file"> path that runs when
 * window.knovex is absent — driven with setInputFiles (reliable; no synthetic
 * drag-and-drop). Real frontend ↔ real backend over HTTP.
 */

import { test, expect } from '@playwright/test'

const ERROR_TOAST = /network error|connection was interrupted|can't reach knovex|failed to/i

// Configure a (fake) LLM so the first-run "Connect your AI" guard doesn't block
// chat (KNOVEX_FAKE_LLM ignores the key value; the frontend just needs one set).
test.beforeEach(async ({ page }) => {
  await page.request.put('http://localhost:8788/api/settings', {
    data: { onboarded: true, llm: { provider: 'openai', api_key: 'e2e-test-key' } },
  }).catch(() => {})
})

test.describe('Real-backend attach & upload', () => {
  test('Chat: attach a .txt and stream a reply (no error)', async ({ page }) => {
    await page.goto('/#/chat')
    const composer = page.locator('textarea').first()
    await expect(composer).toBeVisible({ timeout: 60_000 })
    // Wait until settings have loaded (LLM "configured") before sending —
    // otherwise the send guard silently drops the message.
    await expect(page.getByText('Start a conversation')).toBeVisible({ timeout: 30_000 })

    // Upload via the hidden chat file input (browser path).
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('The capital of Atlantis is Poseidonia. It was founded in 9600 BC.'),
    })

    // The attachment chip should appear once /chat/attach extracts the text.
    await expect(page.getByText(/notes\.txt/i)).toBeVisible({ timeout: 30_000 })

    await composer.fill('Summarise my attachment.')
    await composer.press('Enter')

    // Fake LLM streams "...deterministic reply." — the round trip completed.
    await expect(page.getByText(/deterministic/i)).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText(ERROR_TOAST)).toHaveCount(0)
  })

  test('KB: upload a file and ingestion completes (no error)', async ({ page, request }) => {
    // Set up the KB via the API (reliable), then exercise the real UI upload path.
    const res = await request.post('http://localhost:8788/api/kb', {
      data: { name: `E2E KB ${Date.now()}` },
    })
    expect(res.ok()).toBeTruthy()
    const kb = await res.json()

    // The KB page opens a specific KB via the ?kb_id= deep link.
    await page.goto(`/#/kb?kb_id=${kb.id}`)

    // The file input is intentionally hidden (triggered by a button); setInputFiles
    // works on hidden inputs, so wait for ATTACHED, not visible.
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.waitFor({ state: 'attached', timeout: 30_000 })
    await fileInput.setInputFiles({
      name: 'kb-doc.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Knovex is a local-first AI knowledge base. RRF fuses BM25 and dense scores.'),
    })

    // The uploaded file should appear (ingestion path ran); no error toast.
    await expect(page.getByText(/kb-doc\.txt/i)).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(ERROR_TOAST)).toHaveCount(0)
  })
})
