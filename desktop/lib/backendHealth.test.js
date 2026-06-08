'use strict'

const test = require('node:test')
const assert = require('node:assert')
const { waitForHealthy } = require('./backendHealth')

const noSleep = async () => {}

test('resolves once the probe succeeds', async () => {
  let calls = 0
  await waitForHealthy({
    probe: async () => {
      calls += 1
      return calls >= 3 // healthy on the 3rd poll
    },
    sleep: noSleep,
  })
  assert.strictEqual(calls, 3)
})

test('keeps waiting well past the old 30s / 60-attempt budget', async () => {
  // Simulate a slow post-update cold start: healthy only after 90s of (virtual) time.
  let t = 0
  const becomesHealthyAt = 90_000
  let polls = 0
  await waitForHealthy({
    probe: async () => {
      polls += 1
      return t >= becomesHealthyAt
    },
    now: () => t,
    sleep: async (ms) => {
      t += ms
    },
    timeoutMs: 120_000,
    intervalMs: 500,
  })
  assert.ok(polls > 60, `should poll past the old 60-attempt cap, got ${polls}`)
})

test('rejects after the deadline if never healthy', async () => {
  let t = 0
  await assert.rejects(
    waitForHealthy({
      probe: async () => false,
      now: () => t,
      sleep: async (ms) => {
        t += ms
      },
      timeoutMs: 120_000,
    }),
    /did not become healthy within 120s/,
  )
})

test('fails fast when the backend process has already exited', async () => {
  let polls = 0
  await assert.rejects(
    waitForHealthy({
      probe: async () => {
        polls += 1
        return false
      },
      isProcessAlive: () => false,
      sleep: noSleep,
    }),
    /exited before it became healthy/,
  )
  assert.strictEqual(polls, 0, 'must not poll when the process is already dead')
})

test('treats a throwing probe (ECONNREFUSED during startup) as not-ready', async () => {
  let calls = 0
  await waitForHealthy({
    probe: async () => {
      calls += 1
      if (calls < 2) throw new Error('ECONNREFUSED')
      return true
    },
    sleep: noSleep,
  })
  assert.strictEqual(calls, 2)
})
