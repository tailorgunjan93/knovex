/**
 * Knovex Electron Main Process
 *
 * Responsibilities:
 *   1. Spawn the FastAPI backend as a child process
 *   2. Poll GET /health until the backend is ready
 *   3. Open the BrowserWindow (Vite dev server in dev, dist/ in prod)
 *   4. Handle OS file dialogs (IPC handlers)
 *   5. System tray (minimise-to-tray)
 *   6. Clean shutdown (kill backend on quit)
 */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  dialog,
  nativeImage,
  shell,
} = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const { autoUpdater } = require('electron-updater')
const { waitForHealthy } = require('./lib/backendHealth')
const { parseWindowState } = require('./lib/windowState')

// ─── Constants ───────────────────────────────────────────────────────────────

const IS_DEV = process.argv.includes('--dev') || !app.isPackaged
const VITE_DEV_URL = 'http://localhost:5173'

// Port is resolved dynamically in app.on('ready') via findFreePort().
// Prefer 8765; fall back to any free port the OS assigns if 8765 is occupied.
let BACKEND_PORT = 8765
let BACKEND_URL  = `http://127.0.0.1:${BACKEND_PORT}`
let HEALTH_URL   = `${BACKEND_URL}/api/health`

const WINDOW_MIN_WIDTH = 900
const WINDOW_MIN_HEIGHT = 600
const WINDOW_DEFAULT_WIDTH = 1280
const WINDOW_DEFAULT_HEIGHT = 820

// ─── State ───────────────────────────────────────────────────────────────────

let mainWindow = null
let tray = null
let backendProcess = null
let backendReady = false
let backendStderrLines = []   // rolling buffer — last 30 lines for error dialog

// ── Backend self-healing ──────────────────────────────────────────────────────
// If knovex-backend.exe dies unexpectedly (crash, OOM, killed), the app restarts
// it instead of sitting on a "network error". Suppressed during intentional
// shutdown (app quit, update/uninstall) so we never fight the installer — the
// NSIS script also kills the app first, so a respawn can't re-lock files.
let backendShuttingDown = false       // set true when WE kill it on purpose
const backendRestartTimes = []        // timestamps of recent auto-restarts
const MAX_RESTARTS_PER_WINDOW = 5
const RESTART_WINDOW_MS = 60_000

// ─── Backend spawn ────────────────────────────────────────────────────────────

function getBackendExecutable() {
  if (IS_DEV) {
    // In dev mode: run via uvicorn directly
    const venvPython = path.join(
      path.dirname(__dirname),
      '.venv',
      process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python',
    )
    return { executable: venvPython, args: ['-m', 'uvicorn', 'backend.main:app', '--port', String(BACKEND_PORT), '--host', '127.0.0.1'] }
  }

  // In production: run the PyInstaller-bundled binary
  const backendBin = path.join(
    process.resourcesPath,
    'backend',
    process.platform === 'win32' ? 'knovex-backend.exe' : 'knovex-backend',
  )
  return { executable: backendBin, args: [] }
}

/**
 * Find a free TCP port on 127.0.0.1.
 *
 * Tries `preferred` first (default 8765).  If it is already in use, asks the
 * OS to assign any available port by binding to port 0 — this always succeeds
 * and guarantees the app starts even when another process owns 8765.
 *
 * @param {number} preferred - Port to try first.
 * @returns {Promise<number>}  The port that was actually free.
 */
function findFreePort(preferred = 8765) {
  return new Promise((resolve) => {
    const net = require('net')
    const probe = net.createServer()
    probe.listen(preferred, '127.0.0.1', () => {
      // Preferred port is free — claim it
      probe.close(() => resolve(preferred))
    })
    probe.on('error', () => {
      // Preferred port is busy — let the OS pick any free port
      const fallback = net.createServer()
      fallback.listen(0, '127.0.0.1', () => {
        const port = fallback.address().port
        fallback.close(() => {
          console.log(`[backend] port ${preferred} busy — using ${port} instead`)
          resolve(port)
        })
      })
    })
  })
}

