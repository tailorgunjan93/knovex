/**
 * Knovex Electron Preload Script
 *
 * Runs in the renderer process with Node.js access.
 * Exposes a safe, minimal API to the renderer via contextBridge.
 *
 * Available in renderer as: window.knovex.*
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('knovex', {
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
})
