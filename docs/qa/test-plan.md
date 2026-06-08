# Knovex — Master Test Plan & Test Case Catalog

> **Goal: a robust app — no breaking between releases, every feature works
> smoothly.** This document is the single source of truth for QA. It defines the
> process, the regression suite, and a manual-tester-style test case for every
> feature. Every new feature or bug fix MUST add/extend cases here first.

- **Owner:** Gunjan Tailor
- **Last updated:** 2026-06-08
- **Companion docs:** `CLAUDE.md` (release process), `docs/rca/` (incident RCAs)

---

## 1. The mandatory QA process (non-negotiable)

For **every** feature addition or bug fix, in order:

1. **Write/extend test cases here first** (manual case + the automated test that
   encodes it). For a bug, the automated test must **fail before** the fix.
2. **Implement** the minimal correct change.
3. **Run the full regression** (§3) — all green, no skips.
4. **Update this doc**: mark the case automated, add the test path.
5. **Only then** bump version, update CHANGELOG, commit, tag, ship.

A bug that escaped to a user gets an RCA in `docs/rca/` and a permanent guard test.

---

## 2. Test environments

| Aspect | Dev | Packaged (what users run) |
|---|---|---|
| Frontend | Vite dev server (5173) | `frontend/dist` via `file://` |
| Backend | `uvicorn` from `.venv` | `knovex-backend.exe` (PyInstaller) |
| `window.knovex` | undefined (browser fallbacks) | defined (IPC path) |
| Heavy deps (numpy/faiss/torch) | present | **excluded** → must degrade gracefully |
| Auto-updater / tray / NSIS | disabled / n.a. | active |

**Rule:** any behaviour that differs between these columns needs a test that
exercises the *packaged* path (real-backend E2E, desktop `node --test`, or a
unit test that simulates the absent dependency).

---

## 3. Automated regression suite (the gate)

All five run in CI on every PR and are **required** by the branch ruleset. Run all
locally before shipping:

| Suite | Command | Covers |
|---|---|---|
| Backend unit + integration | `pytest tests/ -v` | services, API contracts, SSE seam (ASGITransport), drift guards |
| Backend lint | `ruff check backend/ tests/` | style/correctness |
| Frontend unit | `cd frontend && npm test` | components, hooks, `sseStream` resilience |
| Frontend types + build | `cd frontend && npm run build` | type safety, bundling |
| Desktop main process | `cd desktop && node --test` | backend health poll, lifecycle logic |
| Real-backend E2E | `npm run test:e2e:real` | real frontend ↔ real backend streaming (fake LLM, no secrets) |
| Browser E2E (mocked API) | `npm run test:e2e` | frontend journeys / rendering |
| Electron E2E (heavy, manual) | `npm run test:e2e:electron` | packaged IPC, startup, window state |

**Definition of "regression green":** the five CI gates pass. The Electron E2E and
the manual/model-dependent checks (§6) are run before a release.

---

## 4. Test case catalog

Legend — **Auto**: ✅ automated · 🧪 manual · ⏳ planned.
Each case: preconditions → steps → expected.

### 4.1 App lifecycle & backend

| ID | Case | Steps → Expected | Auto | Test |
|----|------|------------------|------|------|
| LC-1 | Cold start succeeds | Launch app → splash "Starting Knovex…" → app shell appears, no error | 🧪 | manual |
| LC-2 | Slow cold start (post-update) does NOT false-fail | Backend takes >30s to bind → app still waits (≤120s), no "did not start" dialog | ✅ | `desktop/lib/backendHealth.test.js` |
| LC-3 | Backend crash → fail fast (not 120s hang) | Backend process exits during startup → error surfaces immediately | ✅ | `desktop/lib/backendHealth.test.js` |
| LC-4 | Backend port fallback | 8765 busy at launch → app picks a free port, health polls it | 🧪 | manual |
| LC-5 | Backend auto-restart on crash | Kill backend while running → app respawns it (≤5/60s), recovers | ⏳ | planned (electron E2E) |
| LC-6 | Health endpoint | `GET /api/health` → 200, `{status, version}` | ✅ | `test_*` health |
| LC-7 | Window size/position persists across restarts | valid saved bounds restored; corrupt/too-small → safe defaults | ✅ | `desktop/lib/windowState.test.js` |

### 4.2 Auto-update & tray

| ID | Case | Expected | Auto | Test |
|----|------|----------|------|------|
| AU-1 | Update detected on launch | New release published → "Restart to update" banner after check | 🧪 | manual |
| AU-2 | Update check cadence | Re-checks every 4h while running | 🧪 | manual |
| AU-3 | Quit-from-tray re-triggers check | Tray → Quit → relaunch → checks within ~10s | 🧪 | manual |
| AU-4 | Installer replaces old version cleanly | Update install → no "failed to uninstall" | ✅ guard | `tests/test_installer_nsis.py` |
| AU-5 | Minimise to tray; restore; quit | X hides to tray; double-click restores; Quit exits | ⏳ | planned (electron E2E) |

### 4.3 Settings

