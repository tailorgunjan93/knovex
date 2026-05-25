# Changelog

All notable changes to **Knovex** are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

---

## [0.7.2] — 2026-05-25

### Fixed

- **macOS CI verification script crash** — `shopt -s globstar` is only available in
  bash 4+; macOS runners ship bash 3.2. The `Verify installer artifact exists` step now
  uses `find` instead of bash glob expansion, making it portable across all platforms.

---

## [0.7.1] — 2026-05-25

### Fixed

- **Backend binary missing from installer (root cause fix)** — `docnest-ai>=0.6.0` was listed
  in `requirements.txt`, which transitively depends on `docling>=2.0`. `docling` pulls in
  `torch`, `transformers`, `onnxruntime`, and other large ML packages (several GB combined),
  causing the CI `pip install` step to time out before PyInstaller ever ran. When PyInstaller
  does not run, `backend/dist/knovex-backend/` is never produced, `extraResources` has nothing
  to copy, and the installer ships without any backend binary.
  Removed `docnest-ai` from `requirements.txt` — it is imported lazily and both call sites
  (`UDFParser.parse()` for `.udf` files and the `/health` version string) have graceful
  fallbacks. All other formats (PDF, DOCX, TXT, MD, CSV) are unaffected.
- **CI binary verification step** — `package.yml` now runs `Verify backend binary exists`
  immediately after PyInstaller, explicitly failing the build if the binary is absent.
  Also added `Verify installer artifact exists` before the upload step, and changed
  `if-no-files-found` from `warn` to `error` so missing installers fail CI loudly
  instead of silently producing a broken release.

---

## [0.7.0] — 2026-05-25

### Changed

- **App icon redesign** — replaced the plain purple square with a new copper-gradient K icon
  that matches the download page brand aesthetic: warm near-black rounded-square background
  (`#0C0B0E`) with a copper gradient letterform (top `#E4AE58` to bottom `#986428`).
  Applies to both the installer / dock icon (512x512) and the system tray icon (32x32).
- **Icon generation script** (`scripts/gen_icon.py`) — pure Python stdlib generator
  (no Pillow required) using raw PNG chunk encoding and distance-to-segment math for
  anti-aliased K letterform rendering.

---

## [0.6.9] — 2026-05-25

### Fixed

- **Backend binary missing from installer (ENOENT on launch)** — `onnxruntime` (100+ MB),
  `tokenizers`, and `numpy` were listed in `requirements.txt`, causing the PyInstaller
  CI build step to time out or fail. When PyInstaller fails, `backend/dist/knovex-backend/`
  is never produced, so `extraResources` copies nothing and the installer ships with no
  backend binary at all. Removed all three from `requirements.txt`; they are runtime-optional
  (only needed after the user downloads the ONNX model via Settings → Embedding).
- **Pre-flight binary check in Electron** — `spawnBackend()` now calls `fs.existsSync()`
  on the executable path before attempting to spawn. If the binary is missing, shows an
  actionable error dialog with the exact path, `process.resourcesPath`, and a download link
  instead of 40 silent health-check attempts followed by a generic "did not start" message.
- Also logs `process.resourcesPath` and `__dirname` at startup for path diagnostics.

---

## [0.6.8] — 2026-05-25

### Fixed

- **Windows SmartScreen "Don't run" / "Unrecognised app" popup** — changed NSIS installer
  from machine-wide (`allowElevation: true`) to per-user install (`perMachine: false`,
  `allowElevation: false`). Requesting admin elevation is the main trigger for SmartScreen
  on unsigned executables; per-user installs are treated with less suspicion.
- **Download page** — added a collapsible `<details>` callout "Windows says Don't run?"
  directly below the Windows download button with step-by-step instructions:
  (1) browser download bar → Keep → Keep anyway,
  (2) SmartScreen popup → More info → Run anyway.

---

## [0.6.7] — 2026-05-25

### Fixed

- **Backend fails to start after installation** — removed `onnxruntime`, `onnxruntime.capi`,
  `tokenizers`, and `numpy` from PyInstaller `hiddenimports`. These packages are only
  imported lazily inside `ONNXEmbedder._load()` (called only when dense embeddings are
  actually run). Bundling their native Windows DLLs as hiddenimports caused load-order
  conflicts that crashed the backend binary at boot time on Windows.
- **`tokenizers` listed in both `hiddenimports` and `excludes`** — `excludes` silently
  won, causing a broken dependency chain during PyInstaller analysis. Removed from both;
  the package is optional at runtime (app falls back to FTS5-only via `NullEmbedder`).
