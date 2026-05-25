# Changelog

All notable changes to **Knovex** are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

*Planned — Sprint 6+*

### Sprint 6 — Learn Mode
- Full Settings page (LLM provider, model, key, theme, storage path)
- Ollama auto-detect + connection test
- PyInstaller backend bundling
- electron-builder desktop packaging (Windows .exe / macOS .dmg / Linux .AppImage)

### Sprint 6 — Learn Mode
- Quiz, flashcard, mind map, story, timeline, ELI5, speed-learn, brainstorm
- Gamification: XP, streaks, badges
- Web search enrichment for topics

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

[Unreleased]: https://github.com/tailorgunjan93/knovex/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/tailorgunjan93/knovex/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/tailorgunjan93/knovex/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/tailorgunjan93/knovex/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/tailorgunjan93/knovex/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tailorgunjan93/knovex/releases/tag/v0.1.0
