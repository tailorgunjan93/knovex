/**
 * Playwright E2E Configuration — Knovex
 *
 * Runs against the Vite dev server (auto-started).
 * All backend /api/* calls are intercepted via page.route() —
 * no live FastAPI server is required for E2E tests.
 *
 * Run:  npx playwright test
 * UI:   npx playwright test --ui
 * Debug: npx playwright test --debug
 */

import { defineConfig, devices } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/electron/**',   // Electron tests have their own config: playwright.config.electron.ts
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:5173',
    trace:   'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
    // Give components time to render after API mocks resolve.
    // navigationTimeout is intentionally generous (60 s) so that a cold
    // Vite dev-server start under parallel worker load doesn't timeout.
    actionTimeout:    10_000,
    navigationTimeout: 60_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Auto-start the Vite frontend dev server.
  // API calls are intercepted in tests — no backend needed.
  webServer: {
    command: 'npm run dev',
    cwd: path.join(__dirname, 'frontend'),
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
