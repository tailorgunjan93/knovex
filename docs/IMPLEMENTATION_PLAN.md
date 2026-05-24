# Knovex — Implementation Plan

*Phase 1: Desktop App*

---

## Overview

| | |
|---|---|
| **Total Sprints** | 6 |
| **Estimated Duration** | 14 weeks |
| **Methodology** | Sprint-based, backend-first |
| **Stack** | FastAPI + React + Electron |
| **Target** | Cross-platform desktop app (.exe / .dmg / .deb) |

### Sprint Summary

| Sprint | Focus | Duration |
|--------|-------|----------|
| Sprint 1 | Foundation — scaffold, settings, shell | Week 1–2 |
| Sprint 2 | Knowledge Base — CRUD, ingestion, file watcher, hash detection | Week 3–4 |
| Sprint 3 | File Reader — render, inline Q&A | Week 5–6 |
| Sprint 4 | Chat + Summarizer + Web Search | Week 7–8 |
| Sprint 5 | Settings + polish + packaging + deployment modes | Week 9–10 |
| Sprint 6 | Learn Mode — interactive learning engine | Week 11–14 |

---

## Sprint 1 — Foundation

**Goal:** Working skeleton — Electron window opens, React loads, FastAPI responds, Settings page functional.

### Backend Tasks

| Task | Description | Priority |
|------|-------------|----------|
| B1.1 | FastAPI project scaffold | `backend/main.py`, routers, middleware, CORS | P0 |
| B1.2 | Settings service | Load/save app settings from encrypted local config file | P0 |
| B1.3 | Settings API | `GET /settings` `PUT /settings` `POST /settings/test-llm` `GET /settings/ollama/detect` | P0 |
| B1.4 | LLM service stub | LiteLLM wrapper — provider/model/key config, ping test | P0 |
| B1.5 | Health endpoint | `GET /health` — returns version + status | P0 |
| B1.6 | Storage layer | SQLite backend abstraction, create DB schema on startup | P0 |
| B1.7 | Event bus | In-process event bus (`emit`, `on`) | P1 |
| B1.8 | Tool registry skeleton | Register tools, discovery endpoint | P1 |
| B1.9 | Ollama auto-detect | Poll `localhost:11434` on startup, expose result via API | P1 |
| B1.10 | Error handling | Global exception handler, structured JSON errors | P0 |
| B1.11 | Logging | Structured logging with log file in app data dir | P1 |

### Frontend Tasks

| Task | Description | Priority |
|------|-------------|----------|
| F1.1 | React + Vite + TypeScript scaffold | `frontend/` setup with pnpm | P0 |
| F1.2 | MUI v6 theme system | Light / Medium / Dark themes with theme switcher | P0 |
| F1.3 | App layout | Sidebar + main content area + header | P0 |
| F1.4 | Routing | React Router v6 — `/kb`, `/chat`, `/learn`, `/settings` | P0 |
| F1.5 | Zustand store setup | `kb.store`, `chat.store`, `settings.store` | P0 |
| F1.6 | API client | Axios-based typed client pointing to `localhost:8765` | P0 |
| F1.7 | Settings page — LLM | Provider dropdown, model input, API key (masked), test button | P0 |
| F1.8 | Settings page — Search | Engine select, API key input | P1 |
| F1.9 | Settings page — Theme | Light / Medium / Dark switcher | P0 |
| F1.10 | Sidebar navigation | Icons + labels for KB, Chat, Learn, Settings | P0 |
| F1.11 | Error boundary | Global error display component | P1 |
| F1.12 | Loading states | Spinner / skeleton components | P1 |
| F1.13 | Toast notifications | Success / error / info notifications | P1 |

### Desktop (Electron) Tasks

| Task | Description | Priority |
|------|-------------|----------|
| E1.1 | Electron project scaffold | `desktop/` with `main.js`, `preload.js` | P0 |
| E1.2 | Spawn FastAPI backend | Child process on app start, kill on quit | P0 |
| E1.3 | Health check wait | Poll `/health` before opening window | P0 |
| E1.4 | BrowserWindow config | Size, min-size, title, icon | P0 |
| E1.5 | Dev mode setup | Load Vite dev server in dev, load `dist/` in prod | P0 |
| E1.6 | System tray | Tray icon, show/hide, quit | P1 |
| E1.7 | Context bridge | Expose file dialog API to renderer | P1 |