- **Backend crash details invisible to user** — `stdio: 'pipe'` was silently discarding
  backend stdout/stderr. Now piped to `userData/backend.log` (appended on every launch).
  The error dialog now shows the last 10 stderr lines and the log file path so crashes
  are diagnosable without a debugger.

---

## [0.6.6] — 2026-05-25

Sprint 7 — Semantic Search · Copper Theme · Auto-update

### Added

#### Backend — Embedding layer (Sprint 7)
- **`backend/adapters/embedder.py`** — `IEmbedder` ABC + three implementations
  - `OpenAIEmbedder` — calls `text-embedding-3-small` via httpx (batched, up to 96 texts per request)
  - `ONNXEmbedder` — local `all-MiniLM-L6-v2` via onnxruntime; lazy-loaded, mean-pooled + L2-normalised (384-dim)
  - `NullEmbedder` — silent no-op fallback; retrieval degrades gracefully to FTS5-only
  - `build_embedder(api_key, provider, model)` factory: OpenAI key → OpenAI; local model ready → ONNX; else Null
  - `model_files_ready()`, `download_model(progress_cb)`, `_download_file()` — stdlib urllib download with 64 KB streaming + progress hook
- **`backend/api/setup.py`** — first-launch model download endpoints
  - `GET  /api/setup/models/status` → `{ready, model_name, size_bytes, path}`
  - `POST /api/setup/models/download` → SSE stream: `progress` / `done` / `error` events
  - Async bridge: blocking download runs in `run_in_executor`, progress pushed via `asyncio.Queue`
- **`backend/models/schemas.py`** — `EmbeddingSettings` model (`provider`, `model`, `api_key`); added `embedding` field to `AppSettingsResponse` and `AppSettingsUpdate`
- **`backend/core/settings_service.py`** — `embedding.api_key` added to `SENSITIVE_FIELDS`; embedding defaults wired into `_default_settings()`
- **`backend/requirements.txt`** — added `onnxruntime>=1.17`, `tokenizers>=0.19`, `numpy>=1.26`
- **`backend/knovex-backend.spec`** — `backend.api.setup`, `backend.adapters.embedder`, `onnxruntime`, `tokenizers`, `numpy` added to `hiddenimports`

#### Frontend — Embedding settings UI
- **`frontend/src/api/settings.api.ts`** — `EmbeddingSettings` interface + `embedding` field in `AppSettings` and update patch type
- **`frontend/src/api/setup.api.ts`** — `setupApi.getModelStatus()` and `setupApi.downloadModel(onProgress, signal)` via SSE fetch
- **`frontend/src/pages/Settings/LLMSettings.tsx`** — Embeddings section:
  - Provider toggle (Local ONNX / OpenAI API)
  - Optional masked OpenAI embedding API key field with show/hide toggle
  - Local model status card: file size, path, `LinearProgress` download bar, cancel button
  - "Save Embedding Settings" button

#### Desktop — Auto-update
- **`desktop/main.js`** — `electron-updater` wired up (production only, 8 s startup delay)
  - `autoDownload = true` — new releases download silently in background
  - `update-downloaded` → sends `app:update-downloaded` IPC to renderer with `{version, releaseNotes}`
  - `app:install-update` IPC handler → `autoUpdater.quitAndInstall()`
  - Download progress forwarded to renderer via `app:update-progress`
- **`desktop/preload.js`** — exposes `onUpdateDownloaded`, `onUpdateProgress`, `installUpdate` on `window.knovex`
- **`frontend/src/types/electron.d.ts`** — TypeScript declarations for all three update APIs
- **`frontend/src/components/Layout/AppShell.tsx`** — copper top banner with "Restart now" button + dismiss; uses MUI `Collapse` for slide-in/out

#### Design — Copper warm-dark theme
- **`frontend/src/theme/index.ts`** — complete theme rewrite
  - Accent: `#C8924A` (copper — `oklch(0.78 0.13 60)` match) replacing violet `#7C3AED`
  - Dark: `#0B0B0C` bg / `#111114` paper / `#F5F1EA` warm off-white text
  - Light: `#F5F1EA` bg / `#EFEAE0` paper / `#14120E` text (warm parchment)
  - Medium: `#E7E1D5` bg / `#DDD7CB` paper
  - Font: **Geist** + Geist Mono (matches the download page)
  - `action.hover/selected/focus` tokens use copper alpha — all components inherit automatically
- **`frontend/index.html`** — Geist + Geist Mono loaded from Google Fonts
- **`frontend/src/components/Layout/Sidebar.tsx`** — active background now uses `theme.palette.action.selected` (theme-aware, no hardcoded colour)
- **`desktop/main.js`** — `backgroundColor` updated to `#0B0B0C`

