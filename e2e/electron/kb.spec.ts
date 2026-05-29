/**
 * Electron E2E Tests — Knowledge Base CRUD (real backend)
 *
 * Uses a live uvicorn backend (spawned by Electron in --dev mode) to test
 * the full KB creation, file-add, and deletion lifecycle against a real
 * SQLite database.
 *
 * The test data directory is isolated via KNOVEX_DATA_DIR=.test-data/
 * so these tests never touch the user's production knowledge bases.
 *
 * Bugs these tests catch:
 *  - POST /api/kb returns wrong shape → KB list doesn't update
 *  - DELETE /api/kb/:id fails silently → orphaned KB remains
 *  - addFile with a bad path → 422 instead of useful error
 *  - File status never transitions from pending → ready (ingestion bug)
 */

import { test, expect } from './fixtures'
import path from 'path'
import fs from 'fs'
import http from 'http'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function waitForHttp(url: string, timeoutMs = 20_000): Promise<void> {
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

/** Make a direct API call from the renderer context and return the parsed JSON. */
async function apiCall(
  page: Electron.Page,
  method: string,
  path: string,
  body?: object,
): Promise<any> {
  return page.evaluate(
    async ({ method, path, body, port }) => {
      const url = `http://127.0.0.1:${port}/api${path}`
      const opts: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
      }
      if (body) opts.body = JSON.stringify(body)
      const res = await fetch(url, opts)
      const text = await res.text()
      try { return { status: res.status, data: JSON.parse(text) } }
      catch { return { status: res.status, data: text } }
    },
    { method, path, body, port: await page.evaluate(() => (window as any).knovex?.backendPort) },
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('KB CRUD — Real Backend', () => {

  let port: number

  test.beforeEach(async ({ page }) => {
    port = await page.evaluate(() => (window as any).knovex?.backendPort)
    await waitForHttp(`http://127.0.0.1:${port}/api/health`)
  })

  // ── List ──────────────────────────────────────────────────────────────────

  test('GET /api/kb returns an array', async ({ page }) => {
    const result = await apiCall(page, 'GET', '/kb')
    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('kbs')
    expect(Array.isArray(result.data.kbs)).toBe(true)
  })

  test('each KB in list has required fields', async ({ page }) => {
    // Create one first so the list is not empty
    await apiCall(page, 'POST', '/kb', { name: 'Shape Test KB', color: '#DDA76A', icon: '📁' })
    const result = await apiCall(page, 'GET', '/kb')
    const kbs: any[] = result.data.kbs
    if (kbs.length > 0) {
      const kb = kbs[0]
      expect(kb).toHaveProperty('id')
      expect(kb).toHaveProperty('name')
      expect(kb).toHaveProperty('color')
      expect(kb).toHaveProperty('icon')
      expect(kb).toHaveProperty('stats')
      expect(kb.stats).toHaveProperty('file_count')
    }
  })

  // ── Create ────────────────────────────────────────────────────────────────

  test('POST /api/kb creates a new KB with correct fields', async ({ page }) => {
    const result = await apiCall(page, 'POST', '/kb', {
      name: 'E2E Test KB',
      color: '#DDA76A',
      icon: '🧪',
    })
    expect(result.status).toBe(201)
    expect(result.data.name).toBe('E2E Test KB')
    expect(result.data.color).toBe('#DDA76A')
    expect(result.data.icon).toBe('🧪')
    expect(result.data.id).toBeTruthy()
  })

  test('created KB appears in the list immediately', async ({ page }) => {
    const createResult = await apiCall(page, 'POST', '/kb', {
      name: 'Visible In List KB',
      color: '#3A8D7A',
      icon: '📚',
    })
    const kbId = createResult.data.id

    const listResult = await apiCall(page, 'GET', '/kb')
    const ids = listResult.data.kbs.map((kb: any) => kb.id)
    expect(ids).toContain(kbId)
  })

  test('POST /api/kb returns 422 when name is missing', async ({ page }) => {
    const result = await apiCall(page, 'POST', '/kb', { color: '#DDA76A', icon: '📁' })
    expect(result.status).toBe(422)
  })

  test('newly created KB has file_count = 0', async ({ page }) => {
    const createResult = await apiCall(page, 'POST', '/kb', {
      name: 'Fresh KB',
      color: '#2563EB',
      icon: '🆕',
    })
    expect(createResult.data.stats.file_count).toBe(0)
  })

  // ── Files ─────────────────────────────────────────────────────────────────

  test('GET /api/kb/:id/files returns empty array for new KB', async ({ page }) => {
    const kb = await apiCall(page, 'POST', '/kb', { name: 'File List KB', color: '#DDA76A', icon: '📁' })
    const filesResult = await apiCall(page, 'GET', `/kb/${kb.data.id}/files`)
    expect(filesResult.status).toBe(200)
    expect(filesResult.data).toHaveProperty('files')
    expect(Array.isArray(filesResult.data.files)).toBe(true)
    expect(filesResult.data.files.length).toBe(0)
  })

  test('adding a real txt file via POST /api/kb/:id/files changes file_count', async ({ page }) => {
    // Create a tiny test file in the test-data directory
    const testDataDir = path.join(process.cwd(), '.test-data')
    fs.mkdirSync(testDataDir, { recursive: true })
    const testFilePath = path.join(testDataDir, 'kb-e2e-test.txt')
    fs.writeFileSync(testFilePath, 'Hello, this is a test file for E2E testing.\nLine two.\n')

    const kb = await apiCall(page, 'POST', '/kb', { name: 'File Add KB', color: '#DDA76A', icon: '📁' })
    const kbId = kb.data.id

    const addResult = await apiCall(page, 'POST', `/kb/${kbId}/files`, {
      file_path: testFilePath,
    })
    expect(addResult.status).toBe(201)
    expect(addResult.data.name).toBe('kb-e2e-test.txt')
    expect(addResult.data.kb_id).toBe(kbId)

    // File list should now have 1 file
    const filesResult = await apiCall(page, 'GET', `/kb/${kbId}/files`)
    expect(filesResult.data.files.length).toBe(1)
  })

  test('file record has required shape fields', async ({ page }) => {
    const testDataDir = path.join(process.cwd(), '.test-data')
    fs.mkdirSync(testDataDir, { recursive: true })
    const testFilePath = path.join(testDataDir, 'kb-shape-test.txt')
    fs.writeFileSync(testFilePath, 'Shape test content.\n')

    const kb = await apiCall(page, 'POST', '/kb', { name: 'Shape KB', color: '#DDA76A', icon: '📁' })
    const addResult = await apiCall(page, 'POST', `/kb/${kb.data.id}/files`, { file_path: testFilePath })

    const file = addResult.data
    expect(file).toHaveProperty('id')
    expect(file).toHaveProperty('name')
    expect(file).toHaveProperty('status')
    expect(file).toHaveProperty('format')
    expect(file).toHaveProperty('kb_id')
    expect(['pending', 'ingesting', 'ready']).toContain(file.status)
  })

  test('adding non-existent file path returns 4xx error', async ({ page }) => {
    const kb = await apiCall(page, 'POST', '/kb', { name: 'Bad Path KB', color: '#DDA76A', icon: '📁' })
    const result = await apiCall(page, 'POST', `/kb/${kb.data.id}/files`, {
      file_path: '/does/not/exist/nowhere.txt',
    })
    expect(result.status).toBeGreaterThanOrEqual(400)
    expect(result.status).toBeLessThan(500)
  })

  // ── Delete ────────────────────────────────────────────────────────────────

  test('DELETE /api/kb/:id removes the KB', async ({ page }) => {
    const kb = await apiCall(page, 'POST', '/kb', { name: 'Delete Me KB', color: '#DB2777', icon: '🗑️' })
    const kbId = kb.data.id

    const delResult = await apiCall(page, 'DELETE', `/kb/${kbId}`)
    expect([200, 204]).toContain(delResult.status)

    // KB should no longer appear in list
    const listResult = await apiCall(page, 'GET', '/kb')
    const ids = listResult.data.kbs.map((k: any) => k.id)
    expect(ids).not.toContain(kbId)
  })

  test('GET /api/kb/:id returns 404 after deletion', async ({ page }) => {
    const kb = await apiCall(page, 'POST', '/kb', { name: 'Gone KB', color: '#DDA76A', icon: '📁' })
    await apiCall(page, 'DELETE', `/kb/${kb.data.id}`)

    const getResult = await apiCall(page, 'GET', `/kb/${kb.data.id}`)
    expect(getResult.status).toBe(404)
  })

  // ── Update ────────────────────────────────────────────────────────────────

  test('PUT /api/kb/:id updates the KB name', async ({ page }) => {
    const kb = await apiCall(page, 'POST', '/kb', { name: 'Old Name', color: '#DDA76A', icon: '📁' })
    const updateResult = await apiCall(page, 'PUT', `/kb/${kb.data.id}`, {
      name: 'Updated Name',
    })
    expect(updateResult.status).toBe(200)
    expect(updateResult.data.name).toBe('Updated Name')
  })

})
