/**
 * OCR pack API — typed wrappers for /api/ocr/*
 *
 * OCR (via docnest) is too large to bundle, so the desktop app provisions it on
 * demand. These call the backend's provisioning state machine.
 */

import apiClient from './client'

export type OcrState =
  | 'not_installed'
  | 'installing'
  | 'ready'
  | 'error'
  | 'unavailable'

export interface OcrStatus {
  state: OcrState
  detail: string
  python_path: string | null
  log_tail: string[]
}

export const ocrApi = {
  async status(): Promise<OcrStatus> {
    const res = await apiClient.get<OcrStatus>('/ocr/status')
    return res.data
  },

  async install(): Promise<OcrStatus> {
    const res = await apiClient.post<OcrStatus>('/ocr/install')
    return res.data
  },

  async uninstall(): Promise<OcrStatus> {
    const res = await apiClient.post<OcrStatus>('/ocr/uninstall')
    return res.data
  },
}
