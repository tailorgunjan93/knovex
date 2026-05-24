<div align="center">

# Knovex

### AI-powered Desktop Knowledge Base

*Secure · Fast · Reliable · Cost-Effective*

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#)
[![Python](https://img.shields.io/badge/python-3.11+-green.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)
[![Powered by docnest](https://img.shields.io/badge/powered%20by-docnest--ai-purple.svg)](https://pypi.org/project/docnest-ai/)

**Knovex** is a local-first, AI-powered desktop knowledge base. Drop in your documents, ask questions, summarize, and search the web — all from one app, all running on your machine.

Built on top of [docnest-ai](https://pypi.org/project/docnest-ai/) — a hybrid RAG engine with SQLite FTS5 + dense ANN + section graph retrieval.

</div>

---

## What is Knovex?

Knovex turns your documents into a queryable knowledge base. It is a desktop application that runs completely **offline and local** — your files never leave your machine unless you explicitly enable web search.

- **Knowledge Base** — create named KBs, add files, read them inline, ask questions
- **Chat** — conversational QA over your KB with streaming responses and citations
- **Summarizer** — summarize a file or an entire KB in one click
- **Web Search** — optionally extend answers with live web results (DuckDuckGo, Serper, Brave)
- **Multi-LLM** — bring your own API key for OpenAI, Claude, Groq, Gemini, Cerebras, AWS Bedrock, or run fully offline with Ollama

---

## Key Features

### 📁 Knowledge Base + File Reader
- Create multiple named knowledge bases
- Add PDF, DOCX, TXT, MD, CSV, UDF files via drag-drop or file picker
- Auto-ingestion powered by docnest (FTS5 + ANN indexing)
- Click any file → opens inline reader with Q&A sidebar
- File-scoped questions (ask about one file only)
- Web search toggle alongside file reader

### 💬 Chat + Summarizer
- Conversational QA against a selected KB
- Streaming token-by-token responses
- Source citations — which file and section answered your question
- Persistent chat history per KB
- Summarizer tab — summarize a single file or the entire KB
- Optional web search integration in every chat

### ⚙️ Settings
- LLM: OpenAI, Anthropic (Claude), Groq, Gemini, Cerebras, AWS Bedrock, Ollama
- Per-provider model selection and API key storage (encrypted locally)
- Ollama auto-detection on localhost:11434
- Connection test before saving
- Web search engine: DuckDuckGo (free, no key) / Serper / Brave
- Theme: Light / Medium / Dark
- Custom KB storage path

---

## Architecture Overview

Knovex uses a **fully decoupled** frontend/backend architecture. The FastAPI backend is a standalone portable API — the same backend code will power the cloud version, web app, and mobile app in Phase 2.

```
┌─────────────────────────────────────────────────────────────────┐
│  DESKTOP SHELL  (Electron)                                      │
│  Thin wrapper — spawns backend, manages window, tray, dialogs   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  FRONTEND  (React 18 + MUI v6 + TypeScript)               │  │
│  │  KB Manager · Chat · File Reader · Settings               │  │
│  └───────────────────────┬───────────────────────────────────┘  │
└──────────────────────────│──────────────────────────────────────┘
                           │ REST + SSE  (localhost:8765)
┌──────────────────────────▼──────────────────────────────────────┐
│  BACKEND  (FastAPI + Python 3.11)                               │
│                                                                 │
│  API Routes: /kb  /chat  /search  /settings                     │
│  Streaming:  SSE for chat tokens · WebSocket (Phase 2)          │
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │  KB Service  │ │  LLM Service │ │  Search Service          │ │
│  │  docnest RAG │ │  LiteLLM     │ │  DDG / Serper / Brave    │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │  File Service│ │  Event Bus   │ │  Tool Registry           │ │
│  │  Parse+render│ │  in-process  │ │  Agent-ready tools       │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
│                                                                 │
│  Storage: SQLite  (Phase 2 → PostgreSQL + Redis)                │
└─────────────────────────────────────────────────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full design details.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Desktop Shell | Electron 33 | Cross-platform window, tray, OS dialogs |
| Frontend | React 18 + TypeScript | UI components |
| UI Library | MUI v6 | Design system |
| State | Zustand + TanStack Query v5 | UI state + server state |
| Build | Vite 5 + pnpm | Fast dev + bundling |
| Backend | FastAPI + Python 3.11 | REST API, streaming, async |
| RAG Engine | docnest-ai | Hybrid FTS5 + ANN retrieval |
| LLM Layer | LiteLLM | Unified multi-provider LLM |
| Database | SQLite | Local storage (Phase 1) |
| Web Search | duckduckgo-search / Serper / Brave | Live web results |
| Packaging | PyInstaller + electron-builder | Distributable app |

---

## Project Structure

```
knovex/
├── README.md
├── CHANGELOG.md
├── .gitignore
│
├── docs/
│   ├── ARCHITECTURE.md          Full system design
│   ├── IMPLEMENTATION_PLAN.md   Sprint-by-sprint build plan
│   ├── FEATURES.md              Complete feature specification
│   ├── API_SPEC.md              All API endpoints + contracts
│   └── TECH_STACK.md            Technology decisions + rationale
│
├── backend/                     FastAPI Python — standalone API
│   ├── api/                     Route handlers (kb, chat, search, settings)
│   ├── core/                    Business logic (KB, LLM, search, file services)
│   ├── tools/                   LangChain-compatible tools (agent-ready)
│   ├── models/                  Pydantic schemas
│   ├── storage/                 Storage abstraction (SQLite → PostgreSQL)
│   ├── events/                  In-process event bus
│   ├── requirements.txt
│   └── main.py
│
├── frontend/                    React + MUI — pure UI consumer
│   ├── src/
│   │   ├── pages/               KnowledgeBase, Chat, Settings
│   │   ├── components/          Layout, Sidebar, FileReader, shared
│   │   ├── store/               Zustand stores
│   │   ├── api/                 API client + typed calls
│   │   └── theme/               MUI theme (light/medium/dark)
│   ├── package.json
│   ├── vite.config.ts
│   └── index.html
│
└── desktop/                     Electron — thin shell only
    ├── main.js                  Main process (spawns backend, manages window)
    ├── preload.js               Context bridge
    └── package.json
```

---

## Roadmap

### Phase 1 — Desktop App *(current)*
- [x] Architecture + planning
- [ ] Project scaffold
- [ ] Sprint 1: Foundation (FastAPI + React + Electron shell)
- [ ] Sprint 2: Knowledge Base + File Reader
- [ ] Sprint 3: Chat + Summarizer
- [ ] Sprint 4: Web Search integration
- [ ] Sprint 5: Settings + polish + packaging

### Phase 2 — Agentic + Cloud
- [ ] LangGraph agent orchestration
- [ ] Visual workflow builder
- [ ] Cloud deployment (Railway / AWS)
- [ ] Web app version
- [ ] Mobile app (React Native — same backend API)
- [ ] Team collaboration + shared KBs
- [ ] Plugin / connector marketplace

---

## Getting Started

> 📋 **See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for the full build plan.**

*Setup instructions will be added as each sprint is completed.*

---

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full system architecture and design decisions |
| [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Sprint plan with tasks and milestones |
| [FEATURES.md](docs/FEATURES.md) | Complete feature specification |
| [API_SPEC.md](docs/API_SPEC.md) | All API endpoints and data contracts |
| [TECH_STACK.md](docs/TECH_STACK.md) | Technology choices and rationale |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

---

## About

Built by [Gunjan Tailor](https://github.com/tailorgunjan93) on top of [docnest-ai](https://pypi.org/project/docnest-ai/).

*Secure · Fast · Reliable · Cost-Effective*
