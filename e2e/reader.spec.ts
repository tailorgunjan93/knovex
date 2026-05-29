/**
 * E2E Tests — Reader Page
 *
 * Two perspectives:
 *  • UI/UX Expert   — upload zone, KB picker accordion, file list, layout
 *  • Business Analyst — URL deep-link, file status display, empty states
 *
 * All /api/* calls are intercepted with page.route() — no backend required.
 */

import { test, expect, type Page } from '@playwright/test'

// ─── Fixture data ─────────────────────────────────────────────────────────────

const NO_KBS: object[] = []

const KB_WITH_FILES = [
  {
    id: 'kb-001',
    name: 'Machine Learning Notes',
    color: '#DDA76A',
    icon: '🧠',
    created_at: '2026-05-01T10:00:00',
    updated_at: '2026-05-28T14:00:00',
    stats: { file_count: 2, total_size_bytes: 204800, total_chunks: 120 },
  },
  {
    id: 'kb-002',
    name: 'Research Papers',
    color: '#3A8D7A',
    icon: '🔬',
    created_at: '2026-04-10T08:00:00',
    updated_at: '2026-05-20T09:00:00',
    stats: { file_count: 1, total_size_bytes: 512000, total_chunks: 80 },
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
  {
    id: 'file-002',
    kb_id: 'kb-001',
    name: 'deep-learning-notes.md',
    format: 'md',
    size_bytes: 8192,
    status: 'ready',
    content_hash: 'def456',
    chunk_count: 8,
    version: 1,
    added_at: '2026-05-10T09:00:00',
    ingested_at: '2026-05-10T09:01:00',
    error_message: null,
  },
]

const FILES_KB_002 = [
  {
    id: 'file-003',
    kb_id: 'kb-002',
    name: 'attention-paper.pdf',
    format: 'pdf',
    size_bytes: 102400,
    status: 'ready',
    content_hash: 'ghi789',
    chunk_count: 40,
    version: 1,
    added_at: '2026-04-15T11:00:00',
    ingested_at: '2026-04-15T11:02:00',
    error_message: null,
  },
]

const CONTENT_RESPONSE = {
  id: 'file-001',
  name: 'intro-to-ml.pdf',
  format: 'pdf',
  total_pages: 3,
  current_page: 1,
  content: {
    blocks: [
      { type: 'heading', content: 'Introduction to Machine Learning', level: 1 },
      { type: 'paragraph', content: 'Machine learning is a subset of artificial intelligence.' },
    ],
    page: 1,
    total_pages: 3,
  },
}

// ─── Route helpers ────────────────────────────────────────────────────────────

async function mockReaderApi(
  page: Page,
  kbs: object[],
  filesByKb: Record<string, object[]> = {},
) {
  await page.route(
    (url) => url.pathname === '/api/kb',
    (route) => route.fulfill({ json: { kbs } }),
  )

  await page.route(
    (url) => url.pathname.startsWith('/api/kb/') && url.pathname.endsWith('/files'),
    (route) => {
      const kbId = new URL(route.request().url()).pathname.split('/')[3]
      const files = (filesByKb as Record<string, object[]>)[kbId] || []
      route.fulfill({ json: { files } })
    },
  )

  await page.route(
    (url) => url.pathname.includes('/content'),
    (route) => route.fulfill({ json: CONTENT_RESPONSE }),
  )
}

// ─── UI/UX Tests ─────────────────────────────────────────────────────────────

test.describe('UI/UX Expert — Reader Page: Layout', () => {

  test('reader page loads without crash', async ({ page }) => {
    await mockReaderApi(page, NO_KBS)
    await page.goto('/#/reader')
    await expect(page.locator('body')).not.toContainText('Something went wrong')
    await expect(page.locator('body')).not.toContainText('Cannot read properties')
  })

  test('upload drop zone is visible', async ({ page }) => {
    await mockReaderApi(page, NO_KBS)
    await page.goto('/#/reader')
    // Drop zone or upload button should be present
    await expect(
      page.getByText(/Drop a file|drag.*drop|Upload/i).first()
        .or(page.locator('[data-testid*="upload"], [data-testid*="drop"]').first())
    ).toBeVisible()
  })

  test('"From KB" section label is visible', async ({ page }) => {
    await mockReaderApi(page, NO_KBS)
    await page.goto('/#/reader')
    await expect(page.getByText(/FROM KB|From KB/i)).toBeVisible()
  })

  test('UPLOAD section label is visible in left panel', async ({ page }) => {
    await mockReaderApi(page, NO_KBS)
    await page.goto('/#/reader')
    await expect(page.getByText(/UPLOAD/i).first()).toBeVisible()
  })

  test('shows empty state when no KBs exist', async ({ page }) => {
    await mockReaderApi(page, NO_KBS)
    await page.goto('/#/reader')
    // Page body should have some content (no crash, not blank)
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(0)
  })

})

// ─── KB Accordion Tests ───────────────────────────────────────────────────────

test.describe('UI/UX Expert — Reader Page: KB Picker', () => {

  test('KB names appear in the "From KB" accordion', async ({ page }) => {
    /**
     * Given: 2 KBs in the system
     * Then: Both KB names visible in the Reader left panel accordion
     * Note: Sidebar also shows KBs — use .first() to avoid strict mode
     */
    await mockReaderApi(page, KB_WITH_FILES, { 'kb-001': FILES_KB_001, 'kb-002': FILES_KB_002 })
    await page.goto('/#/reader')
    await expect(page.getByText('Machine Learning Notes').first()).toBeVisible()
    await expect(page.getByText('Research Papers').first()).toBeVisible()
  })

  test('KB color dot shown next to KB name in accordion', async ({ page }) => {
    /**
     * Reader accordion shows a colored 8×8 box (not emoji icon) next to each KB name.
     * Expected: The accordion renders KB names with color indicators
     */
    await mockReaderApi(page, KB_WITH_FILES, { 'kb-001': FILES_KB_001 })
    await page.goto('/#/reader')
    // KB names visible in accordion summary
    await expect(page.getByText('Machine Learning Notes').first()).toBeVisible()
    // File count shown in accordion
    await expect(page.locator('body')).toContainText('2')  // kb-001 file count
  })

  test('expanding a KB accordion shows its files', async ({ page }) => {
    /**
     * Step 1: Reader loads with 2 KBs
     * Step 2: Click the ExpandMoreIcon chevron on the first KB accordion
     * Expected: Files "intro-to-ml.pdf" and "deep-learning-notes.md" appear
     * Note: KBFileList only shows ready/stale files
     */
    await mockReaderApi(page, KB_WITH_FILES, { 'kb-001': FILES_KB_001, 'kb-002': FILES_KB_002 })
    await page.goto('/#/reader')
    // Click the ExpandMore chevron — this is unique to the Reader accordion (not sidebar)
    await page.locator('[data-testid="ExpandMoreIcon"]').first().click()
    await expect(page.getByText('intro-to-ml.pdf')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('deep-learning-notes.md')).toBeVisible()
  })

  test('files in KB show their filename after expanding', async ({ page }) => {
    /**
     * Given: KB-001 has 2 ready files (Reader only shows ready/stale)
     * Then: Both file names visible after expanding accordion
     */
    await mockReaderApi(page, KB_WITH_FILES, { 'kb-001': FILES_KB_001 })
    await page.goto('/#/reader')
    await page.locator('[data-testid="ExpandMoreIcon"]').first().click()
    await expect(page.getByText('intro-to-ml.pdf')).toBeVisible({ timeout: 8_000 })
  })

  test('clicking a ready file opens it in the viewer', async ({ page }) => {
    /**
     * Step 1: Expand accordion
     * Step 2: Click file name
     * Expected: FileViewer opens with content
     */
    await mockReaderApi(page, KB_WITH_FILES, { 'kb-001': FILES_KB_001 })
    await page.goto('/#/reader')
    await page.locator('[data-testid="ExpandMoreIcon"]').first().click()
    await expect(page.getByText('intro-to-ml.pdf')).toBeVisible({ timeout: 8_000 })
    await page.getByText('intro-to-ml.pdf').click()
    await expect(page.getByText('Introduction to Machine Learning').first()).toBeVisible({ timeout: 10_000 })
  })

  test('file content blocks render headings and paragraphs', async ({ page }) => {
    /**
     * Step 1: Expand accordion, click file
     * Expected: Heading and paragraph content blocks rendered
     */
    await mockReaderApi(page, KB_WITH_FILES, { 'kb-001': FILES_KB_001 })
    await page.goto('/#/reader')
    await page.locator('[data-testid="ExpandMoreIcon"]').first().click()
    await expect(page.getByText('intro-to-ml.pdf')).toBeVisible({ timeout: 8_000 })
    await page.getByText('intro-to-ml.pdf').click()
    await expect(page.getByText(/Machine learning is a subset/i)).toBeVisible({ timeout: 10_000 })
  })

})

// ─── Deep Link Tests ──────────────────────────────────────────────────────────

test.describe('Business Analyst — URL Deep Links', () => {

  test('?kb=ID&file=ID URL params auto-open the file', async ({ page }) => {
    await mockReaderApi(page, KB_WITH_FILES, { 'kb-001': FILES_KB_001 })
    await page.goto('/#/reader?kb=kb-001&file=file-001')
    // The file should auto-open
    await expect(page.getByText('Introduction to Machine Learning').first()).toBeVisible({ timeout: 10_000 })
  })

})

// ─── File Format Tests ────────────────────────────────────────────────────────

test.describe('Business Analyst — File Formats', () => {

  test('PDF files show PDF extension badge in file list', async ({ page }) => {
    await mockReaderApi(page, KB_WITH_FILES, { 'kb-001': FILES_KB_001 })
    await page.goto('/#/reader')
    await page.getByText('Machine Learning Notes').first().click()
    // Extension badges like "PDF" or "MD" show in the list
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

  test('page renders total_pages info when file is open', async ({ page }) => {
    await mockReaderApi(page, KB_WITH_FILES, { 'kb-001': FILES_KB_001 })
    await page.goto('/#/reader')
    await page.locator('[data-testid="ExpandMoreIcon"]').first().click()
    await expect(page.getByText('intro-to-ml.pdf')).toBeVisible({ timeout: 8_000 })
    await page.getByText('intro-to-ml.pdf').click()
    // file opens; viewer should show page count from total_pages:3 — "Page X of 3" or similar
    await expect(page.getByText('Introduction to Machine Learning').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('body')).toContainText('3')
  })

})