### Milestone S1
- [ ] `GET /health` returns `{ status: "ok", version: "0.1.0" }`
- [ ] Electron opens window, React app loads
- [ ] Settings page renders, theme switching works
- [ ] LLM connection test sends a ping and shows pass/fail
- [ ] Ollama auto-detect shows detected status

---

## Sprint 2 — Knowledge Base

**Goal:** Create KBs, add files, ingest via docnest, view file list, delete.

### Backend Tasks

| Task | Description | Priority |
|------|-------------|----------|
| B2.1 | KB data model | `KnowledgeBase` schema (id, name, color, icon, created_at, stats) | P0 |
| B2.2 | File record model | `FileRecord` schema (id, kb_id, path, name, format, size, ingested_at, status) | P0 |
| B2.3 | KB CRUD API | `POST /kb` `GET /kb` `GET /kb/{id}` `PUT /kb/{id}` `DELETE /kb/{id}` | P0 |
| B2.4 | File management API | `POST /kb/{id}/files` `GET /kb/{id}/files` `DELETE /kb/{id}/files/{fid}` | P0 |
| B2.5 | File ingestion service | docnest ingest pipeline — parse → chunk → index (FTS5 + ANN) | P0 |
| B2.6 | Async ingestion | Background task — ingest while UI stays responsive | P0 |
| B2.7 | Ingestion status | `GET /kb/{id}/files/{fid}/status` — pending / ingesting / ready / error | P0 |
| B2.8 | Re-index endpoint | `POST /kb/{id}/reindex` — rebuild full KB index | P1 |
| B2.9 | KB stats | File count, total size, last updated, total chunks | P1 |
| B2.10 | KBSearchTool | LangChain BaseTool wrapper around docnest HybridRetriever | P1 |
| B2.11 | FileIngestTool | LangChain BaseTool wrapper around ingestion service | P1 |
| B2.12 | Event emissions | `kb.created`, `kb.deleted`, `kb.file.added`, `kb.file.ingested` | P1 |
| B2.13 | Content hash | SHA256 of file stored at ingestion time in FileRecord | P0 |
| B2.14 | File status model | `status` field: pending / ingesting / ready / stale / missing / error | P0 |
| B2.15 | File version counter | `version` int increments on each re-index | P1 |
| B2.16 | File watcher service | `watchdog` monitors all indexed paths — `on_modified`, `on_deleted` | P0 |
| B2.17 | Stale detection | Hash changed → status=stale, emit `kb.file.stale` | P0 |
| B2.18 | Missing detection | Path gone → status=missing, emit `kb.file.missing` | P0 |
| B2.19 | Network path warning | Detect UNC / mapped drive paths → return warning on file add | P1 |
| B2.20 | Re-index endpoint | `POST /kb/{id}/files/{fid}/reindex` — rehash + reingest | P0 |
| B2.21 | Update path endpoint | `PUT /kb/{id}/files/{fid}/path` — for missing file relocation | P0 |

### Frontend Tasks

| Task | Description | Priority |
|------|-------------|----------|
| F2.1 | KB list page | Grid/list of KB cards with name, color, file count, last updated | P0 |
| F2.2 | Create KB dialog | Name input, color picker, icon selector | P0 |
| F2.3 | Delete KB confirmation | Confirm dialog before delete | P0 |
| F2.4 | KB detail view | Opens KB — shows file list panel | P0 |
| F2.5 | Add files button | Opens native file picker (via Electron IPC) | P0 |
| F2.6 | Drag-drop zone | Drop files anywhere on KB detail view | P0 |
| F2.7 | File list | Name, format badge, size, status indicator | P0 |
| F2.8 | Ingestion progress | Spinner / progress per file during ingestion | P0 |
| F2.9 | Remove file | Delete file from KB with confirmation | P0 |
| F2.10 | Format badges | Color-coded badges: PDF, DOCX, TXT, MD, CSV, UDF | P1 |
| F2.11 | KB stats bar | File count + size shown at top of KB view | P1 |
| F2.12 | Rename KB | Inline edit KB name | P1 |
| F2.13 | Stale badge | ⚠️ badge on file when content hash changed | P0 |
| F2.14 | Missing badge | ❌ badge on file when path not found | P0 |
| F2.15 | Re-index button | Appears on stale files — triggers re-ingest | P0 |
| F2.16 | Locate file button | Appears on missing files — opens file picker for new path | P0 |
| F2.17 | Network path warning toast | Shown when user adds a file from a network location | P1 |

