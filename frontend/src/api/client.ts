/**
 * Knovex API Client
 *
 * Axios instance pre-configured for the FastAPI backend at localhost:8765.
 * All API modules import this instance and add typed wrappers on top.
 */

import axios from 'axios'

// In the packaged Electron app, window.knovex.backendPort holds the port the
// backend actually bound to (8765, or a fallback if 8765 was already in use).
// In the Vite dev server the window.knovex bridge doesn't exist, so we fall
// back to the env var or the default port.
const _electronPort = (window as { knovex?: { backendPort?: number } }).knovex?.backendPort
export const API_BASE = _electronPort
  ? `http://localhost:${_electronPort}`
  : (import.meta.env.VITE_API_BASE ?? 'http://localhost:8765')

const apiClient = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Response interceptor — normalise errors ─────────────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Backend returned a structured error
      const data = error.response.data as { error?: string; detail?: unknown }
      const message =
        typeof data?.error === 'string'
          ? data.error
          : typeof data?.detail === 'string'
          ? data.detail
          : `HTTP ${error.response.status}`
      error.message = message
    }
    return Promise.reject(error)
  },
)

export default apiClient
