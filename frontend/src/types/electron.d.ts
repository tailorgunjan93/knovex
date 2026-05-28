/**
 * TypeScript declarations for the Electron contextBridge API
 * exposed via desktop/preload.js as window.knovex
 */

interface FilePickerOptions {
  filters?: Array<{ name: string; extensions: string[] }>
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'createDirectory'>
}

interface FilePickerResult {
  canceled: boolean
  filePaths: string[]
}

interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
}

interface KnovexAPI {
  /** Open native file picker. Returns selected paths. */
  openFilePicker: (options?: FilePickerOptions) => Promise<FilePickerResult>

  /** Open native folder picker. Returns selected folder path or null. */
  openFolderPicker: () => Promise<string | null>

  /** Show "Save As" dialog. Returns chosen path or null. */
  showSaveDialog: (options?: SaveDialogOptions) => Promise<string | null>

  /** Platform string: win32 | darwin | linux */
  platform: string

  /** App version from package.json */
  appVersion: () => Promise<string>

  /**
   * The TCP port the backend is actually listening on.
   * Normally 8765; may be a different port if 8765 was already in use at launch.
   * Read synchronously by preload.js — always available before any renderer code runs.
   */
  backendPort: number

  /** Subscribe to file-drop events from the main process */
  onFileDrop: (callback: (paths: string[]) => void) => () => void

  /**
   * Subscribe to tray-initiated navigation events.
   * The main process calls ipcMain → renderer 'navigate' with a route path.
   */
  onNavigate: (callback: (route: string) => void) => () => void

  /**
   * Fired once a new app version has been silently downloaded.
   * Call installUpdate() to apply it.
   */
  onUpdateDownloaded: (
    callback: (info: { version: string; releaseNotes: string | null }) => void
  ) => () => void

  /**
   * Fired periodically while the update is downloading (0–100 %).
   */
  onUpdateProgress: (callback: (info: { pct: number }) => void) => () => void

  /**
   * Quit the app and install the already-downloaded update.
   */
  installUpdate: () => void
}

declare global {
  interface Window {
    knovex?: KnovexAPI
  }
}

export {}
