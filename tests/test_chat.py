"""
Chat Service unit tests — Sprint 4

Uses in-memory stubs for all external dependencies:
    InMemoryChatRepository  — pure-Python IChatRepository (no SQLite)
    StubWebSearchAdapter    — deterministic web search results
    Mocked LLMService       — async generator yielding canned tokens
    Mocked SQLiteBackend    — returns configurable rows for FTS5 queries

Coverage:
  - Session CRUD (create, get, list, rename, delete)
  - Message retrieval
  - Markdown export
  - stream_message — token events, done event, source / web-source events,
    message persistence, error event on LLM failure, missing session
  - ChatSession domain rules (rename, touch)
  - SearchService + StubWebSearchAdapter
"""

from __future__ import annotations

import json
import time
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.adapters.web_search import SearchResult, StubWebSearchAdapter
from backend.core.chat_service import ChatService
from backend.core.domain.chat import ChatMessage, ChatSession
from backend.core.providers.base import ProviderCredentials
from backend.core.search_service import SearchService
from backend.storage.repositories.base import EntityNotFoundError
from backend.storage.repositories.chat_repository import IChatRepository

# ---------------------------------------------------------------------------
# In-memory repository — no SQLite, no I/O, fully synchronous-safe
# ---------------------------------------------------------------------------

class InMemoryChatRepository(IChatRepository):
    """Pure-Python IChatRepository for unit tests."""

    def __init__(self) -> None:
        super().__init__(backend=None)   # SQLiteRepository requires this arg
        self._sessions: dict[str, ChatSession] = {}
        self._messages: dict[str, list[ChatMessage]] = {}  # session_id → msgs

    # ── Sessions ──────────────────────────────────────────────────────────

    async def find_by_id(self, entity_id: str) -> ChatSession | None:
        return self._sessions.get(entity_id)

    async def find_all(self) -> list[ChatSession]:
        return list(self._sessions.values())

    async def find_sessions_by_kb(self, kb_id: str) -> list[ChatSession]:
        return [s for s in self._sessions.values() if s.kb_id == kb_id]

    async def save(self, session: ChatSession) -> ChatSession:
        self._sessions[session.id] = session
        return session

    async def delete(self, entity_id: str) -> None:
        self._sessions.pop(entity_id, None)
        self._messages.pop(entity_id, None)

    async def exists(self, entity_id: str) -> bool:
        return entity_id in self._sessions

    # ── Messages ──────────────────────────────────────────────────────────

    async def find_messages(self, session_id: str) -> list[ChatMessage]:
        return list(self._messages.get(session_id, []))

    async def save_message(self, message: ChatMessage) -> ChatMessage:
        self._messages.setdefault(message.session_id, []).append(message)
        return message

    async def delete_message(self, message_id: str) -> None:
        for msgs in self._messages.values():
            for i, m in enumerate(msgs):
                if m.id == message_id:
                    msgs.pop(i)
                    return


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_creds() -> ProviderCredentials:
    return ProviderCredentials(api_key="test-key")


def _make_backend(rows: list[dict] | None = None):
    """Stub SQLiteBackend — fetchall returns *rows* for any query."""
    backend = MagicMock()
    backend.fetchall = AsyncMock(return_value=rows or [])
    backend.fetchone = AsyncMock(return_value=None)
    return backend


def _make_svc(
    tokens: list[str] | None = None,
    search_results: list[SearchResult] | None = None,
    backend_rows: list[dict] | None = None,
) -> tuple[ChatService, InMemoryChatRepository]:
    """
    Factory: build a ChatService wired with all-stub dependencies.

    :param tokens:         LLM tokens to yield; defaults to ["Hello", " world"].
    :param search_results: Web search results; defaults to empty.
    :param backend_rows:   SQLite rows returned by fetchall (KB chunk lookup).
    """
    tokens = tokens or ["Hello", " world"]
    chat_repo = InMemoryChatRepository()

    llm_svc = MagicMock()

    async def _stream_gen(*args, **kwargs):
        for token in tokens:
            yield token

    llm_svc.stream = _stream_gen

    stub_adapter = StubWebSearchAdapter(results=search_results or [])
    search_svc = SearchService(adapter=stub_adapter)

    svc = ChatService(
        chat_repo=chat_repo,
        file_repo=MagicMock(),
        backend=_make_backend(backend_rows),
        llm_svc=llm_svc,
        search_svc=search_svc,
    )
    return svc, chat_repo


