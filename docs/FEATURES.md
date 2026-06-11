# Knovex — Feature Specification

*Phase 1: Desktop App — 4 Modules*

---

## Module 1 — Knowledge Base + File Reader

The KB and File Reader are a single integrated module. Files live inside a KB, and clicking a file opens the reader inline.

### Knowledge Base Management

| Feature | Description | Phase |
|---------|-------------|-------|
| Create KB | Name + color tag + icon | 1 |
| Rename KB | Inline edit | 1 |
| Delete KB | With confirmation dialog | 1 |
| KB color tags | Visual color coding per KB | 1 |
| KB stats | File count, total size, last indexed | 1 |
| Multiple KBs | No limit on number of KBs | 1 |
| KB search | Quick filter KBs by name | 1 |

### File Management

| Feature | Description | Phase |
|---------|-------------|-------|
| Add files via picker | Native OS file dialog | 1 |
| Add files via drag-drop | Drop anywhere on KB view | 1 |
| Supported formats | PDF, DOCX, TXT, MD, CSV, UDF | 1 |
| Auto-ingestion | docnest indexes on add (background) | 1 |
| Ingestion status | Pending / Ingesting / Ready / Error indicator | 1 |
| Remove file | Delete file from KB + remove from index | 1 |
| Re-index | Rebuild KB index manually | 1 |
| File metadata | Name, format badge, size, date added, status | 1 |
| Content hash | SHA256 stored at ingest — detects any file change | 1 |
| Stale detection | File watcher + hash check → marks file Stale if changed | 1 |
| Missing detection | File watcher → marks file Missing if deleted or moved | 1 |
| Stale badge | Visual warning on file list when content has changed | 1 |
| Missing badge | Visual error on file list when file not found at path | 1 |
| Re-index on stale | One-click re-ingest with updated content | 1 |
| Locate missing file | File picker to set new path when file has moved | 1 |
| Network path warning | Warns user if file is on a network share | 1 |
| Version counter | Increments each time a file is re-indexed | 1 |

### File Reader (inline in KB)

| Feature | Description | Phase |
|---------|-------------|-------|
| Open file | Click file in KB list → opens inline reader | 1 |
| PDF rendering | Page-by-page with prev/next navigation | 1 |
| DOCX rendering | Headings, paragraphs, tables | 1 |
| TXT / MD rendering | Plain text + markdown formatting | 1 |
| CSV rendering | Scrollable table view | 1 |
| UDF rendering | Structured sections with metadata | 1 |
| File-scoped Q&A | Ask questions about the open file only | 1 |
| Q&A streaming | Token-by-token response in sidebar | 1 |
| Web search toggle | Optional web search alongside file Q&A | 1 |
| Back navigation | Return to KB file list from reader | 1 |

---

## Module 2 — Chat + Summarizer

### Chat

| Feature | Description | Phase |
|---------|-------------|-------|
| KB-scoped chat | Ask questions against a selected KB | 1 |
| Multi-KB chat | Query across all KBs | 1 |
| Streaming responses | Token-by-token via SSE | 1 |
| Source citations | File name + section that answered | 1 |
| Chat history | Persisted per KB in SQLite | 1 |
| New conversation | Fresh context, keep history accessible | 1 |
| Copy message | Copy any message to clipboard | 1 |
| Export chat | Download chat as markdown file | 1 |
| Typing indicator | Animated dots while waiting | 1 |
| Web search toggle | On/off per session | 1 |

### Summarizer

| Feature | Description | Phase |
|---------|-------------|-------|
| Summarize file | Single file summary | 1 |
| Summarize KB | Full KB overview summary | 1 |
| Summary length | Brief / Detailed toggle | 1 |
| Streaming output | Summary streams token by token | 1 |

### Web Search

| Feature | Description | Phase |
|---------|-------------|-------|
| DuckDuckGo | Free, no API key, default option | 1 |
| Serper | API key required, high-quality results | 1 |
| Brave Search | API key required, privacy-focused | 1 |
| Combined results | KB answer + web sources merged | 1 |
| Source links | Clickable URLs in response | 1 |
| Toggle | Enable/disable per chat session | 1 |

---

## Module 3 — Settings

### LLM Settings

| Feature | Description | Phase |
|---------|-------------|-------|
| OpenAI | GPT-4o, GPT-4o-mini, GPT-4-turbo | 1 |
| Anthropic | Claude 3.5 Sonnet, Claude 3 Haiku | 1 |
| Groq | Llama-3, Mixtral, Gemma | 1 |
| Google Gemini | Gemini 1.5 Pro, Gemini Flash | 1 |
| Cerebras | Llama-3.1, other Cerebras models | 1 |
| AWS Bedrock | Claude, Llama, Titan via Bedrock | 1 |
| Ollama (local) | Any local model via Ollama | 1 |
| Ollama auto-detect | Scans localhost:11434 on startup | 1 |
| Model selector | Dropdown per provider | 1 |
| API key input | Masked + encrypted local storage | 1 |
| Test connection | Ping LLM before saving | 1 |

