import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
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
    // Electron loads the built index.html via file:// — asset paths MUST be
    // relative (e.g. "./assets/...") otherwise Chromium resolves "/assets/..."
    // against the filesystem root (C:\assets\...) and the JS bundle never loads.
    base: './',
  },
  test: {
    // Extend Vitest's expect with @testing-library/jest-dom matchers
    setupFiles: ['./src/setupTests.ts'],
    environment: 'jsdom',
    globals: true,
  },
})