### Desktop Tasks

| Task | Description | Priority |
|------|-------------|----------|
| E2.1 | File open dialog | Native OS file picker → return paths to renderer | P0 |
| E2.2 | Drag-drop handling | Accept file drops on app window, forward to renderer | P0 |
| E2.3 | File path normalization | Handle Windows/macOS/Linux path differences | P0 |

### Milestone S2
- [ ] Can create a KB with name and color
- [ ] Can add PDF/DOCX/TXT files via picker and drag-drop
- [ ] Ingestion runs in background, status updates in UI
- [ ] File list shows all added files with correct status
- [ ] Can remove files and delete KBs

---

## Sprint 3 — File Reader (Integrated in KB)

**Goal:** Click a file in KB → opens inline reader. Q&A sidebar scoped to that file.

### Backend Tasks

| Task | Description | Priority |
|------|-------------|----------|
| B3.1 | File render API | `GET /kb/{id}/files/{fid}/content` — returns rendered content by format | P0 |
| B3.2 | PDF renderer | Extract text with layout using PyMuPDF (fitz), page-by-page | P0 |
| B3.3 | DOCX renderer | python-docx → structured content (headings, paragraphs, tables) | P0 |
| B3.4 | TXT / MD renderer | Raw text + markdown parse | P0 |
| B3.5 | CSV renderer | Tabular data as JSON rows | P0 |
| B3.6 | UDF renderer | docnest UDF → structured sections with metadata | P0 |
| B3.7 | File Q&A endpoint | `POST /kb/{id}/files/{fid}/ask` — single-file scoped RAG query | P0 |
| B3.8 | File Q&A streaming | SSE stream for file-scoped Q&A | P0 |
| B3.9 | Page navigation API | `GET /kb/{id}/files/{fid}/content?page=N` for paginated formats | P1 |
| B3.10 | FileReadTool | LangChain BaseTool — reads and returns file content | P1 |

### Frontend Tasks

| Task | Description | Priority |
|------|-------------|----------|
| F3.1 | File reader panel | Split view: file content left, Q&A sidebar right | P0 |
| F3.2 | PDF viewer | Render PDF pages (react-pdf), page prev/next | P0 |
| F3.3 | DOCX viewer | Render structured content — headings, paragraphs, tables | P0 |
| F3.4 | TXT / MD viewer | Plain text + markdown rendering (react-markdown) | P0 |
| F3.5 | CSV viewer | Table component with column headers and rows | P0 |
| F3.6 | UDF viewer | Structured section navigation sidebar | P0 |
| F3.7 | Q&A sidebar | Input + streaming response + citations for the open file | P0 |
| F3.8 | Web search toggle | Optional web search alongside file Q&A | P1 |
| F3.9 | Back to KB | Breadcrumb / back button to return to file list | P0 |
| F3.10 | Reader loading state | Skeleton while file content loads | P1 |
| F3.11 | Reader error state | Unsupported format / parse error message | P1 |

### Milestone S3
- [ ] Click any file in KB → opens reader panel in same view
- [ ] PDF renders correctly with page navigation
- [ ] DOCX/TXT/MD/CSV/UDF render correctly
- [ ] Q&A sidebar asks questions scoped to the open file
- [ ] Streaming Q&A response works in sidebar
- [ ] Back button returns to KB file list

---

## Sprint 4 — Chat + Summarizer + Web Search

**Goal:** Full KB chat, summarizer, and web search working end-to-end.

### Backend Tasks

