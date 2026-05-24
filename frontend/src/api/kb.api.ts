/**
 * Knowledge Base API — typed wrappers for all /api/kb/* endpoints
 */

import apiClient from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KBStats {
  file_count: number
  total_size_bytes: number
  total_chunks: number
}

export interface KB {
  id: string
  name: string
  color: string
  icon: string
  created_at: string
  updated_at: string
  stats: KBStats
}

export interface FileRecord {
  id: string
  kb_id: string
  name: string
  format: string
  size_bytes: number
  status: 'pending' | 'ingesting' | 'ready' | 'stale' | 'missing' | 'error'
  content_hash: string | null
  chunk_count: number
  version: number
  added_at: string
  ingested_at: string | null
  error_message: string | null
}

export interface FileStatus {
  id: string
  status: string
  progress: number
  chunks_indexed: number
  error: string | null
}

// ─── API calls ───────────────────────────────────────────────────────────────

export const kbApi = {
  /** List all knowledge bases. */
  async list(): Promise<KB[]> {
    const res = await apiClient.get<{ kbs: KB[] }>('/kb')
    return res.data.kbs
  },

  /** Get a single KB by ID. */
  async get(id: string): Promise<KB> {
    const res = await apiClient.get<KB>(`/kb/${id}`)
    return res.data
  },

  /** Create a new KB. */
  async create(data: { name: string; color?: string; icon?: string }): Promise<KB> {
    const res = await apiClient.post<KB>('/kb', data)
    return res.data
  },

  /** Update KB name/color/icon. */
  async update(id: string, data: { name?: string; color?: string; icon?: string }): Promise<KB> {
    const res = await apiClient.put<KB>(`/kb/${id}`, data)
    return res.data
  },

  /** Delete a KB and all its files. */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/kb/${id}`)
  },

  /** Trigger a full KB re-index. */
  async reindex(id: string): Promise<{ task_id: string; status: string }> {
    const res = await apiClient.post(`/kb/${id}/reindex`)
    return res.data
  },

  // ── File operations ──────────────────────────────────────────────────────

  /** List files in a KB. */
  async listFiles(kbId: string): Promise<FileRecord[]> {
    const res = await apiClient.get<{ files: FileRecord[] }>(`/kb/${kbId}/files`)
    return res.data.files
  },

  /** Add a file to a KB by path. */
  async addFile(kbId: string, filePath: string): Promise<FileRecord> {
    const res = await apiClient.post<FileRecord>(`/kb/${kbId}/files`, {
      file_path: filePath,
    })
    return res.data
  },

  /** Remove a file from a KB. */
  async removeFile(kbId: string, fileId: string): Promise<void> {
    await apiClient.delete(`/kb/${kbId}/files/${fileId}`)
  },

  /** Get ingestion status for a file. */
  async getFileStatus(kbId: string, fileId: string): Promise<FileStatus> {
    const res = await apiClient.get<FileStatus>(`/kb/${kbId}/files/${fileId}/status`)
    return res.data
  },

  /** Re-index a stale file. */
  async reindexFile(kbId: string, fileId: string): Promise<void> {
    await apiClient.post(`/kb/${kbId}/files/${fileId}/reindex`)
  },

  /** Update the path for a missing file. */
  async updateFilePath(kbId: string, fileId: string, newPath: string): Promise<FileRecord> {
    const res = await apiClient.put<FileRecord>(`/kb/${kbId}/files/${fileId}/path`, {
      new_path: newPath,
    })
    return res.data
  },
}
