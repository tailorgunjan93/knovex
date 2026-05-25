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

// ─── Constants ───────────────────────────────────────────────────────────────

const IS_DEV = process.argv.includes('--dev') || !app.isPackaged
const BACKEND_PORT = 8765
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`
const HEALTH_URL = `${BACKEND_URL}/api/health`
const VITE_DEV_URL = 'http://localhost:5173'

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
  backendEnv.PYTHONUNBUFFERED = '1'  // re-add the one we actually want

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

  backendProcess.on('exit', (code) => {
    console.log('[backend] exited with code:', code)
    logStream.write(`=== backend exited code=${code} ===\n`)
    logStream.end()
    backendReady = false
  })

  backendProcess.on('error', (err) => {
    console.error('[backend] spawn error:', err.message)
    logStream.write(`=== spawn error: ${err.message} ===\n`)
  })
}

// ─── Health polling ───────────────────────────────────────────────────────────

function waitForBackend(retries = 40, interval = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0

    const check = () => {
      attempts++
      const req = http.get(HEALTH_URL, (res) => {
        if (res.statusCode === 200) {
          backendReady = true
          console.log('[backend] ready after', attempts, 'attempts')
          resolve()
        } else {
          retry()
        }
      })
      req.on('error', retry)
      req.setTimeout(400, () => { req.destroy(); retry() })
    }

    const retry = () => {
      if (attempts >= retries) {
        reject(new Error(`Backend did not start after ${retries} attempts`))
      } else {
        setTimeout(check, interval)
      }
    }

    check()
  })
}

// ─── Window ───────────────────────────────────────────────────────────────────

// ─── Window state persistence (JSON file in userData) ────────────────────────

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState() {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), 'utf8')
    const state = JSON.parse(raw)
    // Validate: must have numeric width/height above minimums
    if (
      typeof state.width === 'number' && state.width >= WINDOW_MIN_WIDTH &&
      typeof state.height === 'number' && state.height >= WINDOW_MIN_HEIGHT
    ) {
      return state
    }
  } catch {
    // File absent or malformed — use defaults
  }
  return { width: WINDOW_DEFAULT_WIDTH, height: WINDOW_DEFAULT_HEIGHT, x: undefined, y: undefined }
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
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'))
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

  // Check on startup (after a short delay so the app finishes loading first)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] checkForUpdates failed:', err.message)
    })
  }, 8_000)
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  // Native file open dialog
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
    return result.canceled ? [] : result.filePaths
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

  // Auto-update: quit and install the downloaded update
  ipcMain.on('app:install-update', () => {
    app.isQuitting = true
    autoUpdater.quitAndInstall(false, true)
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
})

app.on('quit', () => {
  console.log('[app] Quitting — killing backend process')
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill()
  }
})