| Task | Description | Priority |
|------|-------------|----------|
| B4.1 | Chat session model | `ChatSession` (id, kb_id, created_at), `ChatMessage` (role, content, sources, ts) | P0 |
| B4.2 | Chat API | `POST /chat/sessions` `GET /chat/sessions/{id}/messages` `DELETE /chat/sessions/{id}` | P0 |
| B4.3 | Chat streaming endpoint | `POST /chat/sessions/{id}/stream` — SSE stream with sources | P0 |
| B4.4 | Chat service | RAG pipeline: query KB → build prompt → LiteLLM stream | P0 |
| B4.5 | Source citation | Attach file name + section to each streamed response | P0 |
| B4.6 | Multi-KB chat | Query across all KBs when no specific KB selected | P1 |
| B4.7 | Summarizer endpoint | `POST /summarize/file` `POST /summarize/kb` — with length param | P0 |
| B4.8 | Summarizer service | Build summary prompt from docnest chunks → LiteLLM | P0 |
| B4.9 | Web search endpoint | `POST /search/web` — engine-aware, returns results with snippets | P0 |
| B4.10 | Combined search | Merge KB results + web results in single response | P0 |
| B4.11 | DuckDuckGo integration | duckduckgo-search — free, no key required | P0 |
| B4.12 | Serper integration | Serper.dev API — key from settings | P1 |
| B4.13 | Brave Search integration | Brave Search API — key from settings | P1 |
| B4.14 | WebSearchTool | LangChain BaseTool wrapper around search service | P1 |
| B4.15 | SummarizeTool | LangChain BaseTool wrapper around summarizer | P1 |
| B4.16 | Chat export | `GET /chat/sessions/{id}/export` — returns markdown | P2 |

### Frontend Tasks

| Task | Description | Priority |
|------|-------------|----------|
| F4.1 | Chat page layout | Message list + input area + sidebar with KB selector | P0 |
| F4.2 | KB selector | Dropdown to pick which KB to chat with | P0 |
| F4.3 | Message bubbles | User / assistant bubbles with timestamps | P0 |
| F4.4 | Streaming display | Token-by-token rendering as SSE arrives | P0 |
| F4.5 | Source citations | Collapsible chips showing file + section sources | P0 |
| F4.6 | New conversation | Button to start fresh chat (keep history accessible) | P0 |
| F4.7 | Chat history panel | List of past conversations per KB | P1 |
| F4.8 | Web search toggle | On/off switch in chat header | P0 |
| F4.9 | Web search results | Show web sources alongside KB citations | P0 |
| F4.10 | Summarizer tab | Tab next to chat — file or KB summary | P0 |
| F4.11 | Summary length toggle | Brief / Detailed radio | P1 |
| F4.12 | Copy message | Copy button on each message | P1 |
| F4.13 | Export chat | Download chat as markdown | P2 |
| F4.14 | Empty state | Helpful prompt when no KB selected or KB is empty | P0 |
| F4.15 | Typing indicator | Animated dots while waiting for first token | P0 |

### Milestone S4
- [ ] Can chat with any KB, streaming works token by token
- [ ] Source citations appear on each answer
- [ ] Web search toggle works (DuckDuckGo without key)
- [ ] Summarizer produces file and KB summaries
- [ ] Chat history persists across app restarts
- [ ] Summarizer tab accessible from chat page

---

## Sprint 5 — Settings, Polish, and Packaging

**Goal:** All settings working, app polished, packaged for Windows/macOS/Linux.

### Backend Tasks

| Task | Description | Priority |
|------|-------------|----------|
| B5.1 | API key encryption | Fernet symmetric encryption for stored keys | P0 |
| B5.2 | LLM model catalogue | Per-provider model lists (OpenAI, Anthropic, Groq, Gemini, Cerebras, Bedrock, Ollama) | P0 |
| B5.3 | AWS Bedrock integration | LiteLLM Bedrock config (region, access key, secret) | P1 |
| B5.4 | Cerebras integration | LiteLLM Cerebras config | P1 |
| B5.5 | Settings migration | Version-aware settings upgrade on app update | P1 |
| B5.6 | Storage path config | Allow user to set custom KB data directory | P1 |
| B5.7 | Backend startup cleanup | Verify DB, check for corrupt indexes, report health | P1 |
| B5.8 | Rate limit handling | Catch LLM rate limit errors, surface in UI | P1 |

### Frontend Tasks

