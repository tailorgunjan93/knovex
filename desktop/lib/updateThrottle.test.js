'use strict'

const test = require('node:test')
const assert = require('node:assert')
const { createThrottledCheck } = require('./updateThrottle')

test('runs on the first call', () => {
  let calls = 0
  const trigger = createThrottledCheck({ check: () => { calls += 1 }, now: () => 0 })
  assert.strictEqual(trigger(), true)
  assert.strictEqual(calls, 1)
})

test('skips a second call within the throttle window', () => {
  let t = 0
  let calls = 0
  const trigger = createThrottledCheck({
    check: () => { calls += 1 },
    minIntervalMs: 1000,
    now: () => t,
  })
  assert.strictEqual(trigger(), true)   // t=0 runs
  t = 500
  assert.strictEqual(trigger(), false)  // within 1000ms → skipped
  assert.strictEqual(calls, 1)
})

test('runs again after the throttle window elapses', () => {
  let t = 0
  let calls = 0
  const trigger = createThrottledCheck({
    check: () => { calls += 1 },
    minIntervalMs: 1000,
    now: () => t,
  })
  trigger()           // t=0
  t = 1500
  assert.strictEqual(trigger(), true)
  assert.strictEqual(calls, 2)
})

test('force bypasses the throttle (manual "Check for updates")', () => {
  let t = 0
  let calls = 0
  let lastManual = null
  const trigger = createThrottledCheck({
    check: ({ manual }) => { calls += 1; lastManual = manual },
    minIntervalMs: 10_000,
    now: () => t,
  })
  trigger()                       // auto, t=0 → runs (manual=false)
  assert.strictEqual(lastManual, false)
  t = 100
  assert.strictEqual(trigger({ force: true }), true) // within window but forced
  assert.strictEqual(calls, 2)
  assert.strictEqual(lastManual, true)
})

test('throws if check is not a function', () => {
  assert.throws(() => createThrottledCheck({ check: null }), TypeError)
})
