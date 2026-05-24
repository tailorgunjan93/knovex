# Knovex — System Architecture

*Secure · Fast · Reliable · Cost-Effective*

---

## Design Principles

1. **Decoupled frontend/backend** — FastAPI backend is a standalone portable API. Frontend is a pure consumer. Zero coupling between layers.
2. **Local-first** — All data stays on the user's machine. No cloud dependency in Phase 1.
3. **Agent-ready from day one** — Every capability is a registered Tool. Adding LangGraph agents in Phase 2 requires no rewrites.
4. **Async throughout** — All backend services use Python async/await. Long-running tasks never block the server.
5. **Storage abstraction** — SQLite embedded in desktop app (zero setup). PostgreSQL only on OUR cloud server — never installed by users.
6. **Event-driven** — All state changes emit events. Workflow triggers slot in without modifying core services.
7. **File integrity** — SHA256 hash + file watcher detects stale or missing files automatically.

---

## Full System Architecture

```
╔═════════════════════════════════════════════════════════════════╗
║  PHASE 2+  AGENTIC LAYER  (future — zero Phase 1 rewrites)     ║
║                                                                 ║
║  ┌─────────────────────┐    ┌──────────────────────────────┐   ║
║  │  Agent Orchestrator │    │  Workflow Engine              │   ║
║  │  LangGraph          │    │  DAG-based pipelines          │   ║
║  │  - Multi-agent      │    │  - Event triggers             │   ║
║  │  - Human-in-loop    │    │  - Scheduled tasks            │   ║
║  │  - Checkpointing    │    │  - Visual builder UI          │   ║
║  └──────────┬──────────┘    └────────────┬─────────────────┘   ║
╚═════════════│═══════════════════════════│═════════════════════╝
              │                           │
              ▼                           ▼
╔═════════════════════════════════════════════════════════════════╗
║  TOOL REGISTRY  ← Built in Phase 1                             ║
║                                                                 ║
║  kb_search  │  web_search  │  summarize  │  file_read          ║
║  code_run   │  browser     │  email      │  slack  │  custom   ║
║                                                                 ║
║  Every capability = Tool(name, description, args_schema, run)  ║
║  Agents discover and call tools by schema                      ║
╚════════════════════════════╤════════════════════════════════════╝
                             │
╔════════════════════════════▼════════════════════════════════════╗
║  API LAYER  (FastAPI + Python 3.11)  ← Built in Phase 1        ║
║                                                                 ║
║  REST Endpoints                                                 ║
║    POST   /kb/                        Create knowledge base     ║
║    GET    /kb/                        List all KBs              ║
║    DELETE /kb/{id}                    Delete KB                 ║
║    POST   /kb/{id}/files              Add file to KB            ║
║    DELETE /kb/{id}/files/{file_id}    Remove file               ║
║    POST   /kb/{id}/reindex            Re-index KB               ║
║    POST   /chat/                      Start chat (streaming)    ║
║    GET    /chat/{kb_id}/history       Chat history              ║
║    POST   /summarize/                 Summarize file or KB      ║
║    POST   /search/web                 Web search                ║
║    POST   /learn/session              Generate learn session    ║
║    GET    /learn/session/{id}         Get session content       ║
║    POST   /learn/session/{id}/answer  Submit quiz answer        ║
║    GET    /learn/progress             User XP + streaks         ║
║    GET    /settings/                  Get settings              ║
║    PUT    /settings/                  Update settings           ║
║    POST   /settings/test-llm          Test LLM connection       ║
║    GET    /settings/ollama/detect     Auto-detect Ollama        ║
║                                                                 ║
║  Streaming                                                      ║
║    GET  /chat/stream          SSE — token-by-token output       ║
║    WS   /ws/chat              WebSocket (Phase 2)               ║
║                                                                 ║
║  OpenAPI docs auto-generated → agents can self-discover API    ║
╚════════════════════════════╤════════════════════════════════════╝
                             │
╔════════════════════════════▼════════════════════════════════════╗
║  CORE SERVICES  ← Built in Phase 1                             ║
║                                                                 ║
║  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐  ║
║  │   KB Service    │  │   LLM Service   │  │Search Service │  ║
║  │  docnest RAG    │  │   LiteLLM       │  │DDG/Serper/    │  ║
║  │  FTS5 + ANN     │  │  7 providers    │  │Brave          │  ║
║  │  Section graph  │  │  Streaming      │  │               │  ║
║  │  UDF support    │  │  Async          │  │               │  ║
║  └─────────────────┘  └─────────────────┘  └───────────────┘  ║
║                                                                 ║
║  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐  ║
║  │  File Service   │  │   Event Bus     │  │Settings Svc   │  ║
║  │  Parse PDF      │  │  In-process     │  │Encrypted local│  ║
║  │  DOCX/TXT/MD    │  │  Phase 2→Redis  │  │config         │  ║
║  │  CSV/UDF        │  │                 │  │               │  ║
║  └─────────────────┘  └─────────────────┘  └───────────────┘  ║
║                                                                 ║
║  ┌─────────────────┐  ┌─────────────────┐                      ║
║  │  Learn Service  │  │  File Watcher   │                      ║
║  │  Session gen    │  │  watchdog lib   │                      ║
║  │  Quiz/Cards/Map │  │  SHA256 hash    │                      ║
║  │  XP + progress  │  │  stale/missing  │                      ║
║  └─────────────────┘  └─────────────────┘                      ║
╚════════════════════════════╤════════════════════════════════════╝
                             │
╔════════════════════════════▼════════════════════════════════════╗
║  STORAGE ABSTRACTION LAYER                                     ║
║                                                                 ║
║  Phase 1: SQLiteBackend    → local file (no setup)             ║
║  Phase 2: PostgresBackend  → cloud (swap backend class only)   ║
║                                                                 ║
║  Same interface: save_kb() / get_kb() / save_chat() etc.       ║
╚═════════════════════════════════════════════════════════════════╝

╔═════════════════════════════════════════════════════════════════╗
║  PRESENTATION LAYER                                            ║
║                                                                 ║
║  Desktop (Phase 1)     Web (Phase 2)     Mobile (Phase 2)      ║
║  ┌───────────────┐     ┌─────────────┐   ┌─────────────────┐  ║
║  │   Electron    │     │   Browser   │   │  React Native   │  ║
║  │  ┌─────────┐  │     │  ┌───────┐  │   │  ┌───────────┐  │  ║
║  │  │  React  │  │     │  │ React │  │   │  │  RN UI    │  │  ║
║  │  │  + MUI  │  │     │  │ + MUI │  │   │  │           │  │  ║
║  │  └────┬────┘  │     │  └───┬───┘  │   │  └─────┬─────┘  │  ║
║  └───────│───────┘     └──────│──────┘   └────────│────────┘  ║
║          │ localhost           │ HTTPS             │ HTTPS      ║
║          └────────────────────┴───────────────────┘           ║
║                               │                               ║
║                          Same FastAPI                         ║
║                          Same endpoints                       ║
║                          Zero rewrite ✅                       ║
╚═════════════════════════════════════════════════════════════════╝
```

