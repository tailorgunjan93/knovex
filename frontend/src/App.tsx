/**
 * Knovex App — root routing setup
 *
 * Why HashRouter, not BrowserRouter:
 *   In the packaged Electron app, the renderer is loaded via loadFile() which
 *   uses the file:// protocol. BrowserRouter reads window.location.pathname,
 *   which under file:// is something like
 *   "/C:/Users/.../resources/frontend/dist/index.html" — none of the defined
 *   routes match, so the entire app renders empty (React 18 also unmounts the
 *   whole tree on uncaught render errors, leaving a blank black window).
 *
 *   HashRouter keeps all routing state in the URL hash (#/kb, #/chat, …).
 *   The hash is always independent of the file:// host path, so routing works
 *   identically in the installed app and the Vite dev server.
 */

import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/Layout/AppShell'
import KnowledgeBasePage from './pages/KnowledgeBase'
import ChatPage from './pages/Chat'
import LearnPage from './pages/Learn'
import SettingsPage from './pages/Settings'
import ReaderPage from './pages/Reader'
import ProgressPage from './pages/Progress'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/kb" replace />} />
          <Route path="/kb/*"       element={<KnowledgeBasePage />} />
          <Route path="/chat/*"     element={<ChatPage />} />
          <Route path="/reader/*"   element={<ReaderPage />} />
          <Route path="/learn/*"    element={<LearnPage />} />
          <Route path="/progress/*" element={<ProgressPage />} />
          <Route path="/settings"   element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