#### Download page
- **`docs/index.html`** — full redesign matching Claude Design aesthetic:
  - Geist fonts, copper `oklch` accent, `html[data-theme]` light/dark, conic-gradient K brand mark
  - Stats strip, 3×3 features grid, v0.6.6 download URLs, copy buttons, reveal animations
- **`docs/tweaks-panel.jsx`** — React Tweaks Panel with 5 accent presets + PostMessage protocol

### Changed
- `desktop/package.json` — version `0.6.6`
- `frontend/package.json` — version `0.6.6`
- `backend/core/config.py` — `version = "0.6.6"`

---

## [0.6.0] — 2026-05-25

Sprint 6 — Learn Mode + Encryption Verification

### Added

#### Backend — Learn Mode domain + service
- **`backend/core/domain/learn.py`** — pure domain entities
  - `LearnSession` dataclass: id, topic, format, source_type, difficulty, status, content, created_at, completed_at
  - `UserStats` dataclass with XP, level, streak, last_activity, badges
  - `VALID_FORMATS = {"quiz","flashcard","mindmap","timeline","story","eli5","speedlearn","brainstorm"}`
  - `VALID_DIFFICULTIES = {"beginner","intermediate","expert"}`
  - `xp_to_level()` / `xp_for_next_level()` based on `_LEVEL_XP = [0,100,250,500,1000,2000,4000,7500,12500,20000]`
  - XP constants: SESSION_COMPLETE=10, QUIZ_CORRECT=5, QUIZ_PERFECT=20, FLASHCARD_DECK=15, STREAK_BONUS=5
- **`backend/storage/repositories/learn_repository.py`**
  - `ILearnRepository(SQLiteRepository[LearnSession])` — abstract interface (DIP)
  - `SQLiteLearnRepository` — UPSERT-based session persistence; `user_stats` singleton (id=1)
  - `get_user_stats()`, `save_user_stats()`, `find_sessions(limit)` implementations
- **`backend/core/learn_service.py`** — `LearnService` facade (SRP + Strategy pattern)
  - `stream_session()` — SSE async generator for all 8 formats
    - Text formats (story/eli5/speedlearn/brainstorm): real-time token streaming via `LLMService.stream()`
    - JSON formats (quiz/flashcard/mindmap/timeline): `LLMService.complete()` → parse → stream as 40-char chunks
  - `submit_quiz_answer()` — correctness check, XP award, quiz_master badge
  - `review_flashcard()` — spaced repetition intervals `{again:1, hard:2, good:4, easy:7}` days
  - `_award_session_xp()` — base XP + flashcard bonus + streak bonus + 10 badge checks
  - `_SYSTEM_PROMPTS` dict with tailored prompts for all 8 formats (OCP: new format = add entry)
  - `_strip_code_fences()` — strips ` ```json...``` ` wrappers from LLM JSON output

#### Backend — API + wiring
- **`backend/api/learn.py`** — Learn Mode API router
  - `POST /api/learn/sessions/stream` — create session + SSE stream content
  - `GET  /api/learn/sessions` — list 50 most recent sessions
  - `GET  /api/learn/sessions/{id}` — get session by ID
  - `DELETE /api/learn/sessions/{id}` — delete session
  - `POST /api/learn/sessions/{id}/quiz/answer` — submit quiz answer (returns correctness, XP, explanation)
  - `POST /api/learn/sessions/{id}/flashcard/review` — rate flashcard (returns next_review_at)
  - `GET  /api/learn/stats` — get user gamification stats
- **`backend/core/dependencies.py`** — added `get_learn_service()` factory + `LearnServiceDep` annotated type
- **`backend/main.py`** — registered learn router under `/api` with `tags=["learn"]`

#### Frontend — Learn Mode UI
- **`frontend/src/api/learn.api.ts`** — fully typed Learn API client
  - Typed interfaces for all 8 content shapes: `QuizContent`, `FlashcardContent`, `MindmapContent`, `TimelineContent`, `TextContent`
  - `learnApi.streamSession()` — SSE stream via `fetch` + `ReadableStream`
  - `learnApi.submitQuizAnswer()`, `reviewFlashcard()`, `getUserStats()`, CRUD operations
- **`frontend/src/pages/Learn/index.tsx`** — full Learn Mode page (replaces placeholder)
  - Left sidebar: `StatsBar` (XP progress, level, streak), badge chips, session history with format icons
  - Header controls: topic input + 8-format Chip selector + difficulty Chip selector + Generate/Stop buttons
  - **QuizView**: interactive MCQ with per-question answer checking, colour-coded options (green=correct, red=wrong), explanation reveal, +XP toast
  - **FlashcardView**: flip animation, spaced-repetition rating buttons (again/hard/good/easy), progress dots, navigation
  - **MindmapView**: collapsible hierarchical tree with depth-coloured nodes
  - **TimelineView**: vertical spine with year badges and event descriptions
  - **TextContentView**: streamed Markdown rendered with `react-markdown`; blinking cursor during stream
  - XP + badge notification alert with auto-dismiss
  - Session history load: click any past session to reload its content

