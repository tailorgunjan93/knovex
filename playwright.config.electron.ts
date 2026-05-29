/**
 * Playwright E2E Configuration — Electron (packaged-app integration tests)
 *
 * These tests launch the real Electron main process (desktop/main.js) and
 * interact through the renderer, exactly as a user would.  They catch bugs
 * that are invisible in the browser because window.knovex is undefined there.
 *
 * Run:   npx playwright test --config playwright.config.electron.ts
 * UI:    npx playwright test --config playwright.config.electron.ts --ui
 * Debug: npx playwright test --config playwright.config.electron.ts --debug
 *
 * Prerequisites:
 *   - Node deps installed: npm install (in desktop/)
 *   - Vite frontend dev server running or dist built
 *   - Backend running on port 8765 (or any free port)
 *
 * Note: These tests do NOT require a packaged binary.
 * They launch Electron directly from desktop/main.js in --dev mode.
 * The IPC handlers, preload, and window.knovex API are identical to production.
 */

import { defineConfig } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: './e2e/electron',
  fullyParallel: false,          // Electron tests must run serially (one app instance)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                    // Single worker — Electron tests share state
  timeout: 60_000,               // Electron startup can be slow

  reporter: [
    ['html', { outputFolder: 'playwright-report-electron', open: 'never' }],
    ['list'],
  ],

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Electron tests use electronApp fixture — no baseURL needed
  },

  // Auto-start the Vite dev server before the Electron tests run.
  // Electron in --dev mode loads its frontend from http://localhost:5173.
  webServer: {
    command: 'npm run dev',
    cwd: './frontend',
    url: 'http://localhost:5173',
    reuseExistingServer: true,   // don't start a second one if already running
    timeout: 60_000,
  },
})
