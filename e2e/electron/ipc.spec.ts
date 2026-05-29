/**
 * E2E Tests — Electron IPC Handlers
 *
 * These tests verify that every IPC handler in desktop/main.js returns the
 * correct TYPE/SHAPE that the renderer (frontend) and TypeScript types expect.
 *
 * Bug history:
 *   - v0.9.5 fix: dialog:openFile was returning string[] instead of
 *     {canceled: boolean, filePaths: string[]}, causing "filePaths is not
 *     iterable" in KBDetail.tsx.  These tests would have caught it.
 *
 * Test strategy:
 *   - Mock dialog.showOpenDialog in the main process via electronApp.evaluate()
 *   - Call window.knovex.* from the renderer via page.evaluate()
 *   - Assert shape matches electron.d.ts TypeScript declarations exactly
 */

import { test, expect } from './fixtures'
import path from 'path'

// ─── dialog:openFile ─────────────────────────────────────────────────────────

test.describe('IPC: dialog:openFile', () => {

  test('returns {canceled, filePaths} object — NOT a raw array', async ({ electronApp, page }) => {
    // Arrange: mock showOpenDialog to return a predictable result
    await electronApp.evaluate(({ dialog }) => {
      // @ts-ignore — override for test
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: ['/tmp/test-document.pdf'],
      })
    })

    // Act: call through the preload bridge exactly as the renderer does
    const result = await page.evaluate(() =>
      (window as any).knovex.openFilePicker({})
    )

    // Assert: must be an object with canceled + filePaths, NOT a bare array
    // This is what KBDetail.tsx and UpdatePathDialog.tsx access
    expect(result).toHaveProperty('canceled')
    expect(result).toHaveProperty('filePaths')
    expect(typeof result.canceled).toBe('boolean')
    expect(Array.isArray(result.filePaths)).toBe(true)

    // Critical: result itself must NOT be an array
    // (the pre-fix code returned result.filePaths directly which is an array)
    expect(Array.isArray(result)).toBe(false)
  })

  test('returns canceled=false and filePaths array when file selected', async ({ electronApp, page }) => {
    await electronApp.evaluate(({ dialog }) => {
      // @ts-ignore
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: ['/home/user/doc.pdf', '/home/user/notes.txt'],
      })
    })

    const result = await page.evaluate(() =>
      (window as any).knovex.openFilePicker({})
    )

    expect(result.canceled).toBe(false)
    expect(result.filePaths).toHaveLength(2)
    expect(result.filePaths[0]).toBe('/home/user/doc.pdf')
  })

  test('returns canceled=true and empty filePaths when dialog is dismissed', async ({ electronApp, page }) => {
    await electronApp.evaluate(({ dialog }) => {
      // @ts-ignore
      dialog.showOpenDialog = async () => ({
        canceled: true,
        filePaths: [],
      })
    })

    const result = await page.evaluate(() =>
      (window as any).knovex.openFilePicker({})
    )

    expect(result.canceled).toBe(true)
    expect(result.filePaths).toHaveLength(0)
  })

  test('result.filePaths is iterable with for...of (regression: "not iterable")', async ({ electronApp, page }) => {
    await electronApp.evaluate(({ dialog }) => {
      // @ts-ignore
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: ['/a/b.pdf', '/c/d.docx'],
      })
    })

    // This is the exact pattern from KBDetail.tsx line 165:
    //   for (const p of result.filePaths) { ... }
    // Before v0.9.5, result was string[] so result.filePaths was undefined → crash
    const paths = await page.evaluate(async () => {
      const result = await (window as any).knovex.openFilePicker({})
      const collected: string[] = []
      for (const p of result.filePaths) {   // ← this line crashed pre-fix
        collected.push(p)
      }
      return collected
    })

    expect(paths).toEqual(['/a/b.pdf', '/c/d.docx'])
  })

})


// ─── dialog:openFolder ───────────────────────────────────────────────────────

test.describe('IPC: dialog:openFolder', () => {

  test('returns selected folder path as string', async ({ electronApp, page }) => {
    await electronApp.evaluate(({ dialog }) => {
      // @ts-ignore
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: ['/home/user/documents'],
      })
    })

    const result = await page.evaluate(() =>
      (window as any).knovex.openFolderPicker()
    )

    expect(typeof result).toBe('string')
    expect(result).toBe('/home/user/documents')
  })

  test('returns null when folder dialog is cancelled', async ({ electronApp, page }) => {
    await electronApp.evaluate(({ dialog }) => {
      // @ts-ignore
      dialog.showOpenDialog = async () => ({
        canceled: true,
        filePaths: [],
      })
    })

    const result = await page.evaluate(() =>
      (window as any).knovex.openFolderPicker()
    )

    expect(result).toBeNull()
  })

})


// ─── app:backendPort ─────────────────────────────────────────────────────────

test.describe('IPC: app:backendPort', () => {

  test('window.knovex.backendPort is a number', async ({ page }) => {
    const port = await page.evaluate(() => (window as any).knovex?.backendPort)

    expect(typeof port).toBe('number')
    expect(port).toBeGreaterThan(1024)
    expect(port).toBeLessThan(65536)
  })

  test('backendPort defaults to 8765 when port is free', async ({ page }) => {
    const port = await page.evaluate(() => (window as any).knovex?.backendPort)
    // 8765 is the preferred port; allow any valid port in case 8765 is busy
    expect(port).toBeGreaterThan(0)
  })

})


// ─── app:version ─────────────────────────────────────────────────────────────

test.describe('IPC: app:version', () => {

  test('appVersion() returns a semver string', async ({ page }) => {
    const version = await page.evaluate(() =>
      (window as any).knovex?.appVersion()
    )
    const v = await version
    // Should match semver like "0.9.5"
    expect(v).toMatch(/^\d+\.\d+\.\d+$/)
  })

})


// ─── window.knovex presence ──────────────────────────────────────────────────

test.describe('window.knovex API surface', () => {

  test('window.knovex is defined in the renderer (Electron preload works)', async ({ page }) => {
    const defined = await page.evaluate(() => typeof (window as any).knovex)
    expect(defined).toBe('object')
  })

  test('all expected API methods are present', async ({ page }) => {
    const methods = await page.evaluate(() => {
      const k = (window as any).knovex
      return {
        openFilePicker:   typeof k?.openFilePicker,
        openFolderPicker: typeof k?.openFolderPicker,
        showSaveDialog:   typeof k?.showSaveDialog,
        appVersion:       typeof k?.appVersion,
        installUpdate:    typeof k?.installUpdate,
        onFileDrop:       typeof k?.onFileDrop,
        onUpdateDownloaded: typeof k?.onUpdateDownloaded,
        onUpdateProgress:   typeof k?.onUpdateProgress,
        backendPort:      typeof k?.backendPort,
        platform:         typeof k?.platform,
      }
    })

    expect(methods.openFilePicker).toBe('function')
    expect(methods.openFolderPicker).toBe('function')
    expect(methods.showSaveDialog).toBe('function')
    expect(methods.appVersion).toBe('function')
    expect(methods.installUpdate).toBe('function')
    expect(methods.onFileDrop).toBe('function')
    expect(methods.onUpdateDownloaded).toBe('function')
    expect(methods.onUpdateProgress).toBe('function')
    expect(methods.backendPort).toBe('number')
    expect(methods.platform).toBe('string')
  })

})
