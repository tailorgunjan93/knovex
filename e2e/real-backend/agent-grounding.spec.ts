/**
 * REAL-BACKEND E2E — agent / router grounding decisions.
 *
 * These drive the real frontend ↔ real FastAPI backend (KNOVEX_FAKE_LLM +
 * KNOVEX_FAKE_SEARCH) using **shiva-chat, Knovex's in-house local LLM**, which is
 * NOT ReAct-capable → it takes the deterministic router path. That path is the
 * one most real users hit, and it's fully deterministic (no LLM call for its
 * decisions), so these three journeys are reproducible in CI:
 *
 *   1. "hi"            → greeting: NO retrieval, NO sources (the screenshot bug).
 *   2. a KB question   → grounded: the source file appears.
 *   3. a /web question → web sources appear.
 *
 * A KB with distinctive content is seeded once via the API; the chat auto-selects
 * all KBs on load, so case 1 is a genuine "KB selected but not grounded" repro.
 */

import { test, expect, type Page } from '@playwright/test'

const BACKEND = 'http://localhost:8788'
const ERROR_TOAST = /network error|connection was interrupted|can't reach knovex|failed to/i
const DETERMINISTIC = /deterministic/i

const KB_FILE = 'rrf-notes.txt'
const KB_CONTENT =
  'Knovex retrieval uses Reciprocal Rank Fusion to combine BM25 keyword scores ' +
  'with dense vector similarity for accurate grounding.'

let kbId = ''

// Seed one KB with distinctive, FTS-searchable content (synchronous ingest).
test.beforeAll(async ({ request }) => {
  const created = await request.post(`${BACKEND}/api/kb`, {
    data: { name: `Agent E2E KB ${Date.now()}` },
  })
  expect(created.ok()).toBeTruthy()
  kbId = (await created.json()).id

  const up = await request.post(`${BACKEND}/api/kb/${kbId}/upload`, {
    multipart: {
      file: { name: KB_FILE, mimeType: 'text/plain', buffer: Buffer.from(KB_CONTENT) },
    },
  })
  expect(up.ok()).toBeTruthy()
  const fileId = (await up.json()).id

  // Wait until ingestion produced searchable chunks (status → chunks_indexed).
  await expect
    .poll(async () => {
      const s = await request.get(`${BACKEND}/api/kb/${kbId}/files/${fileId}/status`)
      return s.ok() ? ((await s.json()).chunks_indexed ?? 0) : 0
    }, { timeout: 45_000, message: 'KB file never finished ingesting' })
    .toBeGreaterThan(0)
})

// Clean up the seeded KB so repeated local runs don't accumulate KBs (which
// would pollute sibling specs that assume a near-clean backend).
test.afterAll(async ({ request }) => {
  if (kbId) await request.delete(`${BACKEND}/api/kb/${kbId}`).catch(() => {})
})

// Use the in-house shiva-chat model → deterministic router path (not ReAct).
test.beforeEach(async ({ page }) => {
  await page.request.put(`${BACKEND}/api/settings`, {
    data: {
      onboarded: true,
      llm: { provider: 'ollama', model: 'shiva-chat:latest', api_key: '' },
    },
  }).catch(() => {})
})

async function openChatWithKb(page: Page) {
  await page.goto('/#/chat')
  const composer = page.locator('textarea').first()
  await expect(composer).toBeVisible({ timeout: 60_000 })
  // KBs auto-select on load → the "All KBs" scope chip confirms a KB is in scope.
  await expect(page.getByText('All KBs')).toBeVisible({ timeout: 30_000 })
  return composer
}

test.describe('Agent grounding — in-house shiva-chat (router path)', () => {
  test('greeting "hi" grounds nothing even with a KB selected', async ({ page }) => {
    const composer = await openChatWithKb(page)
    await composer.fill('hi')
    await composer.press('Enter')

    await expect(page.getByText(DETERMINISTIC)).toBeVisible({ timeout: 45_000 })
    // The screenshot bug: a greeting must NOT pull the KB in as a source.
    await expect(page.getByText(KB_FILE)).toHaveCount(0)
    await expect(page.getByText(ERROR_TOAST)).toHaveCount(0)
  })

  test('a knowledge-base question is grounded with a source', async ({ page }) => {
    const composer = await openChatWithKb(page)
    await composer.fill('What is Reciprocal Rank Fusion in Knovex?')
    await composer.press('Enter')

    await expect(page.getByText(DETERMINISTIC)).toBeVisible({ timeout: 45_000 })
    // Grounded → the seeded source file shows in the sources panel.
    await expect(page.getByText(KB_FILE).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(ERROR_TOAST)).toHaveCount(0)
  })

  test('a /web question surfaces web sources', async ({ page }) => {
    const composer = await openChatWithKb(page)
    await composer.fill('/web latest mars mission news')
    await composer.press('Enter')

    await expect(page.getByText(DETERMINISTIC)).toBeVisible({ timeout: 45_000 })
    // Deterministic fake search → these canned web sources render as chips.
    await expect(page.getByText('Knovex E2E Source A').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(ERROR_TOAST)).toHaveCount(0)
  })
})
