/**
 * Knovex App — root routing setup
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/Layout/AppShell'
import KnowledgeBasePage from './pages/KnowledgeBase'
import ChatPage from './pages/Chat'
import LearnPage from './pages/Learn'
import SettingsPage from './pages/Settings'
import ReaderPage from './pages/Reader'
import ProgressPage from './pages/Progress'

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}
