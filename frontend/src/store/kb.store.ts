/**
 * Knowledge Base Zustand Store
 *
 * Manages: KB list, selected KB, file list, file viewer state.
 */

import { create } from 'zustand'
import type { KB, FileRecord } from '@/api/kb.api'

interface KBState {
  // KB list
  kbs: KB[]
  kbsLoading: boolean

  // Selected KB
  selectedKBId: string | null
  selectedKB: KB | null

  // Files in selected KB
  files: FileRecord[]
  filesLoading: boolean

  // Open file in reader
  openFileId: string | null

  // Actions
  setKBs: (kbs: KB[]) => void
  setKBsLoading: (v: boolean) => void
  setSelectedKB: (kb: KB | null) => void
  setFiles: (files: FileRecord[]) => void
  setFilesLoading: (v: boolean) => void
  updateFileStatus: (fileId: string, status: FileRecord['status']) => void
  setOpenFile: (fileId: string | null) => void

  // KB mutations (local optimistic updates)
  addKB: (kb: KB) => void
  removeKB: (id: string) => void
  updateKB: (id: string, patch: Partial<KB>) => void

  // File mutations
  addFile: (file: FileRecord) => void
  removeFile: (fileId: string) => void
}

export const useKBStore = create<KBState>((set) => ({
  kbs: [],
  kbsLoading: false,
  selectedKBId: null,
  selectedKB: null,
  files: [],
  filesLoading: false,
  openFileId: null,

  setKBs: (kbs) => set({ kbs }),
  setKBsLoading: (v) => set({ kbsLoading: v }),
  setSelectedKB: (kb) => set({ selectedKB: kb, selectedKBId: kb?.id ?? null }),
  setFiles: (files) => set({ files }),
  setFilesLoading: (v) => set({ filesLoading: v }),
  setOpenFile: (fileId) => set({ openFileId: fileId }),

  updateFileStatus: (fileId, status) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.id === fileId ? { ...f, status } : f,
      ),
    })),

  addKB: (kb) => set((s) => ({ kbs: [kb, ...s.kbs] })),
  removeKB: (id) =>
    set((s) => ({
      kbs: s.kbs.filter((k) => k.id !== id),
      selectedKB: s.selectedKB?.id === id ? null : s.selectedKB,
    })),
  updateKB: (id, patch) =>
    set((s) => ({
      kbs: s.kbs.map((k) => (k.id === id ? { ...k, ...patch } : k)),
      selectedKB:
        s.selectedKB?.id === id
          ? { ...s.selectedKB, ...patch }
          : s.selectedKB,
    })),

  addFile: (file) => set((s) => ({ files: [file, ...s.files] })),
  removeFile: (fileId) =>
    set((s) => ({
      files: s.files.filter((f) => f.id !== fileId),
      openFileId: s.openFileId === fileId ? null : s.openFileId,
    })),
}))