#### Frontend — Settings encryption indicator
- **`frontend/src/pages/Settings/LLMSettings.tsx`** — added `LockIcon` encryption notice below action buttons
  - Displays: "API keys are encrypted at rest using Fernet symmetric encryption. Key stored in `~/.config/Knovex/.knovex.key`, readable only by your OS user."

#### Tests — Sprint 6
- **`tests/test_encryption.py`** — 25 tests proving encryption works end-to-end
  - `TestFernetEncryptor`: roundtrip, token uniqueness, empty-string handling, invalid token, key file creation, key persistence across "restarts", cross-key incompatibility
  - `TestNullEncryptor`: passthrough behaviour
  - `TestSettingsServiceEncryption`: `llm.api_key` stored as Fernet token in raw store, `search.api_key` encrypted, non-sensitive fields plaintext, get_masked() returns `****`, no double-encrypt, empty key → empty storage
- **`tests/test_learn.py`** — 41 tests for LearnService
  - `InMemoryLearnRepository` stub (no SQLite)
  - Text format streaming: token events, done event, session saved as ready, content field
  - JSON format streaming: tokens reassembled to valid JSON, session content saved, mindmap round-trip
  - Validation: invalid format raises ValueError, invalid difficulty raises ValueError
  - LLM error: yields SSE error event, saves session as error
  - Quiz: correct/wrong answer, XP, explanation, out-of-range index, non-quiz session, missing session
  - Flashcard: all 4 ease ratings + correct `next_review_at`, good/easy awards XP, again awards none
  - Session CRUD: list empty, get not-found, session created during stream, delete
  - Gamification: stats defaults, XP earned after session, XP in done event, first_step badge
- **`tests/test_imports.py`** — 7 new Sprint 6 smoke tests (learn domain, service, repository, encryption, routes, schemas), version assertion updated to `0.6.0`

### Changed
- `backend/core/config.py` — `version = "0.6.0"`
- `frontend/package.json` — `version = "0.6.0"`
- `desktop/package.json` — `version = "0.6.0"`
- `backend/main.py` — version comment updated to `0.6.0`

### Test summary
158 tests — 158 passed (includes all sprints 1–6)

---

## [0.5.0] — 2026-05-25

Sprint 5 — Settings UI + Desktop Packaging

### Added

#### Frontend — Settings UI (complete)
- **LLM Settings tab** (`frontend/src/pages/Settings/LLMSettings.tsx`)
  - Provider dropdown: OpenAI, Anthropic, Groq, Gemini, Cerebras, AWS Bedrock, Ollama
  - Dynamic model selector — fetches live model catalogue per provider via `GET /api/settings/llm/models`
  - Masked API key field with show/hide toggle; leave blank to keep existing key
  - AWS Bedrock fields: region, access key ID, secret access key
  - Ollama base URL field + **Auto-Detect Ollama** button (`RadarIcon`)
    - Probes `localhost:11434`, displays found model count + URL
    - Populates detected-models dropdown and auto-fills base URL on success
  - "Test Connection" button — saves settings first, then calls `POST /api/settings/test-llm`
  - Connection result shown as success/error Alert with latency (ms)
- **Search Settings tab** (`frontend/src/pages/Settings/SearchSettings.tsx`)
  - Engine selector: DuckDuckGo (free), Serper (Google), Brave
  - Conditional API key field (shown only when engine requires a key)
  - Leave blank to keep existing key
- **App Settings tab** (`frontend/src/pages/Settings/AppSettings.tsx`)
  - Theme toggle: Light / Medium / Dark (auto-saves on click, propagates via Zustand)
  - KB Storage Path field with native OS **folder picker** button (uses `window.knovex.openFolderPicker()`)
  - Save path mutation with success/error Alert
  - About section: real app version from `window.knovex.appVersion()` (Electron IPC), Changelog link
- **Settings page shell** (`frontend/src/pages/Settings/index.tsx`)
  - Vertical tab layout (LLM / Search / App) with icons
  - Full-page loading skeleton + error state if backend is down

#### Frontend — Electron IPC wiring
- **AppShell** (`frontend/src/components/Layout/AppShell.tsx`)
  - Wires `window.knovex.onNavigate(route)` so tray "Settings" click navigates React Router