---

## Desktop Shell Architecture (Phase 1)

```
Electron Main Process (Node.js)
│
├── On startup
│     ├── Spawn Python FastAPI backend (localhost:8765)
│     ├── Wait for backend health check (/health)
│     └── Open BrowserWindow → loads React app
│
├── IPC Bridge
│     ├── File open dialog (native OS picker)
│     ├── File drag-drop → forward path to React
│     └── System notifications
│
├── System Tray
│     ├── Show/hide window
│     └── Quit app + kill backend
│
└── On quit
      └── Kill Python FastAPI process
```

---

## Data Flow — Chat Request

```
User types message
       │
       ▼
React UI (ChatPage)
  → POST /chat/stream  (SSE request)
       │
       ▼
FastAPI /chat/stream endpoint
  → ChatService.stream(message, kb_id, use_web_search)
       │
       ├── KBService.search(message, kb_id)
       │       └── docnest HybridRetriever
       │               ├── FTS5 BM25 search
       │               ├── Dense ANN search
       │               ├── Section graph
       │               └── RRF fusion → top-k chunks
       │
       ├── [if web_search=true] SearchService.search(message)
       │       └── DuckDuckGo / Serper / Brave
       │
       ├── LLMService.stream(prompt + context)
       │       └── LiteLLM → provider API
       │
       └── SSE stream → token-by-token → React UI
```

---

## Data Flow — File Ingestion

```
User drops file onto KB
       │
       ▼
Electron drag-drop → file path → React
       │
       ▼
POST /kb/{id}/files  (multipart or path)
       │
       ▼
KBService.ingest(file_path, kb_id)
       │
       ├── FileService.parse(file_path)
       │       └── docnest parser → chunks + metadata
       │
       ├── docnest.index(chunks, kb_id)
       │       ├── SQLite FTS5 index
       │       └── ANN embedding index
       │
       ├── EventBus.emit("kb.file.added", {...})
       │       └── [Phase 2: triggers workflows]
       │
       └── Return file metadata → React updates file list
```

