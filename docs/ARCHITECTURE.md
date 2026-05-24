# Knovex — System Architecture

*Secure · Fast · Reliable · Cost-Effective*

---

## Design Principles

1. **Decoupled frontend/backend** — FastAPI backend is a standalone portable API. Frontend is a pure consumer. Zero coupling between layers.
2. **Local-first** — All data stays on the user's machine. No cloud dependency in Phase 1.
3. **Agent-ready from day one** — Every capability is a registered Tool. Adding LangGraph agents in Phase 2 requires no rewrites.
4. **Async throughout** — All backend services use Python async/await. Long-running tasks never block the server.
5. **Storage abstraction** — SQLite in Phase 1 swaps to PostgreSQL in Phase 2 via a thin abstraction layer.
6. **Event-driven** — All state changes emit events. Workflow triggers slot in without modifying core services.

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
| Database | SQLite (local) | PostgreSQL |
| Cache/Queue | In-process | Redis |
| Auth | Local config | JWT + OAuth |
| LLM calls | Sync/SSE | WebSocket streaming |
| Agents | None | LangGraph multi-agent |
| Workflows | None | DAG engine + visual builder |
| Deployment | PyInstaller .exe | Docker + cloud (Railway/AWS) |
| Frontend | Electron | Electron + Web + React Native |
| Storage | Local filesystem | S3 / object store |

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
