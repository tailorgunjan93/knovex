/**
 * Knovex API Client
 *
 * Axios instance pre-configured for the FastAPI backend at localhost:8765.
 * All API modules import this instance and add typed wrappers on top.
 */

import axios from 'axios'

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8765'

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