---

## Tool Registry Pattern (Agent-Ready)

Every capability in Knovex is registered as a `Tool` from day one:

```python
# tools/kb_search_tool.py
class KBSearchTool(BaseTool):
    name        = "kb_search"
    description = "Search a knowledge base using hybrid RAG (FTS5 + ANN). "
                  "Returns relevant chunks with source citations."
    args_schema = KBSearchInput   # Pydantic: query, kb_id, top_k

    async def _arun(self, query: str, kb_id: str, top_k: int = 5):
        return await kb_service.search(query, kb_id, top_k)

# tools/web_search_tool.py
class WebSearchTool(BaseTool):
    name        = "web_search"
    description = "Search the web using the configured search engine. "
                  "Returns title, URL, snippet for each result."
    args_schema = WebSearchInput  # Pydantic: query, num_results

    async def _arun(self, query: str, num_results: int = 5):
        return await search_service.search(query, num_results)
```

**Phase 2:** Hand these tools directly to LangGraph. No changes needed.

```python
# Phase 2 — just wire tools into LangGraph
from langgraph.prebuilt import create_react_agent

agent = create_react_agent(
    llm=litellm_model,
    tools=[KBSearchTool(), WebSearchTool(), SummarizeTool(), FileReadTool()]
)
```

---

## Event Bus Pattern

```python
# events/bus.py
class EventBus:
    def emit(self, event: str, payload: dict): ...
    def on(self, event: str, handler: callable): ...

# Phase 1 — in-process
bus = InProcessEventBus()

# Phase 2 — Redis pub/sub (swap class, same interface)
bus = RedisEventBus(redis_url=settings.redis_url)

# Usage in services (never changes between phases)
event_bus.emit("kb.file.added",   {"kb_id": ..., "file_id": ...})
event_bus.emit("chat.completed",  {"kb_id": ..., "tokens": ...})
event_bus.emit("kb.reindexed",    {"kb_id": ...})
```

---

## Storage Abstraction

```python
# storage/base.py  — abstract interface
class StorageBackend(ABC):
    async def create_kb(self, kb: KnowledgeBase) -> KnowledgeBase: ...
    async def get_kb(self, kb_id: str) -> KnowledgeBase: ...
    async def list_kbs(self) -> list[KnowledgeBase]: ...
    async def delete_kb(self, kb_id: str) -> None: ...
    async def add_file(self, kb_id: str, file: FileRecord) -> FileRecord: ...
    async def save_chat_message(self, msg: ChatMessage) -> None: ...
    async def get_chat_history(self, kb_id: str) -> list[ChatMessage]: ...

# Phase 1
class SQLiteBackend(StorageBackend): ...

# Phase 2 — swap in without changing any service code
class PostgresBackend(StorageBackend): ...
```

---

## Phase 1 → Phase 2 Upgrade Map

| Component | Phase 1 (Desktop) | Phase 2 (Cloud + Agents) |
|-----------|------------------|--------------------------|
| Database | SQLite (embedded, ships with app) | PostgreSQL on OUR server |
| Cache/Queue | In-process | Redis |
| Auth | Local config | JWT + OAuth |
| LLM calls | Sync/SSE | WebSocket streaming |
| Key storage | Encrypted local file | Key Vault — LLM proxy, keys never reach client |
| Agents | None | LangGraph multi-agent |
| Workflows | None | DAG engine + visual builder |
| Deployment | PyInstaller .exe | Docker + cloud (Railway/AWS) |
| Frontend | Electron desktop | Electron + Web + React Native |
| Storage | Local filesystem | S3 / object store |
| Learn Mode | Local generation | Shared sessions, social, voice |

---

## Security Considerations

- **API keys** stored encrypted in local config (Fernet symmetric encryption)
- **No telemetry** — zero data sent to external servers by default
- **CORS** locked to `localhost` only (no external origins in Phase 1)
- **Input validation** via Pydantic on all API endpoints
- **File sandbox** — file operations restricted to user-configured storage path
- **Phase 2** — JWT authentication, rate limiting, audit logging

---

## Performance Targets

| Operation | Target |
|-----------|--------|
| KB query (RAG) | < 100ms (docnest ~1ms/query) |
| Chat first token | < 2s |
| File ingestion (PDF ~20 pages) | < 5s |
| App cold start | < 3s |
| Settings save | < 50ms |
| Web search | < 2s |
| Learn session generation | < 5s |

