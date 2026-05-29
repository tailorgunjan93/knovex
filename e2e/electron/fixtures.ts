/**
 * Shared Electron test fixtures
 *
 * Provides an `electronApp` fixture that launches Knovex in --dev mode and
 * exposes the main BrowserWindow as `page`.
 *
 * Usage:
 *   import { test, expect } from './fixtures'
 *   test('my test', async ({ electronApp, page }) => { ... })
 */

import { test as base, expect } from '@playwright/test'
import { ElectronApplication, Page, _electron as electron } from 'playwright'
import path from 'path'

export { expect }

interface ElectronFixtures {
  electronApp: ElectronApplication
  page: Page
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const appPath = path.join(__dirname, '../../desktop/main.js')

    const app = await electron.launch({
      args: [appPath, '--dev'],
      env: {
        ...process.env,
        // Use a throwaway data dir so tests never pollute production data
        KNOVEX_DATA_DIR: path.join(__dirname, '../../.test-data'),
        KNOVEX_TESTING:  '1',
        NODE_ENV:        'test',
      },
    })

    await use(app)

    await app.close()
  },

  page: async ({ electronApp }, use) => {
    const win = await electronApp.firstWindow()
    // Wait for the window to actually be visible
    await win.waitForLoadState('domcontentloaded')
    await use(win)
  },
})