async def _drain(gen) -> list[str]:
    """Drain an async generator into a list of strings."""
    events: list[str] = []
    async for event in gen:
        events.append(event)
    return events


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

async def test_create_session_defaults():
    svc, _ = _make_svc()
    session = await svc.create_session()
    assert session.title == "New Chat"
    assert session.kb_id is None
    assert session.id  # non-empty UUID string


async def test_create_session_with_kb_and_title():
    svc, _ = _make_svc()
    session = await svc.create_session(kb_id="kb-abc", title="My Chat")
    assert session.title == "My Chat"
    assert session.kb_id == "kb-abc"


async def test_get_session_found():
    svc, _ = _make_svc()
    created = await svc.create_session(title="Test Session")
    retrieved = await svc.get_session(created.id)
    assert retrieved.id == created.id
    assert retrieved.title == "Test Session"


async def test_get_session_not_found_raises():
    svc, _ = _make_svc()
    with pytest.raises(EntityNotFoundError):
        await svc.get_session("nonexistent-id")


async def test_list_sessions_empty():
    svc, _ = _make_svc()
    sessions = await svc.list_sessions()
    assert sessions == []


async def test_list_sessions_returns_all():
    svc, _ = _make_svc()
    await svc.create_session(title="Alpha")
    await svc.create_session(title="Beta")
    sessions = await svc.list_sessions()
    assert len(sessions) == 2
    assert {s.title for s in sessions} == {"Alpha", "Beta"}


async def test_list_sessions_filtered_by_kb():
    svc, _ = _make_svc()
    await svc.create_session(kb_id="kb-1", title="KB1 chat")
    await svc.create_session(kb_id="kb-2", title="KB2 chat")
    await svc.create_session(title="No KB")

    kb1 = await svc.list_sessions(kb_id="kb-1")
    assert len(kb1) == 1
    assert kb1[0].kb_id == "kb-1"


async def test_rename_session_succeeds():
    svc, _ = _make_svc()
    session = await svc.create_session(title="Old Title")
    renamed = await svc.rename_session(session.id, "New Title")
    assert renamed.title == "New Title"


async def test_rename_session_blank_raises():
    svc, _ = _make_svc()
    session = await svc.create_session()
    with pytest.raises(ValueError, match="blank"):
        await svc.rename_session(session.id, "   ")


async def test_delete_session_removes_it():
    svc, _ = _make_svc()
    session = await svc.create_session()
    await svc.delete_session(session.id)
    with pytest.raises(EntityNotFoundError):
        await svc.get_session(session.id)


async def test_get_messages_empty():
    svc, _ = _make_svc()
    session = await svc.create_session()
    msgs = await svc.get_messages(session.id)
    assert msgs == []


# ---------------------------------------------------------------------------
# Markdown export
# ---------------------------------------------------------------------------

async def test_export_session_empty_body():
    svc, _ = _make_svc()
    session = await svc.create_session(title="Empty Session")
    md = await svc.export_session(session.id)
    assert "# Empty Session" in md


async def test_export_session_includes_messages_and_sources():
    svc, repo = _make_svc()
    session = await svc.create_session(title="Export Test")

    user_msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=session.id,
        role="user",
        content="What is Knovex?",
    )
    asst_msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=session.id,
        role="assistant",
        content="Knovex is a local-first AI knowledge base.",
        sources=[{"file": "readme.md", "section": "intro", "page": None}],
    )
    await repo.save_message(user_msg)
    await repo.save_message(asst_msg)

    md = await svc.export_session(session.id)
    assert "# Export Test" in md
    assert "What is Knovex?" in md
    assert "Knovex is a local-first" in md
    assert "readme.md" in md


# ---------------------------------------------------------------------------
# stream_message
# ---------------------------------------------------------------------------

