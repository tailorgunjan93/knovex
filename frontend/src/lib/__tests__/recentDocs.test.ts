/**
 * recentDocs — persistence wrapper tests
 *
 * Coverage:
 *   • getRecentDocs returns [] when nothing stored
 *   • recordRecentDoc prepends newest-first and persists
 *   • re-opening an existing doc de-duplicates (moves to top, no duplicate)
 *   • list is capped at the max length
 *   • corrupt / non-array stored values fail soft to []
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { getRecentDocs, recordRecentDoc, clearRecentDocs } from '../recentDocs'

const doc = (n: number) => ({
  kbId: `kb${n}`, fileId: `f${n}`, fileName: `Doc ${n}.pdf`, format: 'pdf',
})

beforeEach(() => {
  localStorage.clear()
})

describe('recentDocs', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(getRecentDocs()).toEqual([])
  })

  it('records a document and returns it newest-first', () => {
    const list = recordRecentDoc(doc(1))
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ fileId: 'f1', fileName: 'Doc 1.pdf' })
    expect(typeof list[0].openedAt).toBe('number')
    // persisted
    expect(getRecentDocs()).toHaveLength(1)
  })

  it('puts the most recently opened document first', () => {
    recordRecentDoc(doc(1))
    const list = recordRecentDoc(doc(2))
    expect(list.map(d => d.fileId)).toEqual(['f2', 'f1'])
  })

  it('de-duplicates by fileId (re-open moves to top, no duplicate)', () => {
    recordRecentDoc(doc(1))
    recordRecentDoc(doc(2))
    const list = recordRecentDoc(doc(1))
    expect(list.map(d => d.fileId)).toEqual(['f1', 'f2'])
    expect(list).toHaveLength(2)
  })

  it('caps the list at 8 entries', () => {
    for (let i = 1; i <= 12; i++) recordRecentDoc(doc(i))
    const list = getRecentDocs()
    expect(list).toHaveLength(8)
    // newest (12) first, oldest kept is 5
    expect(list[0].fileId).toBe('f12')
    expect(list[list.length - 1].fileId).toBe('f5')
  })

  it('fails soft to [] on corrupt stored data', () => {
    localStorage.setItem('knovex.recentDocs', '{not json')
    expect(getRecentDocs()).toEqual([])
  })

  it('fails soft to [] when stored value is not an array', () => {
    localStorage.setItem('knovex.recentDocs', '{"fileId":"x"}')
    expect(getRecentDocs()).toEqual([])
  })

  it('drops entries that do not match the RecentDoc shape', () => {
    localStorage.setItem('knovex.recentDocs', JSON.stringify([
      { kbId: 'kb1', fileId: 'f1', fileName: 'ok.pdf', format: 'pdf', openedAt: 1 },
      { fileId: 'bad' }, // missing fields
    ]))
    const list = getRecentDocs()
    expect(list).toHaveLength(1)
    expect(list[0].fileId).toBe('f1')
  })

  it('clears the list', () => {
    recordRecentDoc(doc(1))
    expect(clearRecentDocs()).toEqual([])
    expect(getRecentDocs()).toEqual([])
  })
})
