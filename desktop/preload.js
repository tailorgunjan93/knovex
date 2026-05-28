/**
 * Knovex Electron Preload Script
 *
 * Runs in the renderer process with Node.js access.
 * Exposes a safe, minimal API to the renderer via contextBridge.
 *
 * Available in renderer as: window.knovex.*
 */

const { contextBridge, ipcRenderer } = require('electron')

// Resolve the actual backend port synchronously — this value is set by main.js
// in app.on('ready') before the BrowserWindow is created, so it is always valid
// by the time any renderer/preload code runs.
const _backendPort = ipcRenderer.sendSync('app:backendPort')

contextBridge.exposeInMainWorld('knovex', {
  /**
   * The port the backend is actually listening on.
   * Normally 8765; may differ if that port was already in use at launch.
   */
  backendPort: _backendPort,

  /**
   * Open the native file picker and return selected file paths.
   * @param {object} options - Options for the file dialog.
   * @returns {Promise<string[]>} Array of absolute file paths selected.
   */
  openFilePicker: (options = {}) =>
    ipcRenderer.invoke('dialog:openFile', options),

  /**
   * Open the native folder picker.
   * @returns {Promise<string | null>} Selected folder path or null.
   */
  openFolderPicker: () =>
    ipcRenderer.invoke('dialog:openFolder'),

  /**
   * Show the native "Save As" dialog.
   * @param {object} options - title, defaultPath, filters, etc.
   * @returns {Promise<string | null>} Chosen save path or null.
   */
  showSaveDialog: (options = {}) =>
    ipcRenderer.invoke('dialog:save', options),

  /**
   * Get the platform name (win32 | darwin | linux).
   */
  platform: process.platform,

  /**
   * App version from package.json.
   */
  appVersion: () => ipcRenderer.invoke('app:version'),

  /**
   * Listen for file-drop events forwarded from the main process.
   * @param {function} callback - Called with array of file paths.
   */
  onFileDrop: (callback) => {
    ipcRenderer.on('file-drop', (_, paths) => callback(paths))
    // Return a cleanup function
    return () => ipcRenderer.removeAllListeners('file-drop')
  },

  /**
   * Listen for navigate events sent from the tray menu.
   * The main process sends navigate('/settings') when the tray item is clicked.
   * @param {function} callback - Called with the target route path string.
   * @returns {function} Cleanup function to remove the listener.
   */
  onNavigate: (callback) => {
    const handler = (_, route) => callback(route)
    ipcRenderer.on('navigate', handler)
    return () => ipcRenderer.removeListener('navigate', handler)
  },

  /**
   * Subscribe to auto-update download-complete events.
   * Fired once the new installer has been silently downloaded.
   * @param {function} callback - Called with { version: string, releaseNotes: string | null }
   * @returns {function} Cleanup function.
   */
  onUpdateDownloaded: (callback) => {
    const handler = (_, info) => callback(info)
    ipcRenderer.on('app:update-downloaded', handler)
    return () => ipcRenderer.removeListener('app:update-downloaded', handler)
  },

  /**
   * Subscribe to update download-progress events.
   * @param {function} callback - Called with { pct: number } (0-100)
   * @returns {function} Cleanup function.
   */
  onUpdateProgress: (callback) => {
    const handler = (_, info) => callback(info)
    ipcRenderer.on('app:update-progress', handler)
    return () => ipcRenderer.removeListener('app:update-progress', handler)
  },

  /**
   * Quit the app and install the downloaded update immediately.
   * Only call this after onUpdateDownloaded has fired.
   */
  installUpdate: () => ipcRenderer.send('app:install-update'),
})