---

## Storage Model — Desktop vs Cloud

**Critical rule: PostgreSQL is NEVER installed by the end user.**

```
Desktop App (any user — student, freelancer, employee)
─────────────────────────────────────────────────────
SQLite embedded — ships inside the app binary
Auto-created on first launch at:
  Windows  →  %APPDATA%\Knovex\knovex.db
  macOS    →  ~/Library/Application Support/Knovex/knovex.db
  Linux    →  ~/.local/share/Knovex/knovex.db

Zero installation. Zero configuration. Works offline.
User downloads .exe → double-clicks → app works.

Cloud Version (Phase 2 — OUR infrastructure)
─────────────────────────────────────────────
PostgreSQL + Redis running on Railway / AWS / GCP
WE manage the server. User just logs in with email.
User never installs, configures, or touches a database.

How VS Code, Obsidian, Notion Desktop all work:
  Local storage   = embedded SQLite (ships with app)
  Cloud storage   = their PostgreSQL servers
  User installs 0 databases in both cases
```

---

## File Integrity — Watcher + Hash Detection

Knovex detects stale and missing files automatically.

### File Record Model

```python
class FileRecord:
    id:               str       # UUID
    kb_id:            str       # parent KB
    path:             str       # absolute file path
    name:             str       # display name
    format:           str       # pdf | docx | txt | md | csv | udf
    size_bytes:       int
    content_hash:     str       # SHA256 at ingestion time
    status:           str       # pending|ingesting|ready|stale|missing|error
    version:          int       # increments on each re-index
    ingested_at:      datetime
    last_verified_at: datetime
```

### File Status State Machine

```
                   ┌─────────┐
     add file ────►│ PENDING │
                   └────┬────┘
                        │ background ingest starts
                   ┌────▼──────┐
                   │ INGESTING │◄──── re-index triggered
                   └────┬──────┘
              ┌─────────┴──────────┐
           success             failure
              │                    │
         ┌────▼────┐          ┌────▼────┐
         │  READY  │          │  ERROR  │
         └────┬────┘          └─────────┘
              │
    ┌─────────┼──────────┐
 hash        path        path
 changed    missing     changed
    │           │            │
┌───▼───┐  ┌───▼────┐       │
│ STALE │  │MISSING │  same as STALE
└───┬───┘  └───┬────┘
    │           │
 re-index   locate file
    │       + re-index
    └───────────┘
          │
     INGESTING → READY
```

### File Watcher Service

```python
# core/file_watcher.py
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class KnovexFileWatcher(FileSystemEventHandler):

    def on_modified(self, event):
        file = db.get_file_by_path(event.src_path)
        if file:
            new_hash = sha256_file(event.src_path)
            if new_hash != file.content_hash:
                db.update_status(file.id, "stale")
                event_bus.emit("kb.file.stale", {
                    "file_id": file.id,
                    "kb_id":   file.kb_id
                })
                # → UI shows ⚠️ Stale badge instantly

    def on_deleted(self, event):
        file = db.get_file_by_path(event.src_path)
        if file:
            db.update_status(file.id, "missing")
            event_bus.emit("kb.file.missing", {
                "file_id": file.id,
                "kb_id":   file.kb_id
            })
            # → UI shows ❌ Missing badge instantly
```

### Network Path Warning

```python
def is_network_path(path: str) -> bool:
    # UNC paths: \\server\share
    if path.startswith("\\\\") or path.startswith("//"):
        return True
    # Mapped drives on Windows (heuristic)
    return is_mapped_network_drive(path)

# On file add → warn user
if is_network_path(file_path):
    return Warning(
        "This file is on a network location. "
        "For best results copy it locally first. "
        "Network paths may be unreliable for indexing "
        "and will not be monitored for changes."
    )
```

---

## 3 Deployment Modes

### Mode 1 — Personal (Phase 1)

```
Desktop App
└── User enters own API keys in Settings
└── Keys encrypted in local config
└── SQLite embedded, fully offline
└── Works for: students, freelancers, individuals
```

### Mode 2 — Organisation (Phase 2 — Knovex Cloud Portal)