function spawnBackend() {
  const { executable, args } = getBackendExecutable()
  // In production, __dirname resolves to inside app.asar — a virtual path the OS
  // does not recognise as a real directory.  Passing it as `cwd` to spawn() causes
  // Node to throw ENOENT even when the executable itself exists on disk.
  // Use path.dirname(executable) instead — it is always a real filesystem path
  // (derived from process.resourcesPath which is guaranteed real in a packaged app).
  const cwd = IS_DEV ? path.join(__dirname, '..') : path.dirname(executable)

  // ── Pre-flight: verify the binary exists before trying to spawn ──────────────
  if (!IS_DEV && !fs.existsSync(executable)) {
    const logPath = path.join(app.getPath('userData'), 'backend.log')
    const msg = [
      `Backend binary not found at:`,
      `  ${executable}`,
      ``,
      `resourcesPath : ${process.resourcesPath}`,
      `__dirname     : ${__dirname}`,
      ``,
      `This usually means the installer was built without the backend binary.`,
      `Please re-download and reinstall Knovex from:`,
      `  https://tailorgunjan93.github.io/knovex/`,
    ].join('\n')
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    fs.appendFileSync(logPath, `\n=== ${new Date().toISOString()} ===\n${msg}\n`)
    dialog.showErrorBox('Knovex — Installation Error', msg)
    app.quit()
    return
  }

  console.log('[backend] resourcesPath:', process.resourcesPath)
  console.log('[backend] spawning:', executable, args.join(' '))

  // Build a clean environment for the PyInstaller-frozen backend.
  // Do NOT forward PYTHONPATH / PYTHONHOME / PYTHONSTARTUP from the host
  // system — they cause the frozen binary to look for modules in the wrong
  // place, resulting in "Could not import module backend.main" at startup.
  const backendEnv = { ...process.env, PYTHONUNBUFFERED: '1' }
  for (const key of Object.keys(backendEnv)) {
    if (/^PYTHON/i.test(key)) delete backendEnv[key]
  }
  backendEnv.PYTHONUNBUFFERED    = '1'              // re-add the one we actually want
  backendEnv.KNOVEX_BACKEND_PORT = String(BACKEND_PORT) // tell the binary which port to bind

  backendProcess = spawn(executable, args, {
    cwd,
    env: backendEnv,
    stdio: ['ignore', 'pipe', 'pipe'],  // always pipe so we can log + diagnose
  })

  // ── Log file (always written in production, mirrors console in dev) ─────────
  const logPath = path.join(app.getPath('userData'), 'backend.log')
  const logStream = fs.createWriteStream(logPath, { flags: 'a' })
  logStream.write(`\n=== Knovex backend started ${new Date().toISOString()} ===\n`)

  backendProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    console.log('[backend]', text.trimEnd())
    logStream.write(text)
  })

  backendProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    console.error('[backend:err]', text.trimEnd())
    logStream.write(text)
    // Keep a rolling window of the last 30 lines for the error dialog
    backendStderrLines.push(...text.split('\n').filter(Boolean))
    if (backendStderrLines.length > 30) backendStderrLines = backendStderrLines.slice(-30)
  })

  backendProcess.on('exit', (code, signal) => {
    console.log('[backend] exited with code:', code, 'signal:', signal)
    logStream.write(`=== backend exited code=${code} signal=${signal} ===\n`)
    logStream.end()
    backendReady = false
    maybeRestartBackend(code)
  })

  backendProcess.on('error', (err) => {
    console.error('[backend] spawn error:', err.message)
    logStream.write(`=== spawn error: ${err.message} ===\n`)
  })
}

/**
 * Restart the backend after an UNEXPECTED exit, so the app self-heals instead of
 * showing a permanent "network error". Never restarts during intentional
 * shutdown (quit/update). Caps restarts to MAX_RESTARTS_PER_WINDOW within
 * RESTART_WINDOW_MS so a hard crash-loop (or an occupied port) surfaces a clear
 * error instead of spinning forever.
 */
