# Knovex — API Specification

Base URL (local): `http://localhost:8765`
API Version: `v1`
All endpoints prefixed: `/api/v1/`

---

## Conventions

- All requests/responses: `application/json`
- Streaming: `text/event-stream` (SSE)
- Errors: `{ "error": "message", "code": "ERROR_CODE", "detail": {} }`
- Timestamps: ISO 8601 (`2026-05-24T12:00:00Z`)
- IDs: UUID v4 strings

---

## Health

### `GET /health`
Returns backend status and version.

**Response**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "docnest_version": "0.6.0",
  "ollama_detected": true,
  "ollama_url": "http://localhost:11434"
}
```

---

## Knowledge Base

### `POST /api/v1/kb`
Create a new knowledge base.

**Request**
```json
{
  "name": "Research Papers",
  "color": "#7C3AED",
  "icon": "folder"
}
```

**Response** `201 Created`
```json
{
  "id": "uuid",
  "name": "Research Papers",
  "color": "#7C3AED",
  "icon": "folder",
  "created_at": "2026-05-24T12:00:00Z",
  "updated_at": "2026-05-24T12:00:00Z",
  "stats": {
    "file_count": 0,
    "total_size_bytes": 0,
    "total_chunks": 0
  }
}
```

---

### `GET /api/v1/kb`
List all knowledge bases.

**Response** `200 OK`
```json
{
  "kbs": [
    {
      "id": "uuid",
      "name": "Research Papers",
      "color": "#7C3AED",
      "icon": "folder",
      "created_at": "...",
      "updated_at": "...",
      "stats": { "file_count": 5, "total_size_bytes": 10485760, "total_chunks": 243 }
    }
  ]
}
```

---

### `GET /api/v1/kb/{kb_id}`
Get a single knowledge base.

**Response** `200 OK` — same shape as single KB object above.

---

### `PUT /api/v1/kb/{kb_id}`
Rename or update a knowledge base.

**Request**
```json
{ "name": "New Name", "color": "#10B981", "icon": "book" }
```

**Response** `200 OK` — updated KB object.

---

### `DELETE /api/v1/kb/{kb_id}`
Delete a knowledge base and all its files + index.

**Response** `204 No Content`

---

### `POST /api/v1/kb/{kb_id}/reindex`
Rebuild the search index for the KB.

**Response** `202 Accepted`
```json
{ "task_id": "uuid", "status": "started" }
```

---

## Files

### `POST /api/v1/kb/{kb_id}/files`
Add a file to a KB. Starts ingestion in background.

**Request** — multipart/form-data OR JSON path
```json
{ "file_path": "/absolute/path/to/document.pdf" }
```

**Response** `202 Accepted`
```json
{
  "id": "uuid",
  "kb_id": "uuid",
  "name": "document.pdf",
  "format": "pdf",
  "size_bytes": 524288,
  "status": "pending",
  "added_at": "2026-05-24T12:00:00Z"
}
```

---

### `GET /api/v1/kb/{kb_id}/files`
List all files in a KB.

**Response** `200 OK`
```json
{
  "files": [
    {
      "id": "uuid",
      "kb_id": "uuid",
      "name": "document.pdf",
      "format": "pdf",
      "size_bytes": 524288,
      "status": "ready",
      "chunk_count": 47,
      "added_at": "...",
      "ingested_at": "..."
    }
  ]
}
```

---

### `GET /api/v1/kb/{kb_id}/files/{file_id}/status`
Get ingestion status for a file.

**Response** `200 OK`
```json
{
  "id": "uuid",
  "status": "ingesting",
  "progress": 0.6,
  "chunks_indexed": 28,
  "error": null
}
```
Status values: `pending` | `ingesting` | `ready` | `error`

---

### `DELETE /api/v1/kb/{kb_id}/files/{file_id}`
Remove a file from a KB (removes from index too).

**Response** `204 No Content`

---

### `POST /api/v1/kb/{kb_id}/upload`
Upload a file to a KB via browser multipart form (no Electron file picker required).

**Request** — `multipart/form-data`
- `file`: the binary file content (`UploadFile`)

Supports: `.pdf`, `.docx`, `.txt`, `.md`, `.csv`, `.udf`

File is saved to `data_dir/kb_uploads/{kb_id}/{uuid}/{filename}` then ingested via the standard pipeline.

**Response** `202 Accepted`
```json
{
  "id": "uuid",
  "kb_id": "uuid",
  "name": "document.pdf",
  "format": "pdf",
  "size_bytes": 524288,
  "status": "pending",
  "added_at": "2026-05-28T12:00:00Z"
}
```

---

### `GET /api/v1/kb/{kb_id}/files/{file_id}/content`
Get rendered file content for the reader.

**Query params:** `?page=1` (for paginated formats like PDF)

**Response** `200 OK`
```json
{
  "id": "uuid",
  "name": "document.pdf",
  "format": "pdf",
  "total_pages": 12,
  "current_page": 1,
  "content": {
    "type": "pdf",
    "text": "...",
    "structured": []
  }
}
```

---

### `POST /api/v1/kb/{kb_id}/files/{file_id}/ask`
Ask a question scoped to a single file. Streams via SSE.

**Request**
```json
{
  "question": "What is the main conclusion?",
  "use_web_search": false
}
```

**Response** — SSE stream
```
data: {"type": "token", "content": "The main "}
data: {"type": "token", "content": "conclusion is "}
data: {"type": "sources", "sources": [{"file": "doc.pdf", "section": "Conclusion", "page": 11}]}
data: {"type": "done"}
```

---

## Chat

### `POST /api/v1/chat/sessions`
Create a new chat session for a KB.

**Request**
```json
{ "kb_id": "uuid", "title": "My Research Chat" }
```

**Response** `201 Created`
```json
{
  "id": "uuid",
  "kb_id": "uuid",
  "title": "My Research Chat",
  "created_at": "...",
  "message_count": 0
}
```

---

### `GET /api/v1/chat/sessions`
List all chat sessions, optionally filtered by KB.

**Query:** `?kb_id=uuid`

**Response** `200 OK`
```json
{ "sessions": [ { "id": "...", "kb_id": "...", "title": "...", "created_at": "...", "message_count": 12 } ] }
```

---

### `GET /api/v1/chat/sessions/{session_id}/messages`
Get message history for a session.

**Response** `200 OK`
```json
{
  "session_id": "uuid",
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "What is RAG?",
      "created_at": "...",
      "sources": []
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "RAG stands for Retrieval-Augmented Generation...",
      "created_at": "...",
      "sources": [
        { "file": "rag_paper.pdf", "section": "Abstract", "page": 1 }
      ],
      "web_sources": []
    }
  ]
}
```

---

### `POST /api/v1/chat/sessions/{session_id}/stream`
Send a message and stream the response via SSE.

**Request**
```json
{
  "message": "Explain the retrieval mechanism",
  "use_web_search": true
}
```

**Response** — SSE stream
```
data: {"type": "token", "content": "The retrieval "}
data: {"type": "token", "content": "mechanism works by "}
data: {"type": "sources", "sources": [{"file": "rag.pdf", "section": "Methods", "page": 3}]}
data: {"type": "web_sources", "sources": [{"title": "...", "url": "...", "snippet": "..."}]}
data: {"type": "done", "message_id": "uuid"}
```

---

### `DELETE /api/v1/chat/sessions/{session_id}`
Delete a chat session and all its messages.

**Response** `204 No Content`

---

### `GET /api/v1/chat/sessions/{session_id}/export`
Export chat session as markdown.

**Response** `200 OK` — `text/markdown`

---

## Summarizer

### `POST /api/v1/summarize/file`
Summarize a single file. Streams via SSE.

**Request**
```json
{
  "kb_id": "uuid",
  "file_id": "uuid",
  "length": "brief"
}
```
Length values: `brief` | `detailed`

**Response** — SSE stream (same token/done format as chat)

---

### `POST /api/v1/summarize/kb`
Summarize an entire knowledge base. Streams via SSE.

**Request**
```json
{
  "kb_id": "uuid",
  "length": "detailed"
}
```

**Response** — SSE stream

---

## Web Search

### `POST /api/v1/search/web`
Perform a web search using the configured engine.

**Request**
```json
{
  "query": "latest research on RAG systems",
  "num_results": 5
}
```

**Response** `200 OK`
```json
{
  "engine": "duckduckgo",
  "query": "latest research on RAG systems",
  "results": [
    {
      "title": "...",
      "url": "https://...",
      "snippet": "..."
    }
  ]
}
```

---

## Settings

### `GET /api/v1/settings`
Get current app settings. API keys are masked.

**Response** `200 OK`
```json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "api_key": "sk-...****",
    "base_url": "http://localhost:11434",
    "aws_region": "us-east-1"
  },
  "search": {
    "engine": "duckduckgo",
    "api_key": ""
  },
  "theme": "dark",
  "kb_storage_path": "/Users/gunjan/.local/share/Knovex",
  "backend_port": 8765
}
```

---

### `PUT /api/v1/settings`
Update settings. Full object required.

**Request** — same shape as GET response (with real API keys in full)

**Response** `200 OK` — updated settings (keys masked)

---

### `POST /api/v1/settings/test-llm`
Test LLM connection with current settings.

**Response** `200 OK`
```json
{ "success": true, "latency_ms": 412, "model": "gpt-4o-mini", "error": null }
```

---

### `GET /api/v1/settings/ollama/detect`
Auto-detect running Ollama instance.

**Response** `200 OK`
```json
{
  "detected": true,
  "url": "http://localhost:11434",
  "models": ["llama3.2:latest", "mistral:latest", "codellama:latest"]
}
```

---

### `GET /api/v1/settings/llm/models`
Get available models for a provider.

**Query:** `?provider=openai`

**Response** `200 OK`
```json
{
  "provider": "openai",
  "models": [
    { "id": "gpt-4o", "name": "GPT-4o", "context_window": 128000 },
    { "id": "gpt-4o-mini", "name": "GPT-4o Mini", "context_window": 128000 }
  ]
}
```

---

## Learn Mode

### `POST /api/v1/learn/sessions`
Generate a new learn session. Streams structured content via SSE.

**Request**
```json
{
  "topic": "Machine Learning",
  "format": "story",
  "difficulty": "beginner",
  "source_type": "topic"
}
```

Format values: `quiz` | `flashcard` | `mindmap` | `story` | `timeline` | `eli5` | `speedlearn` | `brainstorm` | `guided`
Difficulty values: `beginner` | `intermediate` | `expert`
Source type values: `topic` | `url` | `kb`

**Response** — SSE stream
```
data: {"type": "token", "content": "Once upon a time "}
data: {"type": "token", "content": "in the land of algorithms..."}
data: {"type": "done", "session_id": "uuid", "xp_earned": 25}
```

JSON formats (`quiz`, `flashcard`, `mindmap`, `timeline`, `guided`) stream structured JSON tokens.
Text formats (`story`, `eli5`, `speedlearn`, `brainstorm`) stream raw markdown tokens in real-time.

---

### `GET /api/v1/learn/sessions`
List all learn sessions for the current user.

**Response** `200 OK`
```json
{
  "sessions": [
    {
      "id": "uuid",
      "topic": "Machine Learning",
      "format": "story",
      "difficulty": "beginner",
      "status": "ready",
      "xp_earned": 25,
      "created_at": "2026-05-28T12:00:00Z"
    }
  ]
}
```

---

### `GET /api/v1/learn/sessions/{session_id}`
Get full session content.

**Response** `200 OK`
```json
{
  "id": "uuid",
  "topic": "Machine Learning",
  "format": "story",
  "difficulty": "beginner",
  "status": "ready",
  "content": { ... },
  "xp_earned": 25,
  "created_at": "2026-05-28T12:00:00Z"
}
```

---

### `DELETE /api/v1/learn/sessions/{session_id}`
Delete a learn session.

**Response** `204 No Content`

---

### `GET /api/v1/learn/stats`
Get user progress stats.

**Response** `200 OK`
```json
{
  "total_xp": 1250,
  "level": 3,
  "streak_days": 5,
  "last_session": "2026-05-28"
}
```

---

## Tools Registry (Phase 2 preview)

### `GET /api/v1/tools`
List all registered tools (for agent discovery).

**Response** `200 OK`
```json
{
  "tools": [
    {
      "name": "kb_search",
      "description": "Search a knowledge base using hybrid RAG",
      "args_schema": { "query": "string", "kb_id": "string", "top_k": "int" }
    },
    {
      "name": "web_search",
      "description": "Search the web using the configured engine",
      "args_schema": { "query": "string", "num_results": "int" }
    },
    {
      "name": "summarize",
      "description": "Summarize a file or knowledge base",
      "args_schema": { "kb_id": "string", "file_id": "string?", "length": "string" }
    },
    {
      "name": "file_read",
      "description": "Read and return the content of a file",
      "args_schema": { "kb_id": "string", "file_id": "string", "page": "int?" }
    }
  ]
}
```

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `KB_NOT_FOUND` | 404 | Knowledge base does not exist |
| `FILE_NOT_FOUND` | 404 | File does not exist in KB |
| `FILE_NOT_READY` | 409 | File still ingesting — not queryable yet |
| `UNSUPPORTED_FORMAT` | 422 | File format not supported |
| `LLM_ERROR` | 502 | LLM provider returned an error |
| `LLM_RATE_LIMIT` | 429 | LLM rate limit hit |
| `LLM_NOT_CONFIGURED` | 400 | No LLM provider configured |
| `SEARCH_ERROR` | 502 | Web search failed |
| `SETTINGS_INVALID` | 422 | Invalid settings payload |
| `INGESTION_FAILED` | 500 | docnest ingestion error |
