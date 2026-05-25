/**
 * Setup API — typed wrappers for /api/setup/* endpoints
 *
 * Handles first-launch local ONNX model status check and SSE download.
 */

import apiClient from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModelStatus {
  ready: boolean
  model_name: string
  size_bytes: number
  path: string
}

export type DownloadProgressEvent =
  | { type: 'progress'; downloaded: number; total: number; pct: number }
  | { type: 'done'; size_bytes: number }
  | { type: 'error'; error: string }

// ─── API calls ───────────────────────────────────────────────────────────────

export const setupApi = {
  /** Check whether the local ONNX embedding model files are present. */
  async getModelStatus(): Promise<ModelStatus> {
    const res = await apiClient.get<ModelStatus>('/setup/models/status')
    return res.data
  },

  /**
   * Download the local ONNX model with progress callbacks.
   *
   * Streams SSE events from POST /api/setup/models/download.
   * onProgress is called for each progress tick (0-100%).
   * Returns a promise that resolves when done or rejects on error.
   */
  downloadModel(
    onProgress: (pct: number, downloaded: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const baseUrl = apiClient.defaults.baseURL ?? 'http://localhost:8765/api'
      const url = `${baseUrl}/setup/models/download`

      fetch(url, {
        method: 'POST',
        signal,
        headers: { Accept: 'text/event-stream' },
      })
        .then(async (res) => {
          if (!res.ok) {
            reject(new Error(`HTTP ${res.status}`))
            return
          }
          const reader = res.body?.getReader()
          if (!reader) { reject(new Error('No response body')); return }

          const decoder = new TextDecoder()
          let buf = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              try {
                const evt: DownloadProgressEvent = JSON.parse(line.slice(6))
                if (evt.type === 'progress') {
                  onProgress(evt.pct, evt.downloaded, evt.total)
                } else if (evt.type === 'done') {
                  resolve()
                  return
                } else if (evt.type === 'error') {
                  reject(new Error(evt.error))
                  return
                }
              } catch {
                // ignore malformed lines
              }
            }
          }
          resolve()
        })
        .catch(reject)
    })
  },
}
