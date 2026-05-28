# Knovex — Technology Stack

*Decisions, rationale, and alternatives considered.*

---

## Desktop Shell — Electron

**Chosen:** Electron 33

### Why Electron over Tauri
| Concern | Electron | Tauri |
|---------|----------|-------|
| Binary size | ~150 MB | ~15 MB |
| RAM usage | ~200 MB | ~60 MB |
| UI rendering | Chromium — identical on all platforms | OS WebView — varies by OS |
| Python integration | HTTP sidecar (same for both) | HTTP sidecar (same for both) |
| Additional language | Node.js (JS — same as frontend) | Rust (3rd language in stack) |
| Maturity | 10+ years, VS Code, Slack, Notion | ~3 years |
| Document rendering | Consistent PDF/DOCX rendering | WebView inconsistencies |
| CI/CD | npm build | Rust toolchain required |

**Decision:** Knovex is a document reader and knowledge base — consistent rendering across platforms is critical. Electron's Chromium guarantees identical PDF, DOCX, and Markdown rendering everywhere. The binary size difference (~150 MB vs ~15 MB) is not meaningful for a productivity tool in 2026.

**Future:** If binary size becomes a user complaint, the Electron shell can be swapped for Tauri without touching the frontend or backend. The decoupled architecture makes this a 1-day migration.

