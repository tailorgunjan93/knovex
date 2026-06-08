'use strict'

const test = require('node:test')
const assert = require('node:assert')
const { sanitizeWindowState, parseWindowState } = require('./windowState')

const OPTS = {
  minWidth: 900,
  minHeight: 600,
  defaults: { width: 1280, height: 820, x: undefined, y: undefined },
}

test('accepts a valid saved state and preserves x/y', () => {
  const out = sanitizeWindowState({ width: 1000, height: 700, x: 50, y: 60 }, OPTS)
  assert.deepStrictEqual(out, { width: 1000, height: 700, x: 50, y: 60 })
})

test('accepts size without position (x/y omitted)', () => {
  const out = sanitizeWindowState({ width: 1000, height: 700 }, OPTS)
  assert.deepStrictEqual(out, { width: 1000, height: 700 })
})

test('rejects width below the minimum → defaults', () => {
  assert.deepStrictEqual(sanitizeWindowState({ width: 100, height: 700 }, OPTS), OPTS.defaults)
})

test('rejects missing/!numeric height → defaults', () => {
  assert.deepStrictEqual(sanitizeWindowState({ width: 1000 }, OPTS), OPTS.defaults)
  assert.deepStrictEqual(sanitizeWindowState({ width: 1000, height: 'tall' }, OPTS), OPTS.defaults)
})

test('rejects NaN/Infinity dimensions → defaults', () => {
  assert.deepStrictEqual(sanitizeWindowState({ width: NaN, height: 700 }, OPTS), OPTS.defaults)
  assert.deepStrictEqual(sanitizeWindowState({ width: Infinity, height: 700 }, OPTS), OPTS.defaults)
})

test('drops non-finite x/y but keeps valid size', () => {
  const out = sanitizeWindowState({ width: 1000, height: 700, x: NaN, y: 5 }, OPTS)
  assert.deepStrictEqual(out, { width: 1000, height: 700, y: 5 })
})

test('tolerates garbage (null / string / array) → defaults', () => {
  for (const g of [null, undefined, 'nope', 42, []]) {
    assert.deepStrictEqual(sanitizeWindowState(g, OPTS), OPTS.defaults)
  }
})

test('parseWindowState: malformed JSON → defaults (never throws)', () => {
  assert.deepStrictEqual(parseWindowState('{not json', OPTS), OPTS.defaults)
})

test('parseWindowState: valid JSON round-trips through sanitize', () => {
  const out = parseWindowState(JSON.stringify({ width: 1100, height: 750, x: 10, y: 20 }), OPTS)
  assert.deepStrictEqual(out, { width: 1100, height: 750, x: 10, y: 20 })
})