- **`electron.d.ts`** — added `onNavigate: (callback) => () => void` type declaration

#### Desktop — Electron improvements (`desktop/main.js`)
- **Window state persistence** — bounds (width, height, x, y) saved to `userData/window-state.json`
  - Loaded on startup; validated against minimum dimensions before use
  - Saved on every `resize` / `move` event and on `close`
  - Pure JSON (no electron-store dependency — works in packaged build without ESM issues)
- **Preload** — `onNavigate` IPC handler exposed via contextBridge
- **desktop/package.json** — version bumped to 0.5.0

#### Packaging

##### PyInstaller (`backend/knovex-backend.spec`)
- Builds a self-contained `knovex-backend/` folder (`COLLECT` mode, not one-file)
- Entry point: `backend/backend_entry.py`
  - Calls `multiprocessing.freeze_support()` first (required on Windows)
  - Patches `sys.path` for `sys._MEIPASS` when frozen
  - Starts uvicorn on `localhost:8765`
- All 7 LLM providers listed as `hiddenimports` (dynamic registration via decorators)
- All API routers listed explicitly
- Large dev/ML packages excluded (pytest, ruff, pandas, PIL, tkinter, …)
- UPX compression enabled (~35% size reduction)

##### electron-builder (`desktop/package.json`)
- `appId: io.knovex.app`, `productName: Knovex`
- Windows: NSIS installer (`.exe`)
- macOS: DMG disk image (`.dmg`)
- Linux: AppImage (`.AppImage`)
- `extraResources`: copies `backend/dist/knovex-backend/` into `resources/backend/`
- `files`: bundles `main.js`, `preload.js`, `../frontend/dist/**`

##### Build scripts
- **`scripts/build.ps1`** (Windows PowerShell) — 6-step pipeline:
  1. Verify venv; 2. Lint (ruff); 3. Tests (pytest); 4. Frontend (Vite);
  5. Backend binary (PyInstaller); 6. Installer (electron-builder)
  - Flags: `-SkipTests`, `-SkipFrontend`, `-SkipPackaging`
- **`scripts/build.sh`** (macOS / Linux bash) — same 6 steps
  - Flags: `--skip-tests`, `--skip-frontend`, `--skip-packaging`

#### CI/CD
- **`.github/workflows/package.yml`** — new "Package" workflow
  - Triggers on `v*.*.*` tag push
  - Matrix strategy: `windows-latest`, `macos-latest`, `ubuntu-latest`
  - Each runner: PyInstaller → Vite build → electron-builder
  - Uploads `.exe` / `.dmg` / `.AppImage` as workflow artifacts
  - Final job downloads all artifacts and attaches them to the GitHub Release
  - Code-signing secrets optional (unsigned builds work without them)

---

## [0.4.0] — 2026-05-24

Sprint 4 — Chat + Summarizer + Web Search

### Added

#### Backend — Chat
- **`ChatSession` + `ChatMessage`** domain entities (`backend/core/domain/chat.py`)
  - `ChatSession.rename(title)` — validates blank title, updates `updated_at`
  - `ChatSession.touch()` — bumps `updated_at` after each assistant reply
- **`IChatRepository`** + **`SQLiteChatRepository`** (`backend/storage/repositories/chat_repository.py`)
  - Session CRUD: `find_by_id`, `find_all`, `find_sessions_by_kb`, `save`, `delete`
  - Message CRUD: `find_messages`, `save_message`, `delete_message`
  - UPSERT with `ON CONFLICT(id) DO UPDATE SET`
  - Left-join message count in all session queries
- **`ChatService`** (`backend/core/chat_service.py`) — Facade for all chat operations
  - `create_session(kb_id, title)`, `get_session(id)`, `list_sessions(kb_id?)`, `rename_session`, `delete_session`
  - `get_messages(session_id)`, `export_session(session_id)` → Markdown string
  - `stream_message(...)` — streaming QA with full SSE protocol:
    - Step 1: persist user message
    - Step 2: FTS5 chunk retrieval with special-char sanitisation + sequential fallback
    - Step 3: optional web search augmentation
    - Step 4: emit `sources` / `web_sources` events before first token
    - Step 5: build prompt (system + history + KB/web context + question)
    - Step 6: stream LLM tokens, emit `token` events
    - Step 7: persist complete assistant message, emit `done` event
  - Constants: `_MAX_CONTEXT_CHUNKS=12`, `_MAX_CONTEXT_CHARS=8000`, `_MAX_HISTORY_MESSAGES=10`, `_MAX_WEB_RESULTS=4`