### Why not C# (WPF / MAUI)
- WPF is Windows-only
- MAUI has limited web-content embedding
- Adds a 3rd language (Python + TypeScript + C#) with no benefit
- The decoupled architecture means the shell is thin — language doesn't matter much, but Electron stays in the same JS/TS ecosystem as the frontend

### Why not PyQt6 / PySide6
- Limited UI quality — cannot match MUI component library
- Python-only desktop widget toolkit, no modern web components
- Not reusable for web or mobile phases

---

## Backend — FastAPI

**Chosen:** FastAPI + Python 3.11

### Why FastAPI
- **Async native** — all I/O is non-blocking; critical for streaming LLM output
- **SSE built-in** — `StreamingResponse` + `EventSourceResponse` for token streaming
- **Pydantic v2** — fast validation, auto-generates OpenAPI spec
- **Auto OpenAPI** — agents can self-discover API endpoints in Phase 2
- **Same language as docnest** — direct import, no serialization overhead
- **Production-ready** — used by Uber, Microsoft, Netflix

### Why not Flask
- No native async support
- No automatic data validation
- Manual OpenAPI — not auto-generated

### Why not Django
- Way too heavy for a local API sidecar
- ORM, admin, templates — none of it needed

---

## RAG Engine — docnest-ai

**Chosen:** docnest-ai 0.6.0

This is Knovex's own engine. No alternatives considered — it's the entire reason Knovex exists.

- Hybrid FTS5 (BM25) + dense ANN + section graph + RRF fusion
- ~1 ms/query
- Native UDF format support
- SQLite — zero infrastructure

---

## LLM Abstraction — LiteLLM

**Chosen:** LiteLLM

### Why LiteLLM
- Single unified API for 100+ LLM providers
- Covers all 7 required providers: OpenAI, Anthropic, Groq, Gemini, Cerebras, AWS Bedrock, Ollama
- Handles streaming, retries, rate limits
- Drop-in OpenAI-compatible interface
- Actively maintained

### Why not LangChain LLMs directly
- LangChain is heavier
- LiteLLM is provider-agnostic with less overhead
- LiteLLM handles provider quirks transparently

### Why not per-provider SDKs
- Would require maintaining 7 separate SDK integrations
- Different streaming APIs per provider
- LiteLLM normalises everything to one interface

**Note:** LangChain `BaseTool` is still used for the Tool Registry — it's a thin base class, not the full LangChain stack.

---

## Frontend — React 18 + TypeScript

**Chosen:** React 18 + TypeScript

### Why React
- Gunjan's existing codebase (KnowledgeBase project) uses React + MUI
- Largest ecosystem for UI components
- React Native in Phase 2 — same patterns for mobile
- Vite + React = fast HMR

### Why TypeScript
- Type safety between frontend and backend contracts
- IDE autocomplete for API response shapes
- Catches mistakes at compile time, not runtime

### Why not Vue / Svelte / Solid
- React knowledge already exists in the project
- MUI v6 is React-first
- React Native availability for Phase 2 mobile

---

## UI Library — MUI v6

**Chosen:** Material UI v6

### Why MUI
- Consistent, professional component library
- Already used in the KnowledgeBase project — no learning curve
- Dark/light theme system built in
- Data Grid, Dialog, Drawer, Tabs — all needed for Knovex

### Why not Tailwind + shadcn/ui
- Higher setup and customization effort
- Less consistent theming out of box

### Why not Ant Design
- Heavier bundle
- Less flexible theming

---

## State Management — Zustand + TanStack Query

**Chosen:** Zustand (UI state) + TanStack Query v5 (server state)

### Why Zustand
- Zero boilerplate vs Redux
- Simple `create(set => ...)` API
- Perfect for KB list, selected KB, theme, settings

### Why TanStack Query
- Handles caching, background refetch, loading states for API calls
- `useQuery` for KB list, file list
- `useMutation` for create/delete operations
- `useInfiniteQuery` for chat history pagination

### Why not Redux
- Overkill for a single-user desktop app
- Boilerplate is not justified

---

## Build Tool — Vite 5

**Chosen:** Vite 5

- Instant HMR in development
- ES module native
- Works with Electron dev mode
- `vite build` → static files for production

---

## Package Manager — pnpm

**Chosen:** pnpm

- 2-3× faster than npm for install
- Disk-efficient (symlink-based node_modules)
- Workspace support for monorepo (frontend + desktop)

---

## Web Search

**Chosen:** duckduckgo-search (default) + Serper + Brave

| Engine | Cost | Key Required | Quality |
|--------|------|-------------|---------|
| DuckDuckGo | Free | ❌ | Good |
| Serper | Paid | ✅ | Excellent |
| Brave Search | Paid | ✅ | Excellent |

DuckDuckGo is the default — works out of the box with no API key. Users can upgrade to Serper or Brave in Settings.

---

## Encryption — Cryptography (Fernet)

**Chosen:** `cryptography` library, Fernet symmetric encryption

- API keys stored encrypted in local config file
- Key derived from machine ID (unique per installation)
- Simple, well-audited, part of Python standard ecosystem

---

## PDF Parsing — PyMuPDF (fitz)

**Chosen:** PyMuPDF

- Fast, accurate text extraction with layout
- Handles complex PDFs (tables, columns, images)
- Returns page-by-page structured content
- Used by docnest internally

---

## Cross-platform Config — platformdirs

**Chosen:** platformdirs

Handles config/data directory resolution per OS:
- Windows: `%APPDATA%\Knovex\`
- macOS: `~/Library/Application Support/Knovex/`
- Linux: `~/.config/Knovex/`

---

## Packaging

| Target | Tool | Output |
|--------|------|--------|
| Python backend | PyInstaller | Single `.exe` / binary sidecar |
| Desktop app | electron-builder | `.exe` (Windows) / `.dmg` (macOS) / `.AppImage` + `.deb` (Linux) |

---

## E2E Testing — Playwright

**Chosen:** Playwright (v1.x)

### Why Playwright
- **Auto-wait** — built-in smart waiting eliminates flaky `sleep` calls
- **`page.route()`** — intercept and mock all `/api/*` calls without a live backend
- **LIFO route stack** — most-recently-registered handler wins; test-body overrides can easily supersede `beforeEach` defaults
- **Strict mode** — fails loudly on ambiguous locators, catching UI regressions immediately
- **`data-testid` support** — `page.locator('[data-testid="..."]')` provides stable, semantic locators decoupled from rendered text
- **HTML reporter + traces** — failing tests attach screenshots and `.zip` traces viewable via `npx playwright show-trace`

### E2E Test Structure

```
e2e/
├── learn.spec.ts    27 tests — UI/UX layout + functional flows (format cards, SSE streaming,
│                               GuidedViewer, session history, delete, source modes)
└── progress.spec.ts 34 tests — Visual layout + data accuracy (stat cards, heatmap,
                                 velocity chart, week-over-week trends, zero-state)
```

Total: **61 tests**, all green, running against Chromium with `fullyParallel: true`.

### Config Decisions

| Setting | Value | Reason |
|---------|-------|--------|
| `navigationTimeout` | 60 s | Generous for cold Vite dev-server under 9 parallel workers |
| `actionTimeout` | 10 s | Enough for SSE mocks to resolve |
| `reuseExistingServer` | `true` (non-CI) | Avoids restarting Vite between local runs |
| `fullyParallel` | `true` | All 61 tests run simultaneously across worker pool |
| `workers` | undefined (non-CI) | Uses all CPU cores locally; 1 in CI for determinism |

---

## Phase 2 Additions (not in Phase 1)

| Component | Technology | Reason |
|-----------|-----------|--------|
| Agent orchestration | LangGraph | Multi-agent, human-in-loop, checkpointing |
| Task queue | Celery + Redis | Async long-running workflow tasks |
| Database | PostgreSQL | Cloud-ready relational DB |
| Cache | Redis | Session cache + pub/sub event bus |
| Auth | JWT + OAuth | User accounts, team KBs |
| Container | Docker | Cloud deployment |
| Mobile | React Native | Same API, same component patterns |
| MCP server | FastAPI + MCP spec | Expose Knovex tools to any MCP agent |
