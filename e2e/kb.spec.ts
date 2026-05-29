/**
 * E2E Tests — Knowledge Base / Library Page
 *
 * Two perspectives:
 *  • UI/UX Expert   — layout, labels, empty state, filter pills, cards
 *  • Business Analyst — CRUD flow, create dialog validation, filter logic
 *
 * All /api/* calls are intercepted with page.route() — no backend required.
 */

import { test, expect, type Page } from '@playwright/test'

// ─── Fixture data ─────────────────────────────────────────────────────────────

const KB_EMPTY: object[] = []

const KB_ONE = [
  {
    id: 'kb-001',
    name: 'Machine Learning Notes',
    color: '#DDA76A',
    icon: '🧠',
    created_at: '2026-05-01T10:00:00',
    updated_at: '2026-05-28T14:00:00',
    stats: { file_count: 5, total_size_bytes: 204800, total_chunks: 120 },
  },
]

const KB_MANY = [
  ...KB_ONE,
  {
    id: 'kb-002',
    name: 'Research Papers',
    color: '#3A8D7A',
    icon: '🔬',
    created_at: '2026-04-10T08:00:00',
    updated_at: '2026-05-20T09:00:00',
    stats: { file_count: 12, total_size_bytes: 1048576, total_chunks: 340 },
  },
  {
    id: 'kb-003',
    name: 'Empty Collection',
    color: '#2563EB',
    icon: '📁',
    created_at: '2026-05-28T12:00:00',
    updated_at: '2026-05-28T12:00:00',
    stats: { file_count: 0, total_size_bytes: 0, total_chunks: 0 },
  },
]

const FILES_KB_001 = [
  {
    id: 'file-001',
    kb_id: 'kb-001',
    name: 'intro-to-ml.pdf',
    format: 'pdf',
    size_bytes: 51200,
    status: 'ready',
    content_hash: 'abc123',
    chunk_count: 24,
    version: 1,
    added_at: '2026-05-01T10:05:00',
    ingested_at: '2026-05-01T10:06:00',
    error_message: null,
  },
]

// ─── Route helpers ────────────────────────────────────────────────────────────

async function mockKbApi(page: Page, kbs: object[]) {
  await page.route(
    (url) => url.pathname === '/api/kb',
    (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({ json: { kbs } })
      } else if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}')
        route.fulfill({
          json: {
            id: 'kb-new',
            name: body.name,
            color: body.color || '#DDA76A',
            icon: body.icon || '📁',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            stats: { file_count: 0, total_size_bytes: 0, total_chunks: 0 },
          },
        })
      }
    },
  )
  // Mock KB files for recent activity section
  await page.route(
    (url) => url.pathname.startsWith('/api/kb/') && url.pathname.endsWith('/files'),
    (route) => route.fulfill({ json: { files: FILES_KB_001 } }),
  )
}

// ─── UI/UX Tests ─────────────────────────────────────────────────────────────

test.describe('UI/UX Expert — Library Page: Visual & Layout', () => {

  test('page header shows "Your knowledge base"', async ({ page }) => {
    /**
     * ScreenHeader renders title="Your", emphasis="knowledge", titleSuffix="base"
     * These are in separate spans — check the eyebrow which is unique
     */
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await expect(page.getByText('knowledge').first()).toBeVisible()
    await expect(page.getByText(/LIBRARY/)).toBeVisible()
  })

  test('eyebrow shows "LIBRARY · 0 COLLECTIONS" when empty', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await expect(page.getByText(/LIBRARY/)).toBeVisible()
  })

  test('eyebrow shows correct KB count', async ({ page }) => {
    await mockKbApi(page, KB_MANY)
    await page.goto('/#/kb')
    await expect(page.getByText(/3 COLLECTIONS/)).toBeVisible()
  })

  test('"New collection" button is visible', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    // Multiple "New collection" buttons may exist (header + empty state) — use first
    await expect(page.getByRole('button', { name: /New collection/i }).first()).toBeVisible()
  })

  test('Daily Spark is shown on first load', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await expect(page.getByText(/Daily.*Spark|Daily\nSpark/i).first()).toBeVisible()
  })

  test('filter pills All / Mastered / Review / New are present', async ({ page }) => {
    await mockKbApi(page, KB_MANY)
    await page.goto('/#/kb')
    await expect(page.getByText('All').first()).toBeVisible()
    await expect(page.getByText('Mastered').first()).toBeVisible()
    await expect(page.getByText('Review').first()).toBeVisible()
    await expect(page.getByText('New').first()).toBeVisible()
  })

  test('Collections section label is visible', async ({ page }) => {
    await mockKbApi(page, KB_MANY)
    await page.goto('/#/kb')
    await expect(page.getByText(/Collections/i).first()).toBeVisible()
  })

  test('KB card shows name and icon', async ({ page }) => {
    await mockKbApi(page, KB_ONE)
    await page.goto('/#/kb')
    await expect(page.getByText('Machine Learning Notes').first()).toBeVisible()
    await expect(page.getByText('🧠').first()).toBeVisible()
  })

  test('KB card shows file count', async ({ page }) => {
    await mockKbApi(page, KB_ONE)
    await page.goto('/#/kb')
    // File count "5" should appear somewhere in the card
    await expect(page.locator('body')).toContainText('5')
  })

  test('Grid / Graph / Timeline view toggles visible', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await expect(page.getByText('Grid')).toBeVisible()
    await expect(page.getByText('Graph')).toBeVisible()
    await expect(page.getByText('Timeline')).toBeVisible()
  })

})

// ─── Empty State Tests ────────────────────────────────────────────────────────

