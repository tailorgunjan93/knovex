import { describe, it, expect, vi } from 'vitest'
import { pollIngestionStatus, type IngestionStatus } from '../pollStatus'

/** A controllable clock: each sleep() advances virtual time by the slept amount. */
function fakeClock() {
  let t = 0
  return {
    now: () => t,
    sleep: async (ms: number) => { t += ms },
  }
}

/** getStatus that returns a scripted sequence, repeating the last entry. */
function scripted(seq: Array<IngestionStatus | 'throw'>) {
  let i = 0
  return vi.fn(async () => {
    const v = seq[Math.min(i, seq.length - 1)]
    i++
    if (v === 'throw') throw new Error('network')
    return v
  })
}

describe('pollIngestionStatus', () => {
  it('resolves ready when status becomes ready', async () => {
    const clock = fakeClock()
    const res = await pollIngestionStatus({
      getStatus: scripted([{ status: 'ingesting' }, { status: 'ingesting' }, { status: 'ready' }]),
      ...clock,
    })
    expect(res).toEqual({ outcome: 'ready' })
  })

  it('surfaces the backend error message', async () => {
    const clock = fakeClock()
    const res = await pollIngestionStatus({
      getStatus: scripted([{ status: 'ingesting' }, { status: 'error', error: 'Parse error: boom' }]),
      ...clock,
    })
    expect(res).toEqual({ outcome: 'error', message: 'Parse error: boom' })
  })

  it('keeps waiting through a long ingesting phase (no fixed attempt cap)', async () => {
    const clock = fakeClock()
    // 200 ingesting polls (~6.7 min at 2s) then ready — must NOT time out at 2 min.
    const seq: IngestionStatus[] = Array(200).fill({ status: 'ingesting' })
    seq.push({ status: 'ready' })
    const getStatus = scripted(seq)
    const res = await pollIngestionStatus({ getStatus, ...clock })
    expect(res).toEqual({ outcome: 'ready' })
    expect(getStatus).toHaveBeenCalledTimes(201)
  })

  it('times out only after the generous deadline', async () => {
    const clock = fakeClock()
    const res = await pollIngestionStatus({
      getStatus: scripted([{ status: 'ingesting' }]),
      deadlineMs: 10_000,
      intervalMs: 2_000,
      ...clock,
    })
    expect(res).toEqual({ outcome: 'timeout' })
  })

  it('reports disconnected after repeated request failures', async () => {
    const clock = fakeClock()
    const res = await pollIngestionStatus({
      getStatus: scripted(['throw']),
      maxConsecutiveErrors: 3,
      ...clock,
    })
    expect(res).toEqual({ outcome: 'disconnected' })
  })

  it('tolerates transient errors that recover', async () => {
    const clock = fakeClock()
    const res = await pollIngestionStatus({
      getStatus: scripted(['throw', 'throw', { status: 'ingesting' }, { status: 'ready' }]),
      maxConsecutiveErrors: 5,
      ...clock,
    })
    expect(res).toEqual({ outcome: 'ready' })
  })
})