### Search Settings

| Feature | Description | Phase |
|---------|-------------|-------|
| Engine selection | DDG / Serper / Brave | 1 |
| API key | Per-engine, masked | 1 |
| Test search | Quick test query | 1 |

### App Settings

| Feature | Description | Phase |
|---------|-------------|-------|
| Theme | Light / Medium / Dark | 1 |
| KB storage path | Custom directory for KB data | 1 |
| About / version | App version, docnest version, links | 1 |

---

## Module 4 — Learn Mode

The interactive learning engine. Feed any PDF, web URL, or typed topic — Knovex generates animated, gamified learning content on demand.

### Input Sources

| Source | Description | Phase |
|--------|-------------|-------|
| PDF from KB | Select any ingested file as source | 1 |
| Web URL | Scrape and learn from any webpage | 1 |
| Topic (typed) | Type a topic → web search pulls content | 1 |
| PDF + Web combined | Merge file content with web enrichment | 1 |

### Learning Formats

| Format | Description | Phase |
|--------|-------------|-------|
| Flash Quiz | AI-generated multiple choice / true-false / fill-in-blank | 1 |
| Quiz scoring | Points, timer, correct/wrong feedback with explanation | 1 |
| Flashcard Deck | Swipeable front/back cards — tap to flip | 1 |
| Spaced repetition | Hard cards return sooner, easy ones less often | 1 |
| Animated Mind Map | Interactive node graph — click to expand concepts | 1 |
| Story Mode | Complex topic rewritten as narrative with analogies | 1 |
| Timeline | Animated chronological view for sequential topics | 1 |
| ELI5 Mode | Adjustable difficulty — Age 5 / Age 10 / High School / Expert | 1 |
| Speed Learn | Timed session — 5 min / 10 min / 30 min structured flow | 1 |
| Brainstorm Board | Web search + AI expand any concept as visual graph | 1 |
| Animated Explainer | Structure-first motion-graphics lesson — the LLM declares a diagram + narration, a layout engine draws it (see below) | 1 |

### Animated lessons — the semantic engine *(v0.14.0)*

Animated lessons follow a **Mermaid-style** model that honours the project principle *"logic in the app, the LLM is just the narrator"*:

1. **The LLM declares structure, not pixels** — it returns a `diagram` type, a list of `items` (with optional `role`/`parent`/`group`), optional `edges`, and `steps` (each with `narration`, the `reveal` set, and a `focus`). It never emits coordinates.
2. **A pure layout engine** (`frontend/src/lib/sceneLayout.ts`) computes every position, so label overlap is mathematically impossible.
3. **Diagram types** — `flow` (process), `cycle` (loop), `tree` (hierarchy), `compare` (A vs B), `timeline` (events), `hub` (concept + satellites), `reaction` (inputs → process → outputs, directional), and `code` (line-by-line walk).
4. **Pedagogy baked in** — *progressive disclosure* (`reveal` accumulates, one idea per step) and *signaling* (`focus` glows, the rest dim), with the narration captioned beside the stage.

### Interactivity

| Feature | Description | Phase |
|---------|-------------|-------|
| Go deeper | Click any concept → AI expands with detail | 1 |
| Simplify | Make current explanation simpler | 1 |
| Give example | AI generates a real-world example | 1 |
| Web search in session | Enrich any point with live web search | 1 |
| Add to KB | Save curated content from session to a KB | 1 |
| Difficulty selector | Switch difficulty mid-session | 1 |
| Session progress bar | Visual progress through the learning session | 1 |

### Gamification

| Feature | Description | Phase |
|---------|-------------|-------|
| XP points | Earned per quiz completed, session finished | 1 |
| Daily streak | Consecutive days learning | 1 |
| Achievement badges | Per topic mastered (Biology Master, Physics Rookie, etc.) | 1 |
| Session score | Quiz accuracy %, time taken | 1 |
| Difficulty levels | Beginner → Intermediate → Expert per topic | 1 |
| Daily challenge | Featured topic with 2× XP reward | 1 |
| Progress tracking | Topics covered, revisit suggestions | 1 |

### Web Search in Learn Mode

| Feature | Description | Phase |
|---------|-------------|-------|
| Topic enrichment | Web search adds real-world context to sessions | 1 |
| Source links | Clickable references shown in session | 1 |
| Brainstorm expand | Click any node on brainstorm board → web search for more | 1 |

---

## Module 5 — Deployment Modes

Knovex supports 3 deployment modes to cover personal users, organisations, and enterprise.

### Mode 1 — Personal (Phase 1)