async def test_stream_emits_token_events():
    svc, _ = _make_svc(tokens=["Hello", " world"])
    session = await svc.create_session()
    events = await _drain(svc.stream_message(
        session_id=session.id,
        user_message="Hi",
        provider="openai",
        model="gpt-4o-mini",
        credentials=_make_creds(),
    ))
    token_events = [e for e in events if '"type": "token"' in e]
    assert len(token_events) == 2


async def test_stream_ends_with_done_event():
    svc, _ = _make_svc(tokens=["OK"])
    session = await svc.create_session()
    events = await _drain(svc.stream_message(
        session_id=session.id,
        user_message="Ping",
        provider="openai",
        model="gpt-4o-mini",
        credentials=_make_creds(),
    ))
    last = events[-1]
    parsed = json.loads(last[len("data: "):])
    assert parsed["type"] == "done"
    assert "message_id" in parsed


async def test_stream_persists_user_and_assistant_messages():
    svc, repo = _make_svc(tokens=["Reply text"])
    session = await svc.create_session()
    await _drain(svc.stream_message(
        session_id=session.id,
        user_message="Hello there",
        provider="openai",
        model="gpt-4o-mini",
        credentials=_make_creds(),
    ))
    messages = await svc.get_messages(session.id)
    assert len(messages) == 2
    assert messages[0].role == "user"
    assert messages[0].content == "Hello there"
    assert messages[1].role == "assistant"
    assert messages[1].content == "Reply text"


async def test_stream_session_not_found_raises():
    svc, _ = _make_svc()
    with pytest.raises(EntityNotFoundError):
        await _drain(svc.stream_message(
            session_id="ghost-session",
            user_message="Hello",
            provider="openai",
            model="gpt-4o-mini",
            credentials=_make_creds(),
        ))


async def test_stream_emits_sources_when_kb_has_chunks():
    backend_rows = [
        {
            "content": "Knovex is a local-first app.",
            "section": "intro",
            "page": 1,
            "file_id": "f1",
            "file_name": "readme.md",
        }
    ]
    svc, _ = _make_svc(tokens=["Answer"], backend_rows=backend_rows)
    session = await svc.create_session(kb_id="kb-test")
    events = await _drain(svc.stream_message(
        session_id=session.id,
        user_message="What is Knovex?",
        provider="openai",
        model="gpt-4o-mini",
        credentials=_make_creds(),
    ))
    source_events = [e for e in events if '"type": "sources"' in e]
    assert len(source_events) == 1
    parsed = json.loads(source_events[0][len("data: "):])
    assert parsed["sources"][0]["file"] == "readme.md"


async def test_stream_emits_web_sources_when_search_enabled():
    web_results = [
        SearchResult(
            title="Knovex Page",
            url="https://example.com/knovex",
            snippet="Knovex is...",
        )
    ]
    svc, _ = _make_svc(tokens=["Web answer"], search_results=web_results)
    session = await svc.create_session()
    events = await _drain(svc.stream_message(
        session_id=session.id,
        user_message="Tell me about Knovex",
        provider="openai",
        model="gpt-4o-mini",
        credentials=_make_creds(),
        use_web_search=True,
        search_engine="duckduckgo",
    ))
    web_events = [e for e in events if '"type": "web_sources"' in e]
    assert len(web_events) == 1
    parsed = json.loads(web_events[0][len("data: "):])
    assert parsed["sources"][0]["url"] == "https://example.com/knovex"


def _capturing_search_svc(captured: dict) -> SearchService:
    """A SearchService whose adapter records the query it was asked to search."""
    class _CapturingAdapter(StubWebSearchAdapter):
        async def search(self, query, num_results=5, api_key="", base_url=""):
            captured["query"] = query
            return [SearchResult(title="H", url="https://h", snippet="s")]
    return SearchService(adapter=_CapturingAdapter())


async def _svc_with_search(search_svc: SearchService) -> tuple[ChatService, InMemoryChatRepository]:
    chat_repo = InMemoryChatRepository()
    llm_svc = MagicMock()

    async def _gen(*a, **k):
        yield "ok"

    llm_svc.stream = _gen
    svc = ChatService(
        chat_repo=chat_repo, file_repo=MagicMock(), backend=_make_backend(None),
        llm_svc=llm_svc, search_svc=search_svc,
    )
    return svc, chat_repo