| Task | Description | Priority |
|------|-------------|----------|
| F5.1 | Settings — LLM complete | All 7 providers, dynamic model list, masked key, test | P0 |
| F5.2 | Settings — Search complete | DDG / Serper / Brave with conditional key input | P0 |
| F5.3 | Settings — Storage path | Folder picker for KB storage location | P1 |
| F5.4 | Settings — About | Version, docnest version, GitHub link, motto | P1 |
| F5.5 | Keyboard shortcuts | Ctrl+K (search), Ctrl+N (new chat), Ctrl+, (settings) | P1 |
| F5.6 | Drag-drop polish | Visual drop zone highlight across the whole app | P1 |
| F5.7 | Onboarding flow | First-run wizard: set LLM → create first KB → add file | P1 |
| F5.8 | Empty states | All empty states with helpful CTAs | P0 |
| F5.9 | Error messages | Human-readable errors for all failure cases | P0 |
| F5.10 | Responsive layout | Correct behavior at min window size (900×600) | P1 |
| F5.11 | Accessibility | ARIA labels, keyboard navigation, focus rings | P2 |

### Desktop + Packaging Tasks

| Task | Description | Priority |
|------|-------------|----------|
| E5.1 | App icon | Knovex icon (all sizes: 16, 32, 128, 256, 512) | P0 |
| E5.2 | System tray polish | Context menu — open, settings, quit | P1 |
| E5.3 | Native notifications | OS notification on ingestion complete / error | P1 |
| E5.4 | Window state persistence | Remember window size + position | P1 |
| E5.5 | PyInstaller bundle | Package FastAPI backend as single .exe sidecar | P0 |
| E5.6 | electron-builder config | Build .exe (Windows), .dmg (macOS), .AppImage (Linux) | P0 |
| E5.7 | Auto-updater stub | electron-updater setup (Phase 2 will activate) | P2 |
| E5.8 | Code signing config | Signing setup (cert required for Windows SmartScreen) | P2 |

### Milestone S5 — v0.1.0 Release
- [ ] All settings persist correctly with encrypted keys
- [ ] All 7 LLM providers configured and tested
- [ ] App builds to .exe / .dmg / .AppImage
- [ ] First-run onboarding flow works
- [ ] Keyboard shortcuts functional
- [ ] No P0 bugs open

---

## Backend Module Structure

```
backend/
├── main.py                    FastAPI app creation, router registration
├── requirements.txt
│
├── api/
│   ├── __init__.py
│   ├── kb.py                  /kb/* endpoints
│   ├── chat.py                /chat/* endpoints + SSE stream
│   ├── search.py              /search/web endpoint
│   └── settings.py            /settings/* endpoints
│
├── core/
│   ├── __init__.py
│   ├── kb_service.py          KB CRUD + docnest ingestion orchestration
│   ├── llm_service.py         LiteLLM wrapper — all providers, streaming
│   ├── search_service.py      DDG / Serper / Brave routing
│   ├── file_service.py        Parse PDF/DOCX/TXT/MD/CSV/UDF → structured content
│   ├── chat_service.py        RAG pipeline, prompt building, history
│   ├── summarizer_service.py  File and KB summarization
│   └── settings_service.py    Read/write/encrypt settings
│
├── tools/                     LangChain-compatible tools (agent-ready)
│   ├── __init__.py
│   ├── kb_search_tool.py      Wraps docnest HybridRetriever
│   ├── web_search_tool.py     Wraps SearchService
│   ├── summarize_tool.py      Wraps SummarizerService
│   └── file_read_tool.py      Wraps FileService
│
├── models/
│   ├── __init__.py
│   └── schemas.py             All Pydantic request/response models
│
├── storage/
│   ├── __init__.py
│   ├── base.py                Abstract StorageBackend
│   └── sqlite_backend.py      SQLite implementation
│
└── events/
    ├── __init__.py
    └── bus.py                 In-process EventBus
```

---

## Frontend Module Structure

