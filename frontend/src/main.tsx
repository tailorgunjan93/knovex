import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { RootErrorBoundary } from './components/ErrorBoundary'
import BackendGate from './components/BackendGate'

// ── Defensive root-element guard ──────────────────────────────────────────────
// If for any reason the DOM element is absent (malformed HTML, wrong id, etc.)
// this fails loudly with a readable message rather than "Cannot read properties
// of null (reading 'render')" which is opaque.
const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.style.cssText = 'margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0B0B0C;color:#F5F1EA;font-family:system-ui;'
  document.body.innerHTML = '<div style="text-align:center"><h2>Startup error</h2><p style="opacity:.5">DOM element #root not found. The HTML bundle may be corrupted.</p></div>'
  throw new Error('#root element not found — cannot mount React app')
}

// ── Query client ──────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry:     1,
    },
  },
})

// ── Mount ─────────────────────────────────────────────────────────────────────
// RootErrorBoundary sits outside StrictMode so it catches errors from both
// the dev double-render and the real render — keeping the window from going
// completely black on any uncaught render exception.
ReactDOM.createRoot(rootEl).render(
  <RootErrorBoundary>
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BackendGate>
          <App />
        </BackendGate>
      </QueryClientProvider>
    </React.StrictMode>
  </RootErrorBoundary>,
)
