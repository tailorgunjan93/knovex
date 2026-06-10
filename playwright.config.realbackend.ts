/**
 * Playwright E2E — REAL BACKEND streaming gate.
 *
 * Unlike playwright.config.ts (which mocks every /api/* call and therefore can't
 * reproduce a real mid-stream connection drop), this config drives the real
 * frontend bundle against the REAL FastAPI backend over real HTTP/SSE. The
 * backend runs with KNOVEX_FAKE_LLM=1 — a deterministic offline LLM client (no
 * API keys, no network) — so Learn/Chat streaming completes reproducibly in CI.
 *
 * This is the gate that would have caught the "network error" class of bugs
 * (animated mid-stream drop, chat KB crash). See docs/rca/2026-06-07-network-error.md.
 *
 * Run: npx playwright test --config playwright.config.realbackend.ts
 */

import { defineConfig } from '@playwright/test'
import path from 'path'

const BACKEND_PORT = 8788
const ROOT = __dirname
// CI installs Python on PATH (`python`); locally, point KNOVEX_PYTHON at the venv.
const PYTHON = process.env.KNOVEX_PYTHON || 'python'

export default defineConfig({
  testDir: './e2e/real-backend',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },

  projects: [{ name: 'chromium' }],

  webServer: [
    {
      // Real FastAPI backend with the deterministic fake LLM client.
      command: `${PYTHON} -m uvicorn backend.main:app --host 127.0.0.1 --port ${BACKEND_PORT} --log-level warning`,
      cwd: ROOT,
      url: `http://127.0.0.1:${BACKEND_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        KNOVEX_FAKE_LLM: '1',
        KNOVEX_FAKE_SEARCH: '1',
        KNOVEX_BACKEND_PORT: String(BACKEND_PORT),
        KNOVEX_DATA_DIR: path.join(ROOT, '.e2e-tmp', 'data'),
        KNOVEX_CONFIG_DIR: path.join(ROOT, '.e2e-tmp', 'config'),
        KNOVEX_LOG_DIR: path.join(ROOT, '.e2e-tmp', 'logs'),
      },
    },
    {
      // Real frontend dev server, pointed at the real backend above.
      command: 'npm run dev',
      cwd: path.join(ROOT, 'frontend'),
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_BASE: `http://localhost:${BACKEND_PORT}` },
    },
  ],
})