- **Chat API** (`backend/api/chat.py`) — 8 endpoints:
  - `POST /api/sessions` — create session
  - `GET  /api/sessions` — list all (or filter `?kb_id=`)
  - `GET  /api/sessions/{id}` — get single session
  - `PATCH /api/sessions/{id}` — rename session
  - `DELETE /api/sessions/{id}` — delete session
  - `GET  /api/sessions/{id}/messages` — message history
  - `POST /api/sessions/{id}/stream` — SSE streaming QA
  - `GET  /api/sessions/{id}/export` — Markdown export

#### Backend — Summarizer
- **`SummariserService`** (`backend/core/summarizer_service.py`)
  - `summarise_file(kb_id, file_id, length, ...)` — streams LLM summary of file chunks
  - `summarise_kb(kb_id, length, ...)` — streams LLM summary across all KB files
  - Length modes: `brief` (~150 words) and `detailed` (~600 words with bullets)
  - SSE protocol identical to Chat (`token` / `done` / `error`)
- **Summarizer API** (`backend/api/summarizer.py`):
  - `POST /api/summarize/file` — summarise a single file
  - `POST /api/summarize/kb` — summarise an entire KB

#### Backend — Web Search
- **`IWebSearchAdapter`** + adapters (`backend/adapters/web_search.py`)
  - `DuckDuckGoAdapter` — free, no API key, wraps `duckduckgo-search`
  - `SerperAdapter` — Google Search via `api.serper.dev`
  - `BraveAdapter` — Brave Search API
  - `StubWebSearchAdapter(results=[...])` — deterministic stub for tests
  - `get_search_adapter(engine)` factory with DuckDuckGo fallback
  - All third-party imports deferred (module importable without optional libs)
- **`SearchService`** (`backend/core/search_service.py`) — Facade over adapter layer
- **Search API** (`backend/api/search.py`) — `POST /api/search/web`

#### Backend — Dependencies & Wiring
- `get_chat_service()`, `get_summariser_service()`, `get_search_service()` added to `dependencies.py`
- `ChatServiceDep`, `SummariserServiceDep`, `SearchServiceDep` annotated shorthands
- Chat, summarizer, and search routers registered in `main.py`
- Version bumped to `0.4.0` in `AppConfig`

#### Frontend — Chat Page
- **Chat page** (`frontend/src/pages/Chat/index.tsx`) — full rewrite from placeholder
  - Left sidebar: session list (`SessionItem` with delete), "New Chat" button
  - Right panel: header, message thread, input bar
  - `MessageBubble` — user right-aligned, assistant left-aligned; KB citations as MUI `Chip`; web sources as `Link`
  - Token-by-token streaming with blinking cursor (`@keyframes blink` CSS animation)
  - Web search toggle (`ToggleButton` with `SearchIcon`)
  - `AbortController` in `abortRef` for stop mid-stream
  - Export to Markdown via `chatApi.exportSession()` + Blob download
  - `EmptyChat` — 4 suggested prompts that populate input field
  - `NoChatSelected` — empty state when no session is active

#### Frontend — Summarizer API
- **`summariserApi`** (`frontend/src/api/summarizer.api.ts`)
  - `streamFileSummary(kbId, fileId, length, onEvent, signal)` — SSE file summary
  - `streamKBSummary(kbId, length, onEvent, signal)` — SSE KB summary
  - Uses `fetch()` + `ReadableStream` (POST-based SSE, not `EventSource`)
  - `SummariseEvent` union type: `token | done | error`

#### Tests
- `tests/test_chat.py` — 30 ChatService + SearchService unit tests
  - `InMemoryChatRepository` — pure-Python stub, no SQLite
  - Session CRUD, rename validation, export Markdown
  - `stream_message`: token events, done event, sources/web-sources events, persistence, LLM error handling, missing session
  - `ChatSession` domain rules (rename / touch)
  - `SearchService` with `StubWebSearchAdapter`
- `tests/test_imports.py` — extended with 7 Sprint 4 smoke tests
  - Chat domain, web-search adapter, chat repository, sprint-4 services, all new routes

---

## [0.3.0] — 2026-05-24

Sprint 3 — File Reader + Inline Q&A

### Added

#### Backend
- **`ReaderService`** (`backend/core/reader_service.py`) — file rendering + Q&A service
  - `get_content(kb_id, file_id, page)` — renders file to `ContentBlock[]` with pagination
  - `ask(kb_id, file_id, req, ...)` — async generator yielding SSE tokens
  - Per-format renderers: `_render_txt`, `_render_md`, `_render_csv`, `_render_pdf`, `_render_docx`
  - PDF: one block per page; `page` param maps 1:1
  - TXT/MD/CSV/DOCX: 40 blocks per page (`_BLOCKS_PER_PAGE`)
  - Inline Q&A: fetches up to 20 chunks / 6 000 chars from the DB for context
  - SSE format: `data: {"token": "…"}\n\n` ending with `data: [DONE]\n\n`