function maybeRestartBackend(code) {
  if (app.isQuitting || backendShuttingDown) return   // intentional — leave it dead

  const now = Date.now()
  while (backendRestartTimes.length && now - backendRestartTimes[0] > RESTART_WINDOW_MS) {
    backendRestartTimes.shift()
  }
  if (backendRestartTimes.length >= MAX_RESTARTS_PER_WINDOW) {
    console.error('[backend] crash-looping — gave up after %d restarts', MAX_RESTARTS_PER_WINDOW)
    mainWindow?.webContents.send('app:backend-failed', {
      attempts: MAX_RESTARTS_PER_WINDOW,
      lastExitCode: code,
      stderr: backendStderrLines.slice(-15).join('\n'),
    })
    return
  }
  backendRestartTimes.push(now)

  const delay = Math.min(1000 * backendRestartTimes.length, 5000)  // linear backoff, cap 5s
  console.warn('[backend] unexpected exit (code=%s) — restarting in %dms (%d/%d)',
    code, delay, backendRestartTimes.length, MAX_RESTARTS_PER_WINDOW)
  mainWindow?.webContents.send('app:backend-restarting', { attempt: backendRestartTimes.length })

  setTimeout(() => {
    if (app.isQuitting || backendShuttingDown) return
    spawnBackend()
    waitForBackend()
      .then(() => {
        console.log('[backend] recovered after restart')
        mainWindow?.webContents.send('app:backend-restarted')
      })
      .catch(() => { /* its own exit handler will retry within the cap */ })
  }, delay)
}

// ─── Health polling ───────────────────────────────────────────────────────────

// One health probe: resolves true on HTTP 200, false on any error/timeout.
function probeHealthOnce() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      res.resume()                       // drain so the socket can be reused
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(3000, () => { req.destroy(); resolve(false) })
  })
}

// Poll the backend until healthy, with a generous wall-clock deadline (NOT a
// fixed attempt count) so a slow post-update cold start — Defender scanning the
// freshly-written exe + ~120 _internal DLLs can exceed 30s — isn't mistaken for
// a failure. Fails fast if the backend PROCESS exits (a real crash). The poll
// logic is unit-tested in lib/backendHealth.test.js. See RCA 2026-06-08.
function waitForBackend() {
  return waitForHealthy({
    probe: probeHealthOnce,
    isProcessAlive: () =>
      !!backendProcess && backendProcess.exitCode === null && !backendProcess.killed,
    timeoutMs: 120_000,
    intervalMs: 500,
  }).then(() => {
    backendReady = true
    console.log('[backend] ready')
  })
}

// ─── Window ───────────────────────────────────────────────────────────────────

// ─── Window state persistence (JSON file in userData) ────────────────────────

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState() {
  const opts = {
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    defaults: { width: WINDOW_DEFAULT_WIDTH, height: WINDOW_DEFAULT_HEIGHT, x: undefined, y: undefined },
  }
  // Validation/parse logic lives in lib/windowState.js (unit-tested via node:test);
  // here we only do the file read. Absent file / malformed JSON → defaults.
  try {
    return parseWindowState(fs.readFileSync(getWindowStatePath(), 'utf8'), opts)
  } catch {
    return { ...opts.defaults }
  }
}

function saveWindowState(win) {
  try {
    const bounds = win.getBounds()
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(bounds), 'utf8')
  } catch (err) {
    console.warn('[app] Failed to save window state:', err.message)
  }
}

function getWindowState() {
  return loadWindowState()
}