```
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
│
└── src/
    ├── main.tsx               React entry point
    ├── App.tsx                Root app + Router
    │
    ├── theme/
    │   └── index.ts           MUI theme definitions (light/medium/dark)
    │
    ├── pages/
    │   ├── KnowledgeBase/
    │   │   ├── index.tsx      KB list + create KB
    │   │   ├── KBDetail.tsx   KB file list + file reader integration
    │   │   └── FileReader.tsx Inline file reader + Q&A sidebar
    │   ├── Chat/
    │   │   ├── index.tsx      Chat page + summarizer tab
    │   │   ├── ChatWindow.tsx Message list + streaming display
    │   │   └── Summarizer.tsx Summarize file or KB
    │   └── Settings/
    │       ├── index.tsx      Settings tabs
    │       ├── LLMSettings.tsx
    │       ├── SearchSettings.tsx
    │       └── AppSettings.tsx
    │
    ├── components/
    │   ├── Layout/
    │   │   ├── AppShell.tsx   Overall layout wrapper
    │   │   └── Sidebar.tsx    Navigation sidebar
    │   ├── FileReader/
    │   │   ├── PDFViewer.tsx
    │   │   ├── DocxViewer.tsx
    │   │   ├── TextViewer.tsx
    │   │   ├── CSVViewer.tsx
    │   │   └── UDFViewer.tsx
    │   └── shared/
    │       ├── StreamingText.tsx   Renders SSE token stream
    │       ├── SourceCitation.tsx  Citation chips
    │       ├── FormatBadge.tsx     PDF / DOCX / etc badges
    │       └── EmptyState.tsx
    │
    ├── store/
    │   ├── kb.store.ts         KB list, selected KB, file list
    │   ├── chat.store.ts       Chat sessions, messages, streaming state
    │   └── settings.store.ts  App settings + theme
    │
    └── api/
        ├── client.ts          Axios instance (baseURL: localhost:8765)
        ├── kb.api.ts          Typed KB API calls
        ├── chat.api.ts        Typed Chat + SSE stream setup
        ├── search.api.ts      Typed search calls
        └── settings.api.ts    Typed settings calls
```

---

## Dependencies

### Backend (requirements.txt)
```
fastapi>=0.115
uvicorn[standard]>=0.32
docnest-ai>=0.6.0
litellm>=1.50
langchain-core>=0.3
duckduckgo-search>=6.0
httpx>=0.27
pydantic>=2.0
python-multipart>=0.0.12
cryptography>=43.0        # Fernet encryption for API keys
platformdirs>=4.0         # Cross-platform config/data paths
pymupdf>=1.24             # PDF parsing (fitz)
python-docx>=1.1          # DOCX parsing
markdown>=3.7             # MD rendering
```

### Frontend (package.json)
```
react@^18
react-dom@^18
react-router-dom@^6
@mui/material@^6
@mui/icons-material@^6
@emotion/react@^11
@emotion/styled@^11
zustand@^4
@tanstack/react-query@^5
axios@^1
react-pdf@^9                # PDF rendering
react-markdown@^9           # Markdown rendering
@tanstack/react-table@^8    # CSV table rendering
```

### Desktop (package.json)
```
electron@^33
electron-builder@^25
```

---

---

## Sprint 6 — Learn Mode

**Goal:** Full interactive learning engine — all formats working, gamification live, web search enrichment.

### Backend Tasks

| Task | Description | Priority |
|------|-------------|----------|
| B6.1 | Learn session model | `LearnSession` (id, topic, format, source_type, source_ref, difficulty) | P0 |
| B6.2 | User progress model | `UserStats` (xp, level, streak), `LearnProgress` per session | P0 |
| B6.3 | Flashcard review model | `FlashcardReview` — spaced repetition tracking | P1 |
| B6.4 | Learn session API | `POST /learn/session` `GET /learn/session/{id}` `DELETE /learn/session/{id}` | P0 |
| B6.5 | Quiz answer API | `POST /learn/session/{id}/answer` — validate, score, update XP | P0 |
| B6.6 | Progress API | `GET /learn/progress` — XP, level, streak, badges, recent sessions | P0 |
| B6.7 | Content processor | Extract + chunk content from PDF / URL / topic+web search | P0 |
| B6.8 | Web scraper | httpx + BeautifulSoup — scrape URL, clean HTML → plain text | P0 |
| B6.9 | Quiz generator | LLM prompt → structured JSON quiz with options + explanations | P0 |
| B6.10 | Flashcard generator | LLM prompt → front/back card pairs from content | P0 |
| B6.11 | Mind map generator | LLM → concept nodes + relationships JSON (React Flow format) | P0 |
| B6.12 | Story mode generator | LLM → narrative chapters with analogies | P0 |
| B6.13 | Timeline generator | LLM → chronological events with descriptions | P0 |
| B6.14 | ELI5 generator | LLM → difficulty-adjusted explanation (Age5/10/HS/Expert) | P0 |
| B6.15 | Speed learn planner | LLM → structured timed session (5/10/30 min) combining formats | P1 |
| B6.16 | Brainstorm generator | Web search + LLM → expanded concept graph nodes | P0 |
| B6.17 | XP engine | Award XP on session complete, quiz score, streak update | P0 |
| B6.18 | Badge engine | Check topic mastery → award achievement badges | P1 |
| B6.19 | Spaced repetition logic | Next review date based on ease rating | P1 |
| B6.20 | LearnTool | LangChain BaseTool — generates session from content (agent-ready) | P1 |