```
Admin (app.knovex.io)                50 Employees (desktop app)
─────────────────────                ──────────────────────────
1. Creates org "Acme Corp"
2. Enters company API keys
3. Sets policies                     4. Downloads Knovex
   (models, web search on/off)       5. Enters org code: ACME-2026
4. Invites 50 employees              6. Signs in with work email
                                     7. App authenticates → portal
                                     8. Portal proxies LLM calls
                                        Keys NEVER touch device
                                     9. Admin can revoke instantly

Portal features:
  ├── User management (invite, disable, roles)
  ├── API key management (enter once, all users get it)
  ├── Key rotation (update once → all 50 apps updated)
  ├── Policy engine (allowed LLMs, models, features)
  ├── Usage analytics (per-user cost, token count)
  └── SSO — Google Workspace, Azure AD (Phase 2b)
```

### Mode 3 — Self-hosted Enterprise (Phase 2)

```
IT Admin deploys Docker on company server
└── docker-compose up → Knovex backend running on intranet
└── API keys configured on company server
└── Employees point app at: https://knovex.acme.internal
└── Zero data leaves company network (air-gapped capable)
└── IT manages everything — updates, backups, scaling
└── Annual license model
```

### Mode Detection in Desktop App

```python
# On app startup — detect which mode to use
def detect_mode(config: AppConfig) -> DeploymentMode:
    if config.org_token or config.org_code:
        return DeploymentMode.ORGANIZATION   # Mode 2
    elif config.self_hosted_url:
        return DeploymentMode.SELF_HOSTED    # Mode 3
    else:
        return DeploymentMode.PERSONAL       # Mode 1 (default)
```

---

## Learn Mode Architecture

### Data Flow — Learn Session Generation

```
User selects source + format
       │
       ├── Source A: PDF from KB
       │       └── docnest extracts chunks + structure
       ├── Source B: Web URL
       │       └── scrape + clean via httpx + BeautifulSoup
       ├── Source C: Topic typed
       │       └── web search → content
       └── Source D: PDF + Web combined
               └── merge both

       ↓ all sources merge here

Content Processor
├── Chunk and summarize (docnest)
├── Extract key concepts + relationships
└── Build structured context dict

       ↓

LLM (LiteLLM — selected provider)
└── Prompt: "Generate a {format} session from this content
            Return structured JSON matching the schema for {format}"

       ↓

Structured JSON response
{
  "format":     "quiz",
  "topic":      "Photosynthesis",
  "difficulty": "high_school",
  "items": [
    {
      "question":    "What does chlorophyll do?",
      "options":     ["A", "B", "C", "D"],
      "correct":     "A",
      "explanation": "Chlorophyll absorbs light..."
    }
  ]
}

       ↓

React Interactive Components (Framer Motion + React Flow + Lottie)
├── <QuizSession data={quizData} />
├── <FlashcardDeck cards={cards} />
├── <MindMap nodes={nodes} edges={edges} />
├── <StoryMode chapters={chapters} />
├── <Timeline events={events} />
├── <BrainstormBoard concepts={concepts} />
└── <AnimatedExplainer steps={steps} />

       ↓

Gamification Engine
├── XP awarded on session complete
├── Streak updated
├── Badge check — topic mastered?
└── SQLite: update user_progress table
```

### Animation Stack (no GIF files needed)

| Library | Use case | Why |
|---------|---------|-----|
| Framer Motion | Card flips, transitions, entrance animations | Declarative, smooth 60fps |
| React Flow | Mind maps, brainstorm boards, node graphs | Interactive, zoomable |
| Lottie React | Complex vector animations (explanatory) | JSON-based, small files |
| Recharts | Interactive data charts and graphs | Responsive, animated |
| CSS keyframes | Simple moving objects, highlights | Zero dependency |

### Learn Session Database Schema

```sql
-- user progress per topic
CREATE TABLE learn_progress (
    id           TEXT PRIMARY KEY,
    topic        TEXT NOT NULL,
    format       TEXT NOT NULL,
    source_type  TEXT,          -- pdf | url | topic
    source_ref   TEXT,          -- file_id or URL or topic string
    score        REAL,          -- quiz accuracy 0-1
    xp_earned    INTEGER,
    completed_at DATETIME,
    duration_sec INTEGER
);

-- gamification
CREATE TABLE user_stats (
    id           TEXT PRIMARY KEY DEFAULT 'singleton',
    total_xp     INTEGER DEFAULT 0,
    level        INTEGER DEFAULT 1,
    streak_days  INTEGER DEFAULT 0,
    last_session DATE
);

-- spaced repetition for flashcards
CREATE TABLE flashcard_review (
    card_id      TEXT,
    topic        TEXT,
    ease         TEXT,          -- easy | okay | hard
    next_review  DATETIME,
    review_count INTEGER DEFAULT 0
);
```