- **`GET /api/kb/{kb_id}/files/{file_id}/content`** — paginated `FileContentResponse`
- **`POST /api/kb/{kb_id}/files/{file_id}/ask`** — SSE `StreamingResponse` for inline Q&A
- **`get_reader_service()`** + **`ReaderServiceDep`** wired in `dependencies.py`
- Reader router registered in `main.py`
- Version bumped to `0.3.0` in `AppConfig`

#### Frontend
- **`readerApi`** (`frontend/src/api/reader.api.ts`) — typed API client
  - `getContent(kbId, fileId, page)` → `FileContentResponse`
  - `askStream(kbId, fileId, question)` → async generator of string tokens (fetch + ReadableStream)
- **`FileViewer`** (`frontend/src/components/FileViewer/index.tsx`)
  - Renders all block types: `paragraph`, `heading`, `table_row`, `code`, `page`
  - Pagination toolbar (prev/next/page indicator) for multi-page files
  - Loading skeleton + error alert with retry
  - "Ask Q&A" toggle icon to show `InlineQA` sidebar
- **`InlineQA`** (`frontend/src/pages/KnowledgeBase/components/InlineQA.tsx`)
  - SSE-driven streaming chat sidebar
  - Token-by-token text rendering with blinking cursor
  - Abort/stop mid-stream with `AbortController`
  - Suggested starter questions in empty state
  - Message bubbles: user right-aligned, assistant left-aligned
- **`KBDetail`** updated — clicking a ready/stale file opens `FileViewer`
- **`FileRow`** updated — `onView` prop + "View" icon button; row is clickable when viewable

#### Tests
- `tests/__init__.py` — test package
- `tests/test_imports.py` — import smoke tests (all modules, app creation, route registration)
- `tests/test_adapters.py` — adapter unit tests (all stubs, anti-corruption layer check)
- `tests/test_reader.py` — `ReaderService` unit tests with stub adapters

#### CI/CD
- **`.github/workflows/ci.yml`** — runs on push/PR to main:
  - Python lint (`ruff`) + pytest with coverage
  - TypeScript type-check + frontend `npm run build`
- **`.github/workflows/release.yml`** — triggers on `v*.*.*` tags:
  - Re-runs full CI checks
  - Creates GitHub Release with CHANGELOG excerpt
- **`backend/requirements-dev.txt`** — `pytest`, `pytest-asyncio`, `pytest-cov`, `ruff`, `mypy`

---

## [0.2.0] — 2026-05-23

Sprint 2 — Knowledge Base + File Ingestion Pipeline + Adapter Layer

### Added

#### Anti-Corruption Adapter Layer
- **`backend/adapters/__init__.py`** — adapter layer documentation and architecture diagram
- **`backend/adapters/llm_client.py`** — `ILLMClient` interface + `LiteLLMAdapter` + `StubLLMClient`
  - All `litellm` imports deferred inside method bodies (never at module level)
- **`backend/adapters/http_client.py`** — `IHttpClient` interface + `HttpxAdapter` + `StubHttpClient`
  - `HttpResponse` frozen dataclass with `.ok` property and `.json()` method
  - All `httpx` imports deferred inside method bodies
- **`backend/adapters/document_parsers.py`** — `IPDFAdapter` + `IParagraphAdapter` interfaces
  - `PyMuPDFAdapter` — wraps `fitz` (PyMuPDF)
  - `PythonDocxAdapter` — wraps `python-docx`
  - `StubPDFAdapter` + `StubParagraphAdapter` for testing without native libs
  - All third-party imports deferred inside method bodies

#### Domain Layer
- **`backend/core/domain/kb.py`** — `KB` dataclass with `rename()`, `update_appearance()`, `touch()` methods
- **`backend/core/domain/file_record.py`** — `FileRecord` dataclass + `FileStatus` enum
  - State machine: `mark_ingesting()`, `mark_ready(chunk_count)`, `mark_stale()`, `mark_missing()`, `reset_for_reingest()`
  - `SUPPORTED_FORMATS = frozenset({"pdf", "docx", "txt", "md", "csv", "udf"})`

#### Database
- `chunks` table + `chunks_fts` FTS5 virtual table with 3 auto-sync triggers
- WAL mode enabled for concurrent reads during ingestion