function createMainWindow() {
  const { width, height, x, y } = getWindowState()

  mainWindow = new BrowserWindow({
    width,
    height,
    ...(x !== undefined && { x }),
    ...(y !== undefined && { y }),
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    title: 'Knovex',
    show: false,
    backgroundColor: '#0B0B0C',  // matches dark theme background (warm near-black)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Load the app
  if (IS_DEV) {
    mainWindow.loadURL(VITE_DEV_URL)
    // Don't open DevTools when running under Playwright (it interferes with test evaluation)
    if (!process.env.KNOVEX_TESTING) {
      mainWindow.webContents.openDevTools()
    }
  } else {
    // frontend/dist is placed in resources/frontend/dist/ via extraResources —
    // process.resourcesPath is the guaranteed real-disk path to resources/.
    mainWindow.loadFile(path.join(process.resourcesPath, 'frontend', 'dist', 'index.html'))
  }

  // Show window once ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  // Persist window state on move/resize
  mainWindow.on('resize', () => saveWindowState(mainWindow))
  mainWindow.on('move',   () => saveWindowState(mainWindow))

  // Minimise to tray on close (not quit)
  mainWindow.on('close', (event) => {
    saveWindowState(mainWindow)   // always save before hiding/quitting
    if (tray && !app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // ── DevTools toggle — Ctrl+Shift+I or F12 (works in both dev and prod) ──────
  // In dev mode DevTools are opened automatically above.  In production the user
  // has no way to inspect console errors without this — which makes diagnosing
  // renderer issues impossible.  This shortcut lets us attach DevTools in any
  // packaged build without rebuilding.
  mainWindow.webContents.on('before-input-event', (_, input) => {
    const isDevToolsShortcut =
      (input.control && input.shift && input.key.toLowerCase() === 'i') ||
      input.key === 'F12'
    if (isDevToolsShortcut) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' })
      }
    }
  })

  return mainWindow
}

// ─── System tray ─────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png')
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty()

  tray = new Tray(icon)
  tray.setToolTip('Knovex')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Knovex',
      click: () => { mainWindow?.show(); mainWindow?.focus() },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.send('navigate', '/settings')
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })
}

// ─── Auto-updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  // Only run in packaged app — no-op in dev to avoid GitHub API calls
  if (IS_DEV) return

  autoUpdater.autoDownload    = true   // download silently in background
  autoUpdater.autoInstallOnAppQuit = false  // we prompt the user ourselves

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] checking for update…')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update available:', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] already up to date')
  })

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent)
    console.log(`[updater] downloading… ${pct}%`)
    // Forward to renderer so it can show a subtle progress indicator
    mainWindow?.webContents.send('app:update-progress', { pct })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] update downloaded:', info.version)
    // Notify the renderer — it will show a "Restart to update" banner
    mainWindow?.webContents.send('app:update-downloaded', {
      version:      info.version,
      releaseNotes: info.releaseNotes ?? null,
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err.message)
  })

  const checkNow = () =>
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] checkForUpdates failed:', err.message)
    })

  // Check on startup (after a short delay so the app finishes loading first)
  setTimeout(checkNow, 8_000)

  // Re-check every 4 hours so updates are found even if the app runs for days
  // without a restart (same cadence as Chrome / Slack / VS Code).
  setInterval(checkNow, 4 * 60 * 60 * 1_000)
}

// ─── Update helpers ───────────────────────────────────────────────────────────

/**
 * Kill the backend subprocess and wait for it to actually exit (max 3 s).
 *
 * Must be called BEFORE autoUpdater.quitAndInstall() so the NSIS installer
 * never finds knovex-backend.exe running.  On Windows, Node's .kill() maps
 * directly to TerminateProcess — it is effectively instantaneous, but we still
 * await the 'exit' event so we are certain the OS has released all file handles
 * before the installer tries to overwrite them.
 */