| ID | Case | Expected | Auto | Test |
|----|------|----------|------|------|
| SE-1 | Provider switch | Change provider → model dropdown repopulates for that provider | ✅ | `e2e/settings.spec.ts`, `LLMSettings.test.tsx` |
| SE-2 | Model list uses the right provider's key | Models fetched with the selected provider's key | ✅ | `test_settings_multiprovider.py` |
| SE-3 | API key save + mask | Save key → stored encrypted, shown masked | ✅ | `test_encryption.py`, settings E2E |
| SE-4 | Test Connection | Valid → success+latency; invalid → clear error | 🧪 | manual (needs real key) |
| SE-5 | Search engine select | DuckDuckGo default (no key); Serper/Brave reveal key field | ✅ | `e2e/settings.spec.ts`, `SearchSettings.test.tsx` |
| SE-6 | Theme switch (light/med/dark) | Persists; PUT /api/settings | ✅ | `e2e/settings.spec.ts` |
| SE-7 | Storage path change | Save disabled when empty; valid path saves | ✅ | `e2e/settings.spec.ts` |
| SE-8 | App version visible | Sidebar shows `v{x}`; click → Settings/About | ✅ | `useAppVersion.test.tsx` |
| SE-9 | Settings survives backend 500 | Page doesn't crash | ✅ | `e2e/settings.spec.ts` |

### 4.4 Knowledge Base

| ID | Case | Expected | Auto | Test |
|----|------|----------|------|------|
| KB-1 | Create KB | New KB appears in list | ✅ | `e2e/kb.spec.ts` |
| KB-2 | Delete KB | KB + files removed | ✅ | `e2e/kb.spec.ts` |
| KB-3 | Upload via native picker | `dialog:openFile` → `{canceled, filePaths}` handled | ✅ guard | `e2e/electron/ipc.spec.ts` |
| KB-4 | Upload file → ingestion (browser input path) | file uploads + ingests, no error | ✅ | `e2e/real-backend/attach-upload.spec.ts` |
| KB-4b | True drag-and-drop gesture | dropped file ingests | 🧪 | manual (gesture only; upload path covered by KB-4) |
| KB-5 | Ingestion status polling | Long ingest → progress, no premature timeout (15-min budget) | ✅ | `pollStatus.test.ts` |
| KB-6 | Text PDF ingestion | Fast PyMuPDF path; searchable text | ✅ | `test_ingestion_pdf_text.py` |
| KB-7 | Scanned/image PDF (OCR) | Delegates to docnest OCR; recovers text | ✅ `@slow` | `test_docnest_adapter.py` |
| KB-8 | OCR pack on-demand provision | Install/uninstall/status; sidecar | ✅ | `test_ocr_*.py` |
| KB-9 | Hindi/Devanagari OCR | EasyOCR recovers Devanagari | 🧪 | manual |

### 4.5 Reader

| ID | Case | Expected | Auto | Test |
|----|------|----------|------|------|
| RD-1 | Open file, render blocks | heading/paragraph/code/table/page render | ✅ | `RenderBlock.test.tsx` |
| RD-2 | HTML vs plain-text page | `is_html` toggles real DOM vs literal text | ✅ | `RenderBlock.test.tsx` |
| RD-3 | Outline tab (TOC) | headings listed; non-headings filtered | ✅ | `OutlineTab.test.tsx` |
| RD-4 | Image-dominant PDF page | rendered as composited raster, not a black box | ✅ | `test_pdf_raster.py` |
| RD-5 | Highlight/mark text | needle wrapped in `<mark>` | ✅ | `markText.test.tsx` |
| RD-6 | Page navigation | next/prev within bounds | ✅ | `pageStep.test.ts` |
| RD-7 | Page-assistant stream | answers from page content; missing session → clean 404 | ✅ | reader stream eager-validates |

### 4.6 Chat

| ID | Case | Expected | Auto | Test |
|----|------|----------|------|------|
| CH-1 | Session create/list/messages | CRUD contract | ✅ | `test_chat_api_integration.py` |
| CH-2 | Send "hi" → streamed reply | tokens + one `done`, assistant bubble | ✅ | `test_chat_api_integration.py`, real-backend E2E |
| CH-3 | Missing session → clean 404 | NOT a mid-stream drop | ✅ | `test_chat_api_integration.py` |
| CH-4 | LLM failure → error event | typed error, not dropped connection | ✅ | `test_chat.py`, integration |
| CH-5 | **Chat with a KB selected** | hybrid retrieval; degrades to FTS5 if numpy/faiss absent (packaged) | ✅ | `test_chat.py`, `test_chat_api_integration.py` |
| CH-6 | **Web search grounding** | model uses live web results; never "no real-time access" | ✅ prompt guard | `test_chat.py::*web_grounding*` + 🧪 real-model smoke |
| CH-7 | Wikipedia source | fetches article, answers from it | 🧪 | manual |
| CH-8 | Attach file as context | extracted text used in answer | ✅ | `e2e/real-backend/attach-upload.spec.ts` |
| CH-9 | Sources panel | KB citations + web sources render | ✅ | `e2e/chat.spec.ts` |
| CH-10 | Export session as markdown | downloads transcript | ✅ | `test_chat.py` |
| CH-11 | Streaming transient → self-heal | connection blip retries; clear message on hard fail | ✅ | `sseStream.test.ts` |

