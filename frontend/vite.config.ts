import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  // CRITICAL — must be at the TOP LEVEL, NOT inside build:{}.
  // Vite's `base` is a shared option; placing it inside build:{} is a silent
  // no-op and Vite keeps the default base:'/' which generates absolute asset
  // paths (/assets/...).  Under Electron's file:// protocol, /assets/... is
  // resolved against the filesystem root (C:\assets\...) so the JS bundle is
  // never found, React never mounts, and the window stays black.
  // With base:'./' here, Vite emits ./assets/... which resolves correctly
  // relative to the index.html file regardless of where it lives on disk.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Proxy API calls to FastAPI backend in dev mode
    proxy: {
      '/api': {
        target: 'http://localhost:8765',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    // Extend Vitest's expect with @testing-library/jest-dom matchers
    setupFiles: ['./src/setupTests.ts'],
    environment: 'jsdom',
    globals: true,
    // Headroom for import-heavy MUI + jsdom render tests under parallel load.
    // The default 5s is exceeded by scheduling/import overhead (not test logic)
    // as the suite grows, which surfaces as flaky timeouts on otherwise-correct
    // synchronous render tests.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