### Frontend Tasks

| Task | Description | Priority |
|------|-------------|----------|
| F6.1 | Learn Mode home | Source selector (PDF/URL/topic) + format picker grid | P0 |
| F6.2 | Session generator UI | Loading state, format preview before starting | P0 |
| F6.3 | Quiz component | Question + options + timer + score + explanation on answer | P0 |
| F6.4 | Flashcard deck | Framer Motion flip animation, swipe left/right, ease rating | P0 |
| F6.5 | Mind map viewer | React Flow interactive graph — click node to expand | P0 |
| F6.6 | Story mode viewer | Paged narrative with next/prev, progress bar | P0 |
| F6.7 | Timeline viewer | Animated horizontal timeline — Framer Motion | P0 |
| F6.8 | ELI5 viewer | Styled explanation with difficulty selector | P0 |
| F6.9 | Speed Learn flow | Multi-format timed session with countdown | P1 |
| F6.10 | Brainstorm board | React Flow canvas — nodes expand on click via web search | P0 |
| F6.11 | Session complete screen | Score, XP earned, badges unlocked, next suggestions | P0 |
| F6.12 | Progress dashboard | XP bar, level, streak, recent sessions, achievements | P0 |
| F6.13 | Daily challenge | Featured topic card on Learn home with bonus XP | P1 |
| F6.14 | Add to KB button | Save curated content from session into a KB | P1 |
| F6.15 | Go deeper | Click any concept → AI expands in sidebar | P1 |
| F6.16 | Web search enrichment toggle | On/off switch on session generator | P0 |
| F6.17 | Difficulty selector | Beginner / Intermediate / Expert on session start | P0 |
| F6.18 | learn.store.ts | Zustand store for session state, progress, gamification | P0 |
| F6.19 | learn.api.ts | Typed API calls for all /learn/* endpoints | P0 |

### Milestone S6 — Learn Mode v1
- [ ] All 8 formats generate correctly (quiz, flashcard, mind map, story, timeline, ELI5, speed learn, brainstorm)
- [ ] Quiz scoring + XP award works
- [ ] Flashcard spaced repetition tracks ease ratings
- [ ] Mind map and brainstorm board interactive in React Flow
- [ ] Progress dashboard shows XP, streak, badges
- [ ] Web search enrichment works in session generator
- [ ] "Add to KB" saves session content correctly

---

## Phase 2 Outline (Post Phase 1)

| Feature | Description |
|---------|-------------|
| **Deployment: Organisation mode** | Knovex Cloud Portal — admin manages keys, invites users, sets policies |
| **Admin portal web app** | React app at app.knovex.io — user mgmt, key vault, analytics |
| **LLM proxy** | Portal proxies LLM calls — keys never reach employee devices |
| **Self-hosted Docker** | IT deploys on company server — air-gapped enterprise support |
| **SSO** | Google Workspace, Azure AD for organisation login |
| LangGraph agents | Multi-step reasoning agents using registered Tools |
| Workflow builder | Visual DAG — connect triggers, agents, actions |
| Cloud backend | Docker + Railway/AWS — same FastAPI, PostgreSQL + Redis (OUR server) |
| Web app | Deploy same React frontend to CDN |
| Mobile app | React Native consuming same FastAPI API |
| Team KBs | Shared knowledge bases, user accounts, JWT auth |
| Plugin marketplace | Third-party tools, connectors (Slack, email, Notion) |
| Auto-updater | Electron auto-update from GitHub releases |
| Analytics dashboard | KB usage stats, most-queried topics |
| MCP server | Expose Knovex as an MCP-compatible tool server |
| Learn: voice narration | TTS for story mode and ELI5 |
| Learn: export session | Save interactive session as standalone HTML |
| Learn: social sharing | Share session link (Phase 2 cloud) |
| Learn: multiplayer quiz | Real-time quiz sessions with friends/team |
