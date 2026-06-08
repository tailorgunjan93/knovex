'use strict'

const test = require('node:test')
const assert = require('node:assert')
const { isExternalUrl } = require('./externalLink')

const PROD = 'file:///C:/Users/x/AppData/Local/Programs/Knovex/resources/frontend/dist/index.html'
const DEV = 'http://localhost:5173/'

test('packaged app: an https website is external', () => {
  assert.strictEqual(isExternalUrl('https://www.npr.org/sections/news/', PROD), true)
  assert.strictEqual(isExternalUrl('http://example.com/page', PROD), true)
})

test('packaged app: file:// hash route is internal (do not hijack)', () => {
  assert.strictEqual(isExternalUrl(PROD + '#/learn', PROD), false)
  assert.strictEqual(isExternalUrl(PROD, PROD), false)
})

test('dev: same-origin localhost is internal; other hosts external', () => {
  assert.strictEqual(isExternalUrl('http://localhost:5173/#/chat', DEV), false)
  assert.strictEqual(isExternalUrl('https://www.npr.org/', DEV), true)
  // different port on localhost counts as a different origin → external
  assert.strictEqual(isExternalUrl('http://localhost:8765/api/health', DEV), true)
})

test('mailto / tel always open externally', () => {
  assert.strictEqual(isExternalUrl('mailto:hi@example.com', PROD), true)
  assert.strictEqual(isExternalUrl('tel:+15551234567', DEV), true)
})

test('non-web protocols are not hijacked', () => {
  assert.strictEqual(isExternalUrl('about:blank', PROD), false)
  assert.strictEqual(isExternalUrl('devtools://devtools/bundled/x.html', PROD), false)
  assert.strictEqual(isExternalUrl('blob:file:///abc', PROD), false)
})

test('unparseable target is not hijacked', () => {
  assert.strictEqual(isExternalUrl('not a url', PROD), false)
})

test('no/!parseable app origin → http(s) target treated as external', () => {
  assert.strictEqual(isExternalUrl('https://npr.org', ''), true)
})
