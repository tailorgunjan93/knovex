# Changelog

All notable changes to **Knovex** are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

*Planned — Sprint 4+*

### Sprint 4 — Chat + Summarizer + Web Search
- Conversational QA over entire KB with source citations
- Streaming chat via SSE with TanStack Query
- Summarize a file or full KB (brief / detailed modes)
- Web search integration (DuckDuckGo / Serper / Brave)

### Sprint 5 — Settings UI + Packaging
- Full Settings page (LLM provider, model, key, theme, storage path)
- Ollama auto-detect + connection test
- PyInstaller backend bundling
- electron-builder desktop packaging (Windows .exe / macOS .dmg / Linux .AppImage)

### Sprint 6 — Learn Mode
- Quiz, flashcard, mind map, story, timeline, ELI5, speed-learn, brainstorm
- Gamification: XP, streaks, badges
- Web search enrichment for topics

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

[Unreleased]: https://github.com/tailorgunjan93/knovex/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/tailorgunjan93/knovex/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/tailorgunjan93/knovex/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tailorgunjan93/knovex/releases/tag/v0.1.0