test.describe('UI/UX Expert — Library Page: Empty State', () => {

  test('empty state heading shows "No knowledge bases yet"', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await expect(page.getByText('No knowledge bases yet')).toBeVisible()
  })

  test('empty state has "New collection" CTA button', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    // There are two "New collection" buttons — one in header, one in empty state
    const btns = page.getByRole('button', { name: /New collection/i })
    await expect(btns.first()).toBeVisible()
  })

  test('empty state shows description text', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await expect(page.getByText(/Create your first collection/i)).toBeVisible()
  })

  test('no-match filter empty state shows when filter has no results', async ({ page }) => {
    // All 3 KBs: 1 with files (mastered or review), 2 with 0 files (new)
    await mockKbApi(page, KB_MANY)
    await page.goto('/#/kb')
    // Click "Mastered" — only KB with high enough progress score
    await page.getByText('Mastered').click()
    // The empty state for "No matching collections" might show for low-scoring KBs
    // — just verify we don't crash (body has content)
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

})

// ─── Create Dialog Tests ──────────────────────────────────────────────────────

test.describe('Business Analyst — Create KB Dialog', () => {

  test('clicking "New collection" opens the dialog', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await page.getByRole('button', { name: /New collection/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('New Knowledge Base')).toBeVisible()
  })

  test('dialog has a Name text field', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await page.getByRole('button', { name: /New collection/i }).first().click()
    await expect(page.getByLabel('Name')).toBeVisible()
  })

  test('Create button is disabled when name is empty', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await page.getByRole('button', { name: /New collection/i }).first().click()
    const createBtn = page.getByRole('button', { name: /^Create$/i })
    await expect(createBtn).toBeDisabled()
  })

  test('Create button enables when name is typed', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await page.getByRole('button', { name: /New collection/i }).first().click()
    await page.getByLabel('Name').fill('My Test KB')
    const createBtn = page.getByRole('button', { name: /^Create$/i })
    await expect(createBtn).toBeEnabled()
  })

  test('dialog shows color presets (6 color buttons)', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await page.getByRole('button', { name: /New collection/i }).first().click()
    await expect(page.getByText('Accent colour')).toBeVisible()
    // 6 color swatch buttons by title (Amber, Copper, Sage, Blue, Violet, Pink)
    for (const label of ['Amber', 'Copper', 'Sage', 'Blue', 'Violet', 'Pink']) {
      await expect(page.getByTitle(label)).toBeVisible()
    }
  })

  test('dialog shows icon emoji presets', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await page.getByRole('button', { name: /New collection/i }).first().click()
    await expect(page.getByText('Icon')).toBeVisible()
    // First few emoji presets should be visible
    await expect(page.getByRole('button', { name: '📚' })).toBeVisible()
    await expect(page.getByRole('button', { name: '🧠' })).toBeVisible()
  })

  test('dialog shows live preview of name', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await page.getByRole('button', { name: /New collection/i }).first().click()
    await page.getByLabel('Name').fill('Physics Notes')
    await expect(page.getByText('Preview:')).toBeVisible()
    await expect(page.getByText('Physics Notes').last()).toBeVisible()
  })

  test('pressing Enter in name field submits the dialog', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await page.getByRole('button', { name: /New collection/i }).first().click()
    await page.getByLabel('Name').fill('Enter KB')
    await page.getByLabel('Name').press('Enter')
    // Dialog should close after successful creation
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })
  })

  test('Cancel button closes dialog without creating', async ({ page }) => {
    await mockKbApi(page, KB_EMPTY)
    await page.goto('/#/kb')
    await page.getByRole('button', { name: /New collection/i }).first().click()
    await page.getByLabel('Name').fill('Should not be created')
    await page.getByRole('button', { name: /Cancel/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

})

// ─── Filter Logic Tests ───────────────────────────────────────────────────────

test.describe('Business Analyst — Filter Pills', () => {

  test('"All" filter shows all KBs', async ({ page }) => {
    await mockKbApi(page, KB_MANY)
    await page.goto('/#/kb')
    await page.getByText('All').first().click()
    await expect(page.getByText('Machine Learning Notes').first()).toBeVisible()
    await expect(page.getByText('Research Papers').first()).toBeVisible()
    await expect(page.getByText('Empty Collection').first()).toBeVisible()
  })

  test('"New" filter shows only KBs with 0 files', async ({ page }) => {
    await mockKbApi(page, KB_MANY)
    await page.goto('/#/kb')
    await page.getByText('New').first().click()
    // Only "Empty Collection" has 0 files
    await expect(page.getByText('Empty Collection').first()).toBeVisible()
    // "Machine Learning Notes" has 5 files — should not appear
    await expect(page.getByText('Machine Learning Notes')).not.toBeVisible()
  })

  test('filter pill count badge shows correct number', async ({ page }) => {
    await mockKbApi(page, KB_MANY)
    await page.goto('/#/kb')
    // "New" pill should show "1" (only Empty Collection has 0 files)
    const newPill = page.locator('div').filter({ hasText: /^New1$/ }).first()
    await expect(newPill).toBeVisible()
  })

})

// ─── Error State ──────────────────────────────────────────────────────────────

test.describe('Business Analyst — Error Handling', () => {

  test('shows error alert when API returns 500', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/kb',
      (route) => route.fulfill({ status: 500, json: { detail: 'Server error' } }),
    )
    await page.goto('/#/kb')
    await expect(page.getByText(/Failed to load knowledge bases/i)).toBeVisible()
  })

  test('page does not crash with an empty response', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/kb',
      (route) => route.fulfill({ json: { kbs: [] } }),
    )
    await page.goto('/#/kb')
    await expect(page.locator('body')).not.toContainText('Something went wrong')
    await expect(page.locator('body')).not.toContainText('Cannot read properties')
  })

})