#### Repositories
- **`IKBRepository`** + **`SQLiteKBRepository`** — KB CRUD with `ON CONFLICT` UPSERT
- **`IFileRepository`** + **`SQLiteFileRepository`** — file record CRUD + `update_status()` + `delete_chunks()`

#### Services
- **`IngestionService`** — Strategy pattern with `@register_parser` class decorator
  - `PlainTextParser` (txt/md), `CSVParser`, `PDFParser` (via `IPDFAdapter`), `DOCXParser` (via `IParagraphAdapter`), `UDFParser`
  - Async: parsing runs in thread pool via `run_in_executor`
- **`WatcherService`** — periodic scan for stale/missing tracked files
- **`KBService`** — Facade for all KB + file operations; fire-and-forget ingestion via `asyncio.create_task()`

#### Events
- `KBCreatedEvent`, `FileAddedEvent`, `FileIngestedEvent`, `FileStaleEvent`, `FileMissingEvent`, `FileErrorEvent`
- `EventBus.emit_typed()` for type-safe event dispatch

#### API
- 13 KB/file endpoints under `/api/kb` prefix
- `KBServiceDep` annotated dependency shorthand

#### Frontend
- `KnowledgeBase` page — list view with search, grid of KB cards
- `CreateKBDialog` — name + 6 color presets + 10 emoji icon presets + live preview
- `KBCard` — file count / size / chunk chips
- `KBDetail` — file list with 2s auto-poll during ingestion, file picker
- `FileRow` — status badge with `CircularProgress` for ingesting
- `ConfirmDialog`, `UpdatePathDialog` — generic utility modals

---

## [0.1.0] — 2026-05-22

Sprint 1 — Foundation

### Added

#### Backend
- FastAPI application with lifespan context, CORS middleware, global exception handler
- `AppConfig` via pydantic-settings with `KNOVEX_` env prefix + platformdirs
- Fernet encryption for API keys at rest (`IEncryptor` + `FernetEncryptor`)
- `ISettingsStore` + `JsonSettingsStore` — atomic JSON persistence
- `SettingsService` — read/update/mask settings
- `LLMService` with `stream()` + `complete()` + `test_connection()` + `get_models()`
- `LLMProvider` Template Method base + 7 provider implementations:
  `OpenAIProvider`, `AnthropicProvider`, `GroqProvider`, `GeminiProvider`,
  `CerebrasProvider`, `BedrockProvider`, `OllamaProvider`
- Self-registering provider factory via `@register_provider` decorator
- `EventBus` with typed event dispatch
- `SQLiteBackend` with WAL mode + FTS5
- `HealthResponse` endpoint with Ollama probe
- Settings CRUD endpoints (GET/PUT `/api/settings`, POST `/api/settings/test-llm`)
- Tools registry endpoint
- Ollama auto-detect endpoint + models endpoint
- FastAPI dependency injection wiring in `dependencies.py`

#### Frontend
- React 18 + TypeScript + MUI v6 project (Vite 6)
- App shell with responsive sidebar navigation (5 pages)
- Settings page — LLM provider/model/key fields, Ollama detect, connection test
- TanStack Query v5 + Zustand state management
- API client with Axios + error normalisation
- Light / Medium / Dark theme switching

#### Desktop
- Electron 33 shell with `contextBridge` + IPC
- System tray with show/hide/quit menu
- Electron file picker exposed via `window.knovex.openFilePicker()`
- Backend spawned from Electron main process
- Vite proxy to localhost:8765 for dev mode

#### Infrastructure
- `.gitignore` covering Python, Node, Electron, system files
- `docs/` — ARCHITECTURE.md, IMPLEMENTATION_PLAN.md, FEATURES.md, API_SPEC.md, TECH_STACK.md

---

## Links

[Unreleased]: https://github.com/tailorgunjan93/knovex/compare/v0.7.2...HEAD
[0.7.2]: https://github.com/tailorgunjan93/knovex/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/tailorgunjan93/knovex/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/tailorgunjan93/knovex/compare/v0.6.9...v0.7.0
[0.6.9]: https://github.com/tailorgunjan93/knovex/compare/v0.6.8...v0.6.9
[0.6.8]: https://github.com/tailorgunjan93/knovex/compare/v0.6.7...v0.6.8
[0.6.7]: https://github.com/tailorgunjan93/knovex/compare/v0.6.6...v0.6.7
[0.6.6]: https://github.com/tailorgunjan93/knovex/compare/v0.6.0...v0.6.6
[0.6.0]: https://github.com/tailorgunjan93/knovex/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/tailorgunjan93/knovex/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/tailorgunjan93/knovex/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/tailorgunjan93/knovex/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/tailorgunjan93/knovex/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tailorgunjan93/knovex/releases/tag/v0.1.0