function killBackendAndWait() {
  backendShuttingDown = true   // we're killing it on purpose — don't auto-restart
  return new Promise((resolve) => {
    if (!backendProcess || backendProcess.killed) {
      resolve()
      return
    }
    backendProcess.once('exit', resolve)
    backendProcess.kill()
    // Safety net: force-resolve after 3 s in case the process hangs
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        try { backendProcess.kill('SIGKILL') } catch (_) {}
      }
      resolve()
    }, 3_000)
  })
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  // Native file open dialog
  // IMPORTANT: must return the full { canceled, filePaths } object so the renderer
  // can check result.canceled and iterate result.filePaths — matching the
  // FilePickerResult type declared in frontend/src/types/electron.d.ts.
  // Previously returned a raw array which caused "filePaths is not iterable" in
  // the packaged app because result.filePaths was undefined on a string[].
  ipcMain.handle('dialog:openFile', async (_, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Supported Documents',
          extensions: ['pdf', 'docx', 'txt', 'md', 'csv', 'udf'],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
      ...options,
    })
    return { canceled: result.canceled, filePaths: result.filePaths }
  })

  // Native folder picker
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Save dialog
  ipcMain.handle('dialog:save', async (_, options = {}) => {
    const result = await dialog.showSaveDialog(mainWindow, options)
    return result.canceled ? null : result.filePath
  })

  // App version
  ipcMain.handle('app:version', () => app.getVersion())

  // Backend port — synchronous so preload can read it before any renderer code runs
  ipcMain.on('app:backendPort', (event) => { event.returnValue = BACKEND_PORT })

  // Auto-update: quit and install the downloaded update
  //
  // Sequence:
  //   1. Mark app as quitting (suppresses minimize-to-tray on window close)
  //   2. Kill the backend subprocess and wait for it to actually exit — this
  //      prevents NSIS from finding knovex-backend.exe still running and
  //      showing the "Knovex cannot be closed" dialog.
  //   3. Brief OS-level pause so all file handles are released.
  //   4. quitAndInstall(isSilent=true, forceRunAfter=true)
  //        isSilent=true       → NSIS runs with /S flag — zero installer UI
  //        forceRunAfter=true  → new version launches automatically after install
  ipcMain.on('app:install-update', async () => {
    app.isQuitting = true
    await killBackendAndWait()
    await new Promise((resolve) => setTimeout(resolve, 300))
    autoUpdater.quitAndInstall(true, true)
  })
}

// ─── Drag-and-drop file forwarding ───────────────────────────────────────────

function setupFileDrop() {
  app.on('will-finish-launching', () => {
    // macOS: open-file event
    app.on('open-file', (event, filePath) => {
      event.preventDefault()
      mainWindow?.webContents.send('file-drop', [filePath])
    })
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.on('ready', async () => {
  console.log('[app] Knovex starting (dev:', IS_DEV, ')')

  // Resolve the backend port before registering IPC (handlers read BACKEND_PORT)
  BACKEND_PORT = await findFreePort(8765)
  BACKEND_URL  = `http://127.0.0.1:${BACKEND_PORT}`
  HEALTH_URL   = `${BACKEND_URL}/api/health`
  console.log(`[app] backend port: ${BACKEND_PORT}`)

  registerIpcHandlers()
  setupFileDrop()
  setupAutoUpdater()

  // Start backend
  try {
    spawnBackend()
    await waitForBackend()
  } catch (err) {
    console.error('[app] Backend failed to start:', err.message)
    const logPath = path.join(app.getPath('userData'), 'backend.log')
    const lastLines = backendStderrLines.slice(-10).join('\n')
    const detail = lastLines
      ? `Last error output:\n${lastLines}\n\nFull log: ${logPath}`
      : `No output captured.\n\nCheck log file: ${logPath}`
    dialog.showErrorBox(
      'Knovex — Backend Error',
      `The Knovex backend failed to start:\n\n${err.message}\n\n${detail}\n\nPlease try restarting the app.`,
    )
    app.quit()
    return
  }

  // Create UI
  createTray()
  createMainWindow()
})

app.on('window-all-closed', () => {
  // On macOS, keep app running even with no windows (standard behaviour)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // macOS: re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  } else {
    mainWindow?.show()
  }
})

app.on('before-quit', () => {
  app.isQuitting = true
  backendShuttingDown = true   // suppress auto-restart while quitting
})

app.on('quit', () => {
  console.log('[app] Quitting — killing backend process')
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill()
  }
})
