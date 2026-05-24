# Knovex — Feature Specification

*Phase 1: Desktop App*

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
| LangGraph multi-agent chat | Chat |
| Visual workflow builder | New: Workflows |
| Workflow triggers (file added, schedule) | Workflows |
| Cloud sync | KB |
| Shared / team KBs | KB |
| User accounts + JWT auth | App |
| Web app version | Frontend |
| Mobile app (React Native) | Frontend |
| Plugin / connector marketplace | New: Plugins |
| MCP server (expose Knovex as tool) | Backend |
| Auto-updater | Desktop |
| Usage analytics dashboard | New: Analytics |
