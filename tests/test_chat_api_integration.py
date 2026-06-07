"""
Chat API — Integration Tests
══════════════════════════════════════════════════════════════════════════════
WHY THIS FILE EXISTS
─────────────────────
test_chat.py exercises ChatService in isolation (it drains the async generator
directly). That cannot catch bugs in the HTTP/SSE seam — the same blind spot that
let the Learn "animated" bug ship (a ValueError raised *inside* a StreamingResponse
generator, after the 200 had begun, aborts the connection mid-stream and the
browser shows a bare "network error"). This file mounts the real FastAPI chat
router and drives it over httpx + ASGITransport, asserting status codes and SSE
wire behaviour — including that failure paths return a CLEAN response (404 /
error-event) rather than a dropped connection.

NO live server, NO network I/O — ASGITransport talks to the app in-process and
FastAPI dependency_overrides swap in lightweight stubs.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from backend.adapters.web_search import SearchResult, StubWebSearchAdapter
from backend.api.chat import router as chat_router
from backend.core.chat_service import ChatService
from backend.core.dependencies import get_chat_service, get_settings_service
from backend.core.search_service import SearchService
from tests.test_chat import InMemoryChatRepository

# pytest asyncio_mode=auto (pyproject.toml) runs bare `async def test_*` directly.


# ─────────────────────────────────────────────────────────────────────────────
# Stubs / fixtures
# ─────────────────────────────────────────────────────────────────────────────

def _make_chat_svc(
    *,
    tokens: list[str] | None = None,
    fail: bool = False,
    search_results: list[SearchResult] | None = None,
    backend_rows: list[dict] | None = None,
) -> tuple[ChatService, InMemoryChatRepository]:
    chat_repo = InMemoryChatRepository()
    llm_svc = MagicMock()

    if fail:
        async def _stream_gen(*a, **kw):
            raise RuntimeError("LLM unavailable")
            yield  # pragma: no cover — makes this an async generator
    else:
        _tokens = tokens or ["Hello", "! ", "How can I help?"]

        async def _stream_gen(*a, **kw):
            for t in _tokens:
                yield t

    llm_svc.stream = _stream_gen

    search_svc = SearchService(adapter=StubWebSearchAdapter(results=search_results or []))

    backend = MagicMock()
    backend.fetchall = AsyncMock(return_value=backend_rows or [])
    backend.fetchone = AsyncMock(return_value=None)

    svc = ChatService(
        chat_repo=chat_repo,
        file_repo=MagicMock(),
        backend=backend,
        llm_svc=llm_svc,
        search_svc=search_svc,
    )
    return svc, chat_repo


def _mock_settings_svc() -> MagicMock:
    svc = MagicMock()
    svc.get = AsyncMock(return_value=MagicMock(
        llm=MagicMock(
            provider="openai", model="gpt-4o-mini", api_key="sk-test",
            base_url="", aws_region="us-east-1",
            aws_access_key_id="", aws_secret_access_key="",
        ),
        search=MagicMock(engine="duckduckgo", api_key=""),
    ))
    svc.enabled_search_engines = AsyncMock(return_value=["duckduckgo"])
    return svc


async def _make_client(**svc_kwargs) -> tuple[AsyncClient, InMemoryChatRepository]:
    svc, repo = _make_chat_svc(**svc_kwargs)
    app = FastAPI()
    app.include_router(chat_router, prefix="/api")
    app.dependency_overrides[get_chat_service] = lambda: svc
    app.dependency_overrides[get_settings_service] = lambda: _mock_settings_svc()
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    return client, repo


def _parse_sse(body: str) -> list[dict]:
    events: list[dict] = []
    import contextlib
    for line in body.splitlines():
        if line.startswith("data: "):
            with contextlib.suppress(json.JSONDecodeError):
                events.append(json.loads(line[6:]))
    return events


async def _create_session(client: AsyncClient, kb_id=None, title="diag") -> str:
    r = await client.post("/api/chat/sessions", json={"kb_id": kb_id, "title": title})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


# ─────────────────────────────────────────────────────────────────────────────
# Session contract
# ─────────────────────────────────────────────────────────────────────────────

class TestChatSessionContract:
    async def test_create_session_returns_session(self):
        client, _ = await _make_client()
        async with client:
            r = await client.post("/api/chat/sessions", json={"kb_id": None, "title": "Hi"})
        assert r.status_code in (200, 201)
        body = r.json()
        assert "id" in body and body["title"] == "Hi"

    async def test_list_sessions_returns_200(self):
        client, _ = await _make_client()
        async with client:
            await _create_session(client)
            r = await client.get("/api/chat/sessions")
        assert r.status_code == 200
        assert isinstance(r.json().get("sessions"), list)

    async def test_get_messages_for_new_session_is_empty(self):
        client, _ = await _make_client()
        async with client:
            sid = await _create_session(client)
            r = await client.get(f"/api/chat/sessions/{sid}/messages")
        assert r.status_code == 200
        assert r.json()["messages"] == []


# ─────────────────────────────────────────────────────────────────────────────
# SSE streaming — the seam that produces "network error" when it misbehaves
# ─────────────────────────────────────────────────────────────────────────────

class TestChatStreaming:
    async def test_stream_content_type_is_event_stream(self):
        client, _ = await _make_client(tokens=["hi"])
        async with client:
            sid = await _create_session(client)
            r = await client.post(f"/api/chat/sessions/{sid}/stream", json={
                "message": "hi", "use_web_search": False,
                "kb_ids": None, "attached_context": None,
            })
        assert r.status_code == 200
        assert "text/event-stream" in r.headers.get("content-type", "")

    async def test_stream_emits_tokens_and_done(self):
        """The real Chat → 'hi' path: 200, token events, exactly one done event."""
        client, _ = await _make_client(tokens=["Hello", "! ", "👋"])
        async with client:
            sid = await _create_session(client)
            r = await client.post(f"/api/chat/sessions/{sid}/stream", json={
                "message": "hi", "use_web_search": False,
                "kb_ids": None, "attached_context": None,
            })
        events = _parse_sse(r.text)
        tokens = [e for e in events if e["type"] == "token"]
        done = [e for e in events if e["type"] == "done"]
        errors = [e for e in events if e["type"] == "error"]
        assert not errors, f"unexpected error event: {errors}"
        assert len(tokens) >= 1
        assert len(done) == 1
        assert "message_id" in done[0]

    async def test_stream_missing_session_returns_clean_404_not_dropped_connection(self):
        """
        Guard against the Learn-'animated' failure class: a missing session must
        produce a clean 404 BEFORE the SSE response starts — never a 200 that then
        drops mid-stream (which the renderer surfaces as a bare "network error").
        """
        client, _ = await _make_client()
        async with client:
            r = await client.post("/api/chat/sessions/does-not-exist/stream", json={
                "message": "hi", "use_web_search": False,
                "kb_ids": None, "attached_context": None,
            })
        assert r.status_code == 404
        assert "text/event-stream" not in r.headers.get("content-type", "")
        assert "detail" in r.json()

    async def test_stream_llm_failure_emits_error_event_not_drop(self):
        """An LLM failure mid-generation is delivered as a typed error event, so
        the UI shows the real reason instead of a dropped-connection 'network error'."""
        client, _ = await _make_client(fail=True)
        async with client:
            sid = await _create_session(client)
            r = await client.post(f"/api/chat/sessions/{sid}/stream", json={
                "message": "hi", "use_web_search": False,
                "kb_ids": None, "attached_context": None,
            })
        assert r.status_code == 200
        events = _parse_sse(r.text)
        errors = [e for e in events if e["type"] == "error"]
        assert len(errors) == 1
        assert "error" in errors[0]

    async def test_stream_persists_assistant_message(self):
        client, _ = await _make_client(tokens=["Answer."])
        async with client:
            sid = await _create_session(client)
            await client.post(f"/api/chat/sessions/{sid}/stream", json={
                "message": "hi", "use_web_search": False,
                "kb_ids": None, "attached_context": None,
            })
            r = await client.get(f"/api/chat/sessions/{sid}/messages")
        roles = [m["role"] for m in r.json()["messages"]]
        assert "user" in roles and "assistant" in roles