| Feature | Description | Phase |
|---------|-------------|-------|
| Own API keys | User enters their own LLM + search keys | 1 |
| Local SQLite | Embedded DB — zero setup, zero config | 1 |
| Fully offline | Works without internet (except LLM calls + web search) | 1 |
| Encrypted key storage | Fernet encryption in local config file | 1 |

### Mode 2 — Organisation (Phase 2 — Knovex Cloud Portal)

| Feature | Description | Phase |
|---------|-------------|-------|
| Admin web portal | React web app at app.knovex.io | 2 |
| Org API key management | Admin enters keys once — all users get them | 2 |
| Keys never reach devices | Portal proxies LLM calls — raw keys stay server-side | 2 |
| User invites | Email invites or bulk CSV upload | 2 |
| Org code setup | Employee enters org code → app authenticates → works | 2 |
| Policy management | Which LLMs allowed, models allowed, web search on/off | 2 |
| Usage analytics | Per-user token usage, cost tracking, request counts | 2 |
| Key rotation | Admin rotates key once → all 50 apps updated instantly | 2 |
| Revoke access | Disable a user instantly from portal | 2 |
| SSO | Google Workspace, Azure AD (Phase 2b) | 2 |

### Mode 3 — Self-hosted Enterprise (Phase 2)

| Feature | Description | Phase |
|---------|-------------|-------|
| Docker deployment | IT deploys Knovex backend on company server | 2 |
| Air-gapped support | No external internet required | 2 |
| Company server URL | Employees point app at internal URL | 2 |
| IT-managed config | All keys and policies on company infrastructure | 2 |
| Annual license | Enterprise pricing model | 2 |

---

## App-Wide Features

| Feature | Description | Phase |
|---------|-------------|-------|
| System tray | Minimize to tray, quick open | 1 |
| Drag-drop | Drop files from file explorer anywhere | 1 |
| Keyboard shortcuts | Ctrl+K search, Ctrl+N new chat, Ctrl+, settings | 1 |
| OS notifications | Ingestion complete / errors | 1 |
| Onboarding flow | First-run: set LLM → create KB → add file | 1 |
| Error messages | Human-readable error descriptions | 1 |
| Loading states | Skeletons and spinners throughout | 1 |
| Window state | Remembers size and position | 1 |

---

## Supported File Formats

| Format | Extension | Ingestion | Reader | Notes |
|--------|-----------|-----------|--------|-------|
| PDF | .pdf | ✅ | ✅ | Page-by-page rendering |
| Word | .docx | ✅ | ✅ | Headings, tables, paragraphs |
| Text | .txt | ✅ | ✅ | Plain text |
| Markdown | .md | ✅ | ✅ | Rendered formatting |
| CSV | .csv | ✅ | ✅ | Table view |
| UDF | .udf | ✅ | ✅ | Structured AI-first format |

---

## Supported LLM Providers

| Provider | Models | Key Required | Offline |
|----------|--------|-------------|---------|
| OpenAI | GPT-4o, GPT-4o-mini, GPT-4-turbo | ✅ | ❌ |
| Anthropic | Claude 3.5 Sonnet, Haiku | ✅ | ❌ |
| Groq | Llama-3, Mixtral, Gemma | ✅ | ❌ |
| Google Gemini | Gemini 1.5 Pro, Flash | ✅ | ❌ |
| Cerebras | Llama-3.1, other Cerebras | ✅ | ❌ |
| AWS Bedrock | Claude, Llama, Titan | ✅ (AWS keys) | ❌ |
| Ollama | Any local model | ❌ | ✅ |

---

## Phase 2 Features (Not in Phase 1)

| Feature | Module |
|---------|--------|
| Organisation deployment mode | Deployment |
| Knovex Cloud Portal (admin web app) | New: Portal |
| Self-hosted Docker deployment | Deployment |
| LLM proxy — keys never reach client device | Backend |
| Per-user usage analytics + cost tracking | Portal |
| SSO — Google Workspace, Azure AD | Auth |
| LangGraph multi-agent chat | Chat |
| Visual workflow builder | New: Workflows |
| Workflow triggers (file added, schedule) | Workflows |
| Cloud sync — local SQLite ↔ cloud | KB |
| Shared / team KBs | KB |
| User accounts + JWT auth | App |
| Web app version | Frontend |
| Mobile app (React Native — same API) | Frontend |
| Plugin / connector marketplace | New: Plugins |
| MCP server (expose Knovex as tool) | Backend |
| Auto-updater | Desktop |
| Learn Mode: voice narration (TTS) | Learn |
| Learn Mode: export session as HTML | Learn |
| Learn Mode: social sharing | Learn |
| Learn Mode: multiplayer quiz | Learn |
| Learn Mode: interactive simulations | Learn |
| Usage analytics dashboard | New: Analytics |
