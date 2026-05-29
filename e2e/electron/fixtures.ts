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

import { test as base, expect, ElectronApplication, Page, _electron as electron } from '@playwright/test'
import path from 'path'

export { expect }

interface ElectronFixtures {
  electronApp: ElectronApplication
  page: Page
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const appPath = path.join(__dirname, '../../desktop/main.js')
    // The `electron` package's index.js exports the path to its own binary.
    // Resolving from desktop/node_modules ensures we use the right version.
    const electronPackage = require(
      path.join(__dirname, '../../desktop/node_modules/electron')
    ) as string
    const electronExe: string = electronPackage

    const app = await electron.launch({
      executablePath: electronExe,
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
    // Navigate to the app root — ensures the window is on the correct URL regardless
    // of what state it was in when firstWindow() resolved (could be about:blank or
    // mid-load).  Also works around DevTools-interference on initial load.
    await win.goto('http://localhost:5173')
    await win.waitForLoadState('load')
    // Wait for the Electron preload bridge to be injected.
    // contextBridge.exposeInMainWorld() runs in the preload before page code,
    // but the sendSync('app:backendPort') inside it may take a tick — this
    // waitForFunction ensures window.knovex is truly available before any test runs.
    await win.waitForFunction(
      () => typeof (window as any).knovex !== 'undefined',
      undefined,
      { timeout: 15_000 },
    )
    await use(win)
  },
})
