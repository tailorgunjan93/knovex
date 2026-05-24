<div align="center">

# Knovex

### AI-powered Desktop Knowledge Base

*Secure · Fast · Reliable · Cost-Effective*

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#)
[![Python](https://img.shields.io/badge/python-3.11+-green.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)
[![Powered by docnest](https://img.shields.io/badge/powered%20by-docnest--ai-purple.svg)](https://pypi.org/project/docnest-ai/)

**Knovex** is a local-first, AI-powered desktop knowledge base with an interactive learning engine. Drop in your documents, ask questions, summarize, search the web, and turn complex topics into animated, gamified learning sessions — all running on your machine.

Built on top of [docnest-ai](https://pypi.org/project/docnest-ai/) — a hybrid RAG engine with SQLite FTS5 + dense ANN + section graph retrieval.

</div>

---

## What is Knovex?

Knovex is a desktop application that runs completely **offline and local** — your files never leave your machine unless you explicitly enable web search or cloud sync.

- **Knowledge Base** — create named KBs, add files, read them inline, ask questions
- **Chat** — conversational QA over your KB with streaming responses and citations
- **Summarizer** — summarize a file or an entire KB in one click
- **Web Search** — optionally extend answers with live web results (DuckDuckGo, Serper, Brave)
- **Learn Mode** — turn any PDF or web topic into quizzes, flashcards, mind maps, timelines and animated explainers
- **Multi-LLM** — bring your own API key for OpenAI, Claude, Groq, Gemini, Cerebras, AWS Bedrock, or run fully offline with Ollama
- **3 deployment modes** — Personal (own keys), Organization (admin-managed keys), Self-hosted (enterprise Docker)

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

### ✨ Learn Mode
- Feed any PDF, web URL, or typed topic into an interactive learning session
- **Flash quizzes** — AI-generated multiple choice / true-false / fill-in-blank with scoring
- **Flashcard deck** — swipeable cards with spaced repetition
- **Animated mind map** — clickable concept graph built from your content
- **Story mode** — complex topic rewritten as a narrative with analogies
- **Timeline** — animated chronological view for sequential topics
- **ELI5 mode** — adjustable difficulty from Age 5 to Expert
- **Speed Learn** — timed sessions (5 min, 10 min, 30 min)
- **Brainstorm board** — web search + AI expand any concept visually
- **Gamification** — XP points, streaks, difficulty levels, achievement badges
- Web search enrichment — finds extra context for any topic

### ⚙️ Settings
- LLM: OpenAI, Anthropic (Claude), Groq, Gemini, Cerebras, AWS Bedrock, Ollama
- Per-provider model selection and API key storage (encrypted locally)
- Ollama auto-detection on localhost:11434
- Connection test before saving
- Web search engine: DuckDuckGo (free, no key) / Serper / Brave
- Theme: Light / Medium / Dark
- Custom KB storage path
- Deployment mode: Personal / Organization / Self-hosted

---

## Architecture Overview

Knovex uses a **fully decoupled** frontend/backend architecture. The FastAPI backend is a standalone portable API — the same backend code will power the cloud version, web app, and mobile app in Phase 2.

```
┌─────────────────────────────────────────────────────────────────┐
│  DESKTOP SHELL  (Electron)                                      │
│  Thin wrapper — spawns backend, manages window, tray, dialogs   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  FRONTEND  (React 18 + MUI v6 + TypeScript)               │  │
│  │  KB Manager · Chat · Learn Mode · Settings               │  │
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
│  Storage: SQLite embedded — zero setup, ships with app          │
│  (PostgreSQL only on OUR cloud server, never on user machine)   │
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
│   │   ├── pages/               KnowledgeBase, Chat, Learn, Settings
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
- [ ] Sprint 2: Knowledge Base + file watcher + hash detection
- [ ] Sprint 3: File Reader (inline in KB)
- [ ] Sprint 4: Chat + Summarizer + Web Search
- [ ] Sprint 5: Settings + polish + packaging
- [ ] Sprint 6: Learn Mode (interactive learning engine)

### Phase 2 — Cloud + Organisation + Agentic
- [ ] Knovex Cloud Portal (web admin — org key management, user management, analytics)
- [ ] 3 deployment modes: Personal / Organization (portal) / Self-hosted (Docker)
- [ ] LangGraph agent orchestration
- [ ] Visual workflow builder
- [ ] Cloud deployment (Railway / AWS) — PostgreSQL on OUR infra, not user machines
- [ ] Web app version
- [ ] Mobile app (React Native — same backend API)
- [ ] Team collaboration + shared KBs
- [ ] Plugin / connector marketplace
- [ ] Learn Mode: voice narration, social sharing, multiplayer sessions

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