async def test_force_news_frames_search_query_as_news():
    """
    `/news` (force_news) must route to news: the SEARCH query is news-framed even
    when the user's message has no news words — so the existing is_news_query
    routing sends it to the news endpoint. The user's message itself is untouched.
    """
    captured: dict = {}
    svc, _ = await _svc_with_search(_capturing_search_svc(captured))
    session = await svc.create_session()
    await _drain(svc.stream_message(
        session_id=session.id, user_message="bitcoin", provider="openai",
        model="gpt-4o-mini", credentials=_make_creds(),
        use_web_search=True, search_engine="duckduckgo", force_news=True,
    ))
    assert "news" in captured["query"].lower()
    assert "bitcoin" in captured["query"].lower()


async def test_no_force_news_searches_the_raw_message():
    captured: dict = {}
    svc, _ = await _svc_with_search(_capturing_search_svc(captured))
    session = await svc.create_session()
    await _drain(svc.stream_message(
        session_id=session.id, user_message="bitcoin", provider="openai",
        model="gpt-4o-mini", credentials=_make_creds(),
        use_web_search=True, search_engine="duckduckgo",
    ))
    assert captured["query"] == "bitcoin"


async def test_stream_emits_error_event_on_llm_failure():
    """LLM error is caught and emitted as an error SSE event; stream doesn't crash."""
    svc, _ = _make_svc()

    async def _failing_stream(*args, **kwargs):
        raise RuntimeError("LLM unavailable")
        yield  # makes this an async generator

    svc._llm_svc.stream = _failing_stream
    session = await svc.create_session()

    events = await _drain(svc.stream_message(
        session_id=session.id,
        user_message="Fail me",
        provider="openai",
        model="gpt-4o-mini",
        credentials=_make_creds(),
    ))
    error_events = [e for e in events if '"type": "error"' in e]
    assert len(error_events) == 1
    parsed = json.loads(error_events[0][len("data: "):])
    assert "LLM unavailable" in parsed["error"]


async def test_stream_no_sources_without_kb():
    """Session without kb_id should produce no sources event."""
    svc, _ = _make_svc(tokens=["Fine"])
    session = await svc.create_session()   # kb_id=None
    events = await _drain(svc.stream_message(
        session_id=session.id,
        user_message="Hi",
        provider="openai",
        model="gpt-4o-mini",
        credentials=_make_creds(),
    ))
    source_events = [e for e in events if '"type": "sources"' in e]
    assert source_events == []


async def test_stream_assistant_message_carries_sources():
    """After streaming, the persisted assistant message has sources populated."""
    backend_rows = [
        {
            "content": "Content here",
            "section": "s1",
            "page": 1,
            "file_id": "f1",
            "file_name": "doc.pdf",
        }
    ]
    svc, repo = _make_svc(tokens=["Answer"], backend_rows=backend_rows)
    session = await svc.create_session(kb_id="kb-x")
    await _drain(svc.stream_message(
        session_id=session.id,
        user_message="Summarize",
        provider="openai",
        model="gpt-4o-mini",
        credentials=_make_creds(),
    ))
    messages = await svc.get_messages(session.id)
    assistant = messages[-1]
    assert assistant.role == "assistant"
    assert len(assistant.sources) == 1
    assert assistant.sources[0]["file"] == "doc.pdf"


# ---------------------------------------------------------------------------
# Hybrid retrieval — graceful degradation when the dense stack is absent
# ---------------------------------------------------------------------------

async def test_retrieve_hybrid_falls_back_to_fts5_when_dense_stack_missing(monkeypatch):
    """
    RCA 2026-06-08: the packaged app does NOT bundle numpy/faiss, so importing
    `backend.adapters.vector_index` raises ModuleNotFoundError. That import used
    to sit OUTSIDE the FTS5-fallback try in `_retrieve_hybrid`, so a chat with a
    KB selected crashed mid-stream → the renderer showed a bare "network error".

    Forcing the import to fail must now degrade to FTS5-only, never raise.
    """
    import sys

    fts_row = {
        "id": "c1", "content": "hello world", "section": "S", "page": 1,
        "file_id": "f1", "kb_id": "kb1", "file_name": "doc.txt",
    }
    svc, _ = _make_svc(backend_rows=[fts_row])

    # Simulate the packaged app: importing the dense stack fails.
    monkeypatch.setitem(sys.modules, "backend.adapters.vector_index", None)

    # Must not raise — degrades to FTS5.
    rows = await svc._retrieve_hybrid(["kb1"], "hello")
    assert isinstance(rows, list)


