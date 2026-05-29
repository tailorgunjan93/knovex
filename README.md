<div align="center">

# Knovex

### AI-powered Desktop Knowledge Base

*Secure · Fast · Reliable · Cost-Effective*

[![Version](https://img.shields.io/badge/version-0.8.9-blue.svg)](CHANGELOG.md)
[![CI](https://github.com/tailorgunjan93/knovex/actions/workflows/ci.yml/badge.svg)](https://github.com/tailorgunjan93/knovex/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#)
[![Python](https://img.shields.io/badge/python-3.11+-green.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)
[![Powered by docnest](https://img.shields.io/badge/powered%20by-docnest--ai-purple.svg)](https://pypi.org/project/docnest-ai/)

**Knovex** is a local-first, AI-powered desktop knowledge base with an interactive learning engine.  
Drop in your documents, ask questions, summarise, search the web, and turn complex topics into animated, gamified learning sessions — all running on your machine.

Built on top of [docnest-ai](https://pypi.org/project/docnest-ai/) — a hybrid RAG engine with SQLite FTS5 + dense ANN + section-graph retrieval.

</div>

---

## Implemented Sprints

| Sprint | Feature | Status |
|--------|---------|--------|
| 1 | Foundation — FastAPI + React + Electron shell | ✅ v0.1.0 |
| 2 | Knowledge Base + File Ingestion + Adapter layer | ✅ v0.2.0 |
| 3 | File Reader + Inline Q&A | ✅ v0.3.0 |
| 4 | Chat + Summariser + Web Search | ✅ v0.4.0 |
| 5 | Settings UI + Desktop Packaging | ✅ v0.5.0 |
| 6 | Learn Mode + Encryption Verification | ✅ v0.6.0 |
| 7 | Semantic Search (ONNX/OpenAI embeddings) + Copper Theme + Auto-updater | ✅ v0.6.6 |
| 8 | Progress Page + GuidedViewer + KB Browser Upload + E2E Test Suite (61 tests) | ✅ v0.8.0 |

---

## What is Knovex?

Knovex runs completely **offline and local** — your files never leave your machine unless you explicitly enable web search or cloud sync.

- **Knowledge Base** — create named KBs, add files, read them inline, ask questions
- **Chat** — conversational QA over your KB with streaming responses and citations
- **Summariser** — summarise a file or an entire KB in one click
- **Web Search** — optionally extend answers with live web results (DuckDuckGo, Serper, Brave)
- **Learn Mode** — turn any PDF or web topic into quizzes, flashcards, mind maps, timelines and animated explainers
- **Multi-LLM** — bring your own API key for OpenAI, Claude, Groq, Gemini, Cerebras, AWS Bedrock, or run fully offline with Ollama
- **3 deployment modes** — Personal (own keys), Organisation (admin-managed keys), Self-hosted (enterprise Docker)

---

## Key Features

### 📁 Knowledge Base + File Reader *(v0.3.0)*
- Create multiple named knowledge bases with colours and emoji icons
- Add PDF, DOCX, TXT, MD, CSV, UDF files via file picker or Electron drag-drop
- Auto-ingestion powered by docnest (FTS5 + ANN indexing) — runs as a background task
- File watcher automatically detects stale or missing tracked files
- Click any indexed file → opens inline **FileViewer** with Q&A sidebar
- Pagination: 40 blocks/page for text formats; 1 page/block for PDF
- SSE streaming Q&A grounded in the file's indexed chunks
- Supported block types: `paragraph`, `heading`, `table_row`, `code`, `page`

### 💬 Chat + Summariser *(v0.4.0)*
- Conversational QA against a selected KB with streaming token-by-token responses
- Source citations — which file and section answered your question
- Persistent chat sessions with full message history
- Session sidebar with create, rename, delete, and export to Markdown
- Web search toggle per message (DuckDuckGo free / Serper / Brave)
- Summariser: brief (~150 words) or detailed (~600 words) of a file or entire KB
- Blinking cursor animation, AbortController stop mid-stream

### ✨ Learn Mode *(v0.6.0 – v0.8.0)*
- **9 formats**: Quiz (interactive MCQ), Flashcards (spaced repetition), Mind Map (collapsible tree), Timeline (chronological events), Story (narrative markdown), ELI5, Speed Learn (bullet summary), Brainstorm (creative connections), **Guided** (step-by-step walkthrough via GuidedViewer)
- **Gamification**: XP points, level progression (10 tiers), daily streaks, 10 achievement badges
- All formats stream via SSE — JSON formats via LLM + parse + re-stream, text formats real-time
- Per-question XP rewards in quiz mode; spaced-repetition interval scheduling for flashcards
- **Session history sidebar** — reload any past session and interact with it
- **Encrypted keys**: Fernet AES-128 symmetric encryption; key at `~/.config/Knovex/.knovex.key`; proven by 25 dedicated encryption tests

### 📊 Progress Page *(v0.8.0)*
- **4 stat cards**: Streak (fire trend, singular/plural days), XP (level badge, comma-formatted), Sessions (week-over-week delta), Active Days
- **Daily activity heatmap** — 26 weeks of session activity, colour-coded by intensity
- **Learning velocity chart** — sessions/week + active days/week dual-axis Recharts graph
- All data from live API; zero-state renders cleanly when no sessions exist yet

### ⚙️ Settings + Packaging *(v0.5.0)*
- LLM: OpenAI, Anthropic (Claude), Groq, Gemini, Cerebras, AWS Bedrock, Ollama
- Per-provider model selection from live catalogue; API key encrypted at rest with Fernet
- Ollama auto-detect button — probes localhost:11434, lists installed models
- Test Connection button with round-trip latency display
- Web search engine: DuckDuckGo (free) / Serper / Brave + conditional API key field
- Theme: Light / Medium / Dark (auto-applies without restart)
- KB storage path picker via native OS folder dialog
- **Desktop packaging**: PyInstaller backend binary + electron-builder installers
  - Windows `.exe` (NSIS), macOS `.dmg`, Linux `.AppImage`
  - Window state persistence (position + size saved across sessions)
  - Tray → Settings navigates React Router via IPC
- Build scripts: `scripts/build.ps1` (Windows) and `scripts/build.sh` (macOS/Linux)
- Package CI/CD workflow: builds all 3 platforms on tag push, attaches assets to GitHub Release

---

## Architecture

Knovex uses a **fully decoupled** frontend/backend architecture with SOLID compliance and the GoF adapter pattern for all third-party libraries.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DESKTOP SHELL  (Electron 33)                                               │
│  Spawns backend process, manages window lifecycle, tray, OS file dialogs    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  FRONTEND  (React 18 + MUI v6 + TypeScript + Vite 6)               │    │
│  │  KnowledgeBase · Chat · Learn Mode · Settings                       │    │
│  │  TanStack Query v5 (server state) · Zustand (UI state)             │    │
│  └───────────────────────────┬─────────────────────────────────────────┘    │
└──────────────────────────────│──────────────────────────────────────────────┘
                               │  REST + SSE  (localhost:8765)
┌──────────────────────────────▼──────────────────────────────────────────────┐
│  BACKEND  (FastAPI + Python 3.11)                                           │
│                                                                             │
│  API Routes                                                                 │
│  ├── /api/kb/**           KB CRUD + file management (13 endpoints)         │
│  ├── /api/kb/**/content   File content rendering (paginated blocks)         │
│  ├── /api/kb/**/ask       Inline Q&A SSE stream                            │
│  ├── /api/sessions/**     Chat session CRUD + SSE stream + export          │
│  ├── /api/summarize/**    File / KB summariser SSE stream                  │
│  ├── /api/search/web      Web search endpoint                              │
│  ├── /api/settings/**     LLM + search config                              │
│  └── /api/health          Liveness + Ollama probe                          │
│                                                                             │
│  Services (Facades)                                                         │
│  ├── KBService        KB CRUD + ingestion orchestration                    │
│  ├── ReaderService    File rendering + inline Q&A                          │
│  ├── ChatService      Session CRUD + FTS5 retrieval + SSE streaming        │
│  ├── SummariserService File / KB summariser (brief / detailed)             │
│  ├── SearchService    Web search facade (DDG / Serper / Brave)             │
│  ├── IngestionService Strategy-pattern file parsing → chunk storage        │
│  ├── LLMService       Unified LLM (stream / complete / test / models)      │
│  ├── SettingsService  Encrypted settings read/write                        │
│  └── WatcherService   Periodic stale/missing file scanner                  │
│                                                                             │
│  Anti-Corruption Adapters  (backend/adapters/)                             │
│  ├── ILLMClient / LiteLLMAdapter     — wraps litellm                       │
│  ├── IHttpClient / HttpxAdapter      — wraps httpx                         │
│  ├── IPDFAdapter / PyMuPDFAdapter    — wraps fitz (PyMuPDF)                │
│  ├── IParagraphAdapter / PythonDocxAdapter — wraps python-docx             │
│  └── IWebSearchAdapter / DDG/Serper/BraveAdapter — wraps search libs       │
│                                                                             │
│  Storage                                                                    │
│  └── SQLite (WAL mode) — kbs, files, chunks, chunks_fts (FTS5)             │
│                                                                             │
│  Events — in-process typed EventBus                                        │
│  └── KBCreated · FileAdded · FileIngested · FileStale · Missing · Error   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Design Patterns

| Pattern | Where |
|---------|-------|
| Adapter (GoF) | `backend/adapters/` — anti-corruption layer for all 3rd-party libs |
| Strategy | `IngestionService` parsers (`@register_parser` decorator) |
| Template Method | `LLMProvider.complete()` / `stream()` delegate to `ILLMClient` |
| Factory + Plugin | `LLMProviderFactory` + `@register_provider` self-registration |
| Repository | `IKBRepository`, `IFileRepository`, `IChatRepository` — abstract storage |
| Facade | `KBService`, `LLMService`, `ReaderService`, `ChatService`, `SummariserService`, `SearchService` |
| Observer | `EventBus.emit_typed()` — typed in-process events |
| Value Object | `ProviderCredentials`, `HttpResponse`, `PageContent`, `ParagraphContent` |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Desktop Shell | Electron 33 | Cross-platform window, tray, OS dialogs |
| Frontend | React 18 + TypeScript | UI components |
| UI Library | MUI v6 | Design system |
| State | Zustand + TanStack Query v5 | UI state + server state |
| Build | Vite 6 | Fast dev + bundling |
| Backend | FastAPI + Python 3.11 | REST API, SSE streaming, async |
| RAG Engine | docnest-ai | Hybrid FTS5 + ANN retrieval |
| LLM Bridge | LiteLLM (via adapter) | Unified multi-provider LLM |
| Database | SQLite + FTS5 | Local storage, full-text search |
| Web Search | duckduckgo-search / Serper / Brave | Live web results |
| Encryption | cryptography (Fernet) | API key encryption at rest |
| Packaging | PyInstaller + electron-builder | Distributable app |
| E2E Testing | Playwright | Browser-driven end-to-end tests (61 tests) |

---

## Project Structure

```
knovex/
├── README.md
├── CHANGELOG.md
├── .gitignore
│
├── playwright.config.ts            Playwright E2E config (Vite dev server + Chromium)
├── e2e/
│   ├── learn.spec.ts               27 tests — Learn Mode visual + functional flows
│   └── progress.spec.ts            34 tests — Progress Page layout + data accuracy
│
├── .github/
│   └── workflows/
│       ├── ci.yml          Python lint + test + frontend build (push / PR)
│       ├── release.yml     GitHub Release on v* tag push
│       └── package.yml     Builds Win/macOS/Linux installers + attaches to release
│
├── scripts/
│   ├── build.ps1           Windows full build pipeline (lint → test → PyInstaller → NSIS)
│   └── build.sh            macOS / Linux build pipeline
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── FEATURES.md
│   ├── API_SPEC.md
│   └── TECH_STACK.md
│
├── backend/                            FastAPI Python — standalone API
│   ├── api/
│   │   ├── health.py                   GET /api/health
│   │   ├── settings.py                 GET|PUT /api/settings, test-llm, models, ollama
│   │   ├── kb.py                       13 KB + file endpoints
│   │   ├── reader.py                   GET /content, POST /ask (SSE)
│   │   ├── chat.py                     8 chat endpoints (sessions + stream + export)
│   │   ├── summarizer.py               POST /summarize/file, /summarize/kb
│   │   ├── search.py                   POST /search/web
│   │   └── tools.py                    Tool registry
│   ├── backend_entry.py                PyInstaller entry point (uvicorn bootstrap)
│   ├── knovex-backend.spec             PyInstaller build spec
│   ├── adapters/                       Anti-corruption layer ← ALL 3rd-party here
│   │   ├── llm_client.py               ILLMClient / LiteLLMAdapter / StubLLMClient
│   │   ├── http_client.py              IHttpClient / HttpxAdapter / StubHttpClient
│   │   ├── document_parsers.py         IPDFAdapter, IParagraphAdapter + stubs
│   │   └── web_search.py               IWebSearchAdapter / DDG / Serper / Brave / Stub
│   ├── core/
│   │   ├── domain/
│   │   │   ├── kb.py                   KB dataclass
│   │   │   ├── file_record.py          FileRecord + FileStatus
│   │   │   └── chat.py                 ChatSession + ChatMessage
│   │   ├── providers/                  7 LLM providers (self-registering)
│   │   ├── config.py                   AppConfig (pydantic-settings)
│   │   ├── dependencies.py             FastAPI DI wiring
│   │   ├── encryption.py               Fernet encryptor
│   │   ├── chat_service.py             Chat facade (session CRUD + streaming QA)
│   │   ├── ingestion_service.py        Strategy-based file parsing
│   │   ├── kb_service.py               KB facade
│   │   ├── llm_service.py              LLM facade
│   │   ├── reader_service.py           File rendering + inline Q&A
│   │   ├── search_service.py           Web search facade
│   │   ├── settings_service.py         Settings r/w
│   │   ├── settings_store.py           JSON persistence
│   │   ├── summarizer_service.py       File + KB summariser
│   │   └── watcher_service.py          Stale/missing file scanner
│   ├── events/
│   │   ├── bus.py                      EventBus singleton
│   │   └── types.py                    Typed event dataclasses
│   ├── models/
│   │   └── schemas.py                  All Pydantic request/response models
│   ├── storage/
│   │   ├── database.py                 SQLite schema + FTS5
│   │   ├── sqlite_backend.py           Async SQLite backend
│   │   └── repositories/
│   │       ├── base.py                 IRepository[T] + EntityNotFoundError
│   │       ├── chat_repository.py      IChatRepository + SQLiteChatRepository
│   │       ├── kb_repository.py        IKBRepository + SQLiteKBRepository
│   │       └── file_repository.py      IFileRepository + SQLiteFileRepository
│   ├── requirements.txt
│   ├── requirements-dev.txt            pytest, ruff, mypy, pytest-asyncio
│   └── main.py
│
├── frontend/                           React + TypeScript — pure UI consumer
│   └── src/
│       ├── api/
│       │   ├── client.ts               Axios instance
│       │   ├── kb.api.ts               KB + file endpoints
│       │   ├── reader.api.ts           Content + SSE ask stream
│       │   ├── settings.api.ts         Settings + LLM config
│       │   ├── chat.api.ts             Chat sessions + SSE stream + export
│       │   ├── summarizer.api.ts       SSE file / KB summarise
│       │   └── search.api.ts           Web search
│       ├── components/
│       │   ├── Layout/                 AppShell, Sidebar
│       │   └── FileViewer/             Block renderer + pagination
│       └── pages/
│           ├── KnowledgeBase/          KB list + detail + file viewer + inline Q&A
│           ├── Chat/                   Session sidebar + streaming message thread
│           ├── Learn/                  9 formats + GuidedViewer + session history
│           ├── Progress/               Stats cards + heatmap + velocity chart
│           └── Settings/              LLM + Search + App + Embedding tabs
│
├── desktop/                            Electron — thin shell only
│   ├── main.js
│   ├── preload.js
│   └── package.json
│
└── tests/
    ├── __init__.py
    ├── test_imports.py                 Import smoke tests + route registration (all sprints)
    ├── test_adapters.py                Adapter unit tests (all stubs, no network)
    ├── test_reader.py                  ReaderService unit tests
    └── test_chat.py                    ChatService + SearchService unit tests
```

---

## Getting Started

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11+ | [python.org](https://python.org) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| npm | 10+ | bundled with Node.js |
| git | any | [git-scm.com](https://git-scm.com) |

### Backend Setup

```bash
# Clone the repo
git clone https://github.com/tailorgunjan93/knovex.git
cd knovex

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

# Install dependencies
pip install -r backend/requirements.txt

# Start the backend (auto-creates DB on first run)
uvicorn backend.main:app --host 127.0.0.1 --port 8765 --reload
```

API docs are available at **http://localhost:8765/api/docs** (Swagger UI).

### Frontend Setup

```bash
cd frontend
npm install
npm run dev      # Vite dev server on http://localhost:5173
```

The Vite proxy forwards all `/api/*` requests to `localhost:8765`.

### Run Tests

```bash
# Install dev dependencies
pip install -r backend/requirements-dev.txt

# Run all tests
pytest tests/ -v

# With coverage
pytest tests/ --cov=backend --cov-report=term-missing
```

### Run E2E Tests

```bash
# Install Playwright browsers (first time only)
npx playwright install chromium

# Run all 61 E2E tests (auto-starts Vite dev server)
npx playwright test

# Interactive UI mode
npx playwright test --ui

# Run a single spec
npx playwright test e2e/learn.spec.ts
```

E2E tests mock all `/api/*` calls via `page.route()` — no backend required.
Results in `playwright-report/`. Failures attach screenshot + trace.

### Lint

```bash
ruff check backend/ tests/
```

### Build Desktop App

**Windows** (PowerShell):
```powershell
.\scripts\build.ps1               # full pipeline → desktop/release/*.exe
.\scripts\build.ps1 -SkipTests   # faster (skip pytest)
```

**macOS / Linux** (bash):
```bash
./scripts/build.sh                # full pipeline → desktop/release/*.dmg / .AppImage
./scripts/build.sh --skip-tests  # faster
```

The script runs: lint → tests → Vite frontend build → PyInstaller backend binary → electron-builder installer.

---

## CI/CD

| Trigger | Workflow | Actions |
|---------|----------|---------|
| Push / PR to `main` | `ci.yml` | Python lint (ruff) + pytest + frontend TypeScript check + build |
| Push `v*.*.*` tag | `release.yml` | Runs CI, then creates a GitHub Release with CHANGELOG excerpt |
| Push `v*.*.*` tag | `package.yml` | Builds Win/macOS/Linux installers + attaches to GitHub Release |

To create a new release:

```bash
git tag v0.4.0
git push origin v0.4.0
```

---

## Roadmap

### Phase 1 — Desktop App *(current)*

- [x] Sprint 1 — Foundation (FastAPI + React + Electron shell) — `v0.1.0`
- [x] Sprint 2 — Knowledge Base + File Ingestion + Adapter layer — `v0.2.0`
- [x] Sprint 3 — File Reader + Inline Q&A — `v0.3.0`
- [x] Sprint 4 — Chat + Summariser + Web Search — `v0.4.0`
- [x] Sprint 5 — Settings UI + Desktop Packaging — `v0.5.0`
- [x] Sprint 6 — Learn Mode + Encryption Verification — `v0.6.0`
- [x] Sprint 7 — Semantic Search (ONNX/OpenAI) + Copper Theme + Auto-updater — `v0.6.6`
- [x] Sprint 8 — Progress Page + GuidedViewer + KB Browser Upload + E2E Test Suite (61 tests) — `v0.8.0`

### Phase 2 — Cloud + Organisation + Agentic *(future)*

- [ ] Knovex Cloud Portal (web admin — org key management, user management, analytics)
- [ ] 3 deployment modes: Personal / Organisation (portal) / Self-hosted (Docker)
- [ ] LangGraph agent orchestration
- [ ] Visual workflow builder
- [ ] Cloud deployment (Railway / AWS) — PostgreSQL on OUR infra, not user machines
- [ ] Web app + mobile app (React Native — same backend API)
- [ ] Team collaboration + shared KBs
- [ ] Plugin / connector marketplace
- [ ] Learn Mode: voice narration, social sharing, multiplayer sessions

---

## Documentation

| Document | Description |
|----------|-------------|
| [CHANGELOG.md](CHANGELOG.md) | Full version history with detailed change notes |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and design decisions |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Sprint plan with tasks and milestones |
| [docs/FEATURES.md](docs/FEATURES.md) | Complete feature specification |
| [docs/API_SPEC.md](docs/API_SPEC.md) | All API endpoints and data contracts |
| [docs/TECH_STACK.md](docs/TECH_STACK.md) | Technology choices and rationale |

---

## About

Built by [Gunjan Tailor](https://github.com/tailorgunjan93) on top of [docnest-ai](https://pypi.org/project/docnest-ai/).

*Secure · Fast · Reliable · Cost-Effective*