### 4.7 Learn

| ID | Case | Expected | Auto | Test |
|----|------|----------|------|------|
| LN-1 | All formats stream to `done` | quiz/flashcard/mindmap/timeline/story/eli5/speedlearn/brainstorm/guided/animated | ✅ | `test_learn_api_integration.py` |
| LN-2 | **Schema ↔ domain format parity** | every API-accepted format is valid in domain (no mid-stream drop) | ✅ | `TestFormatSourcesOfTruthAgree` |
| LN-3 | **Animated** renders a scene | SVG ScenePlayer shows scene; no "network error" | ✅ | real-backend E2E + `ScenePlayer.test.tsx` |
| LN-4 | Guided lesson | step-by-step with quiz checks | ✅ | `GuidedViewer.test.tsx`, integration |
| LN-5 | Invalid format/difficulty | clean 422 (eager validation), not a drop | ✅ | `test_learn_api_integration.py` |
| LN-6 | Source: topic/web/wikipedia/upload/library | content fetched per source | 🧪 / ⏳ | partial |
| LN-7 | Gamification (XP, level, streak, badges) | awarded on completion | ✅ | `test_learn.py`, `ProgressPage.test.tsx` |
| LN-8 | Multilingual generation | respects `language` | ✅ | `test_learn_multilingual.py` |
| LN-9 | Cinematic (Manim) pack | install on demand → render MP4 | 🧪 | manual (model-dependent) |
| LN-10 | Malformed LLM JSON repair | repairs unescaped quotes / truncation / structural breaks | ✅ | `TestUnescapedInnerQuoteRepair`, `TestStructuralJsonRepair` |

### 4.8 Search

| ID | Case | Expected | Auto | Test |
|----|------|----------|------|------|
| SR-1 | Multi-engine blended search | DuckDuckGo/Serper/Brave fuse results | ✅ | `test_search_multiengine.py` |
| SR-2 | Web results reach the prompt | results injected as context | ✅ | `test_chat.py` (web_context) |
| SR-3 | News query returns current headlines | live snippets (non-deterministic) | 🧪 | manual smoke |

---

## 5. Cross-cutting / non-functional

| ID | Case | Expected | Auto |
|----|------|----------|------|
| NF-1 | No secrets in repo/CI | API keys never committed; CI uses fake LLM | ✅ (design) |
| NF-2 | Every streaming endpoint validates eagerly | no raise after 200 → no dropped connection | ✅ (audit + integration tests) |
| NF-3 | Optional deps absent → graceful degrade | numpy/faiss/torch missing → fallback, no crash | ✅ (chat FTS fallback test) |
| NF-4 | Error UX distinguishes causes | connect vs HTTP vs mid-stream → distinct messages | ✅ | `sseStream.test.ts` |

---

## 6. Manual / model-dependent checks (run before each release)

These can't be fully automated (need a real LLM/network or human judgement):

- **CH-6 Web grounding smoke:** with a real model + Web on, ask "latest news today" →
  must answer from the returned headlines, not refuse.
- **LN-9 Cinematic quality:** generate a Manim lesson with a strong model → renders a
  coherent MP4.
- **SE-4 Test Connection** with a real key per provider.
- **KB-9 Hindi OCR** on a Devanagari PDF.
- **LC-1/4, AU-*, KB-4** packaged-app smoke (install, launch, update, drag-drop).

---

## 7. Release regression checklist (copy into each release PR)

```
[ ] New/changed behaviour has a test case in docs/qa/test-plan.md
[ ] Bug fixes have a test that FAILED before the fix
[ ] pytest tests/ -v ............................... green
[ ] ruff check backend/ tests/ .................... clean
[ ] cd frontend && npm test ....................... green
[ ] cd frontend && npm run build .................. green
[ ] cd desktop && node --test ..................... green
[ ] npm run test:e2e:real ......................... green
[ ] npm run test:e2e (mocked) ..................... green
[ ] Manual/model-dependent checks (§6) ............ done
[ ] Version bumped in ALL files (CLAUDE.md list)
[ ] CHANGELOG entry written
[ ] Known Issues table updated (if a bug was fixed)
```

---

## 8. Known fragile areas (watch list)

- **Model compliance** (web grounding, JSON shape, Manim) — prompt-dependent; keep
  manual smokes.
- **Packaged-only paths** — anything gated on bundled deps or `window.knovex`.
- **Auto-update + NSIS** — only observable after a full build+install.
- **Web search quality** — DuckDuckGo (free) is non-deterministic; thin snippets.
- **Packaging download flakiness** — electron-builder fetches helper binaries from
  GitHub's CDN at build time; a transient 504 can fail a release job. Mitigated by
  `scripts/retry.sh` (3 attempts, linear backoff) wrapping each package step.
  If it still fails, re-run the failed job (`gh run rerun <id> --failed`).
- **System tray** (minimise/restore/quit) — not reliably automatable via Playwright;
  remains a manual smoke. Window-state *logic* is unit-tested (LC-7).