# ---------------------------------------------------------------------------
# Web-search grounding — the system prompt must tell the model to USE web results
# ---------------------------------------------------------------------------

def test_build_messages_adds_web_grounding_directive_when_web_context_present():
    """
    RCA 2026-06-08 (web search): with web results in the prompt, gpt-oss still
    replied "I don't have real-time access". The system prompt must explicitly
    instruct the model to use the live results and not claim lack of access.
    """
    svc, _ = _make_svc()
    session = ChatSession(id="s1", title="t")
    msgs = svc._build_messages(
        session=session, history=[], user_message="today's news",
        kb_context="", web_context="[WEB] NPR\nhttps://npr.org\nHeadline text",
        kb_ids=None, attached_context=None,
    )
    system = next(m for m in msgs if m["role"] == "system")["content"].lower()
    assert "live web results" in system
    assert "real-time" in system
    assert "never reply that you lack real-time access" in system
    # The results themselves ride in the final user message.
    assert "Web Search Results" in msgs[-1]["content"]


def test_build_messages_omits_web_directive_without_web_context():
    svc, _ = _make_svc()
    session = ChatSession(id="s1", title="t")
    msgs = svc._build_messages(
        session=session, history=[], user_message="hi",
        kb_context="", web_context="", kb_ids=None, attached_context=None,
    )
    system = next(m for m in msgs if m["role"] == "system")["content"].lower()
    assert "live web results" not in system


# ---------------------------------------------------------------------------
# ChatSession domain rules
# ---------------------------------------------------------------------------

def test_session_rename_updates_title():
    session = ChatSession(id="s1", title="Old")
    session.rename("New Title")
    assert session.title == "New Title"


def test_session_rename_strips_whitespace():
    session = ChatSession(id="s1", title="Old")
    session.rename("  Trimmed  ")
    assert session.title == "Trimmed"


def test_session_rename_blank_raises():
    session = ChatSession(id="s1")
    with pytest.raises(ValueError):
        session.rename("   ")


def test_session_touch_updates_updated_at():
    session = ChatSession(id="s1")
    original = session.updated_at
    time.sleep(0.01)
    session.touch()
    assert session.updated_at > original


# ---------------------------------------------------------------------------
# SearchService + StubWebSearchAdapter
# ---------------------------------------------------------------------------

async def test_search_service_returns_results():
    stub = StubWebSearchAdapter(results=[
        SearchResult(title="T1", url="http://a.com", snippet="Snip 1"),
        SearchResult(title="T2", url="http://b.com", snippet="Snip 2"),
    ])
    svc = SearchService(adapter=stub)
    resp = await svc.search("test query", engine="duckduckgo", num_results=5)
    assert resp.engine == "duckduckgo"
    assert resp.query == "test query"
    assert len(resp.results) == 2
    assert resp.results[0].title == "T1"


async def test_search_service_respects_num_results():
    stub = StubWebSearchAdapter(results=[
        SearchResult(title=f"R{i}", url=f"http://r{i}.com")
        for i in range(10)
    ])
    svc = SearchService(adapter=stub)
    resp = await svc.search("query", num_results=3)
    assert len(resp.results) == 3


async def test_search_service_empty_results():
    stub = StubWebSearchAdapter(results=[])
    svc = SearchService(adapter=stub)
    resp = await svc.search("empty query")
    assert resp.results == []


async def test_stub_search_adapter_set_results():
    stub = StubWebSearchAdapter()
    stub.set_results([SearchResult(title="New", url="http://new.com")])
    results = await stub.search("anything")
    assert len(results) == 1
    assert results[0].title == "New"
