/**
 * Cinematic (Manim) pack API — typed wrappers for /api/manim/*
 *
 * Manim is provisioned on demand (like OCR). Rendering is slow (~30-90s), so the
 * render call uses a long timeout. The returned video_url is relative; use
 * `manimApi.absoluteVideoUrl` for a <video> src.
 */

import apiClient, { API_BASE } from './client'

export type PackState = 'not_installed' | 'installing' | 'ready' | 'error' | 'unavailable'

export interface PackStatus {
  state: PackState
  detail: string
  python_path: string | null
  log_tail: string[]
}

export interface RenderResult {
  ok: boolean
  render_id?: string
  video_url?: string        // relative, e.g. /api/manim/video/<id>
  error?: string
  attempts: number
}

export const manimApi = {
  async status(): Promise<PackStatus> {
    return (await apiClient.get<PackStatus>('/manim/status')).data
  },
  async install(): Promise<PackStatus> {
    return (await apiClient.post<PackStatus>('/manim/install')).data
  },
  async uninstall(): Promise<PackStatus> {
    return (await apiClient.post<PackStatus>('/manim/uninstall')).data
  },
  async render(topic: string, difficulty = 'intermediate', language = 'English'): Promise<RenderResult> {
    // Renders take tens of seconds — override the default 30s client timeout.
    const res = await apiClient.post<RenderResult>(
      '/manim/render', { topic, difficulty, language }, { timeout: 180_000 },
    )
    return res.data
  },
  /** Absolute URL for a <video> src (apiClient is relative to /api). */
  absoluteVideoUrl(relativeUrl: string): string {
    return `${API_BASE}${relativeUrl}`
  },
}
