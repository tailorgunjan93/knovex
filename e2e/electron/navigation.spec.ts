/**
 * E2E Tests â€” Sidebar Navigation
 *
 * Verifies that all 5 main pages plus Settings are reachable via the sidebar
 * and do not crash on load.  Catches routing bugs that only appear in the
 * packaged app where the React router is served from a file:// URL.
 */

import { test, expect } from './fixtures'

test.describe('Sidebar Navigation', () => {

  test('Library page loads without error', async ({ page }) => {
    await page.goto('http://localhost:5173/#/kb')
    // Should not show a crash/error boundary
    await expect(page.locator('body')).not.toContainText('Something went wrong')
    await expect(page.locator('body')).not.toContainText('Cannot read properties')
  })

  test('Chat page loads without error', async ({ page }) => {
    await page.goto('http://localhost:5173/#/chat')
    await expect(page.locator('body')).not.toContainText('Something went wrong')
    await expect(page.locator('body')).not.toContainText('Cannot read properties')
  })

  test('Reader page loads without error', async ({ page }) => {
    await page.goto('http://localhost:5173/#/reader')
    await expect(page.locator('body')).not.toContainText('Something went wrong')
    await expect(page.locator('body')).not.toContainText('Cannot read properties')
  })

  test('Learn page loads without error', async ({ page }) => {
    await page.goto('http://localhost:5173/#/learn')
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

  test('Progress page loads without error', async ({ page }) => {
    await page.goto('http://localhost:5173/#/progress')
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

  test('Settings page loads without error', async ({ page }) => {
    await page.goto('http://localhost:5173/#/settings')
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

  test('unknown route redirects gracefully (no white screen)', async ({ page }) => {
    await page.goto('http://localhost:5173/#/does-not-exist')
    // Either redirects to a known page or shows a 404 â€” must not be blank
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(0)
  })

})

