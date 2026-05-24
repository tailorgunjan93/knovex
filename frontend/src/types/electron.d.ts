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

  /** Subscribe to file-drop events from the main process */
  onFileDrop: (callback: (paths: string[]) => void) => () => void
}

declare global {
  interface Window {
    knovex?: KnovexAPI
  }
}

export {}
