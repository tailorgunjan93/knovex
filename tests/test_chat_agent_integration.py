"""
ReAct agent + deterministic router — Integration Tests (real HTTP/SSE boundary)
══════════════════════════════════════════════════════════════════════════════
These drive the REAL FastAPI chat router over httpx + ASGITransport with the
agent ENABLED, covering the behaviour the legacy-path suite (agent disabled)
cannot:

  • Capable models (openai / large local) run the ReAct loop and only emit
    sources when they actually choose to search — a greeting grounds nothing.
  • Small local models (shiva-chat) take the deterministic router: a greeting is
    answered with NO retrieval at all (the screenshot bug), and an off-topic
    retrieved chunk is dropped by the relevance gate instead of confabulated.

The model's action decisions are scripted via a fake ``complete``; answer tokens
via a fake ``stream``. ``backend.fetchall`` is spied to prove whether retrieval
ran. NO live server, NO network.
"""

from __future__ import annotations

import contextlib
import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from backend.adapters.web_search import SearchResult, StubWebSearchAdapter
from backend.api.chat import router as chat_router
from backend.core.chat_service import ChatService
from backend.core.dependencies import get_chat_service, get_settings_service
from backend.core.search_service import SearchService
from tests.test_chat import InMemoryChatRepository


@pytest.fixture(autouse=True)
def _enable_agent(monkeypatch):
    from backend.core.config import settings
    monkeypatch.setattr(settings, "agent_enabled", True)
    monkeypatch.setattr(settings, "agent_max_steps", 4)


# A KB chunk that shares terms with "payment terms" queries (gate passes).
_KB_ROW = {
    "content": "Payment terms: net 30 days from the invoice date.",
    "section": "Billing", "page": 1, "file_id": "f1", "kb_id": "kb1",
    "file_name": "contract.pdf",
}
# A chunk about something unrelated — the screenshot's failure shape.
_OFFTOPIC_ROW = {
    "content": "Hawai'i mandates workplace breastfeeding accommodations.",
    "section": "", "page": 1, "file_id": "f2", "kb_id": "kb1",
    "file_name": "labor.pdf",
}


def _action(action: str, **inp) -> str:
    return json.dumps({"thought": "t", "action": action, "action_input": inp})


def _make_svc(*, actions=None, tokens=None, backend_rows=None, search_results=None):
    chat_repo = InMemoryChatRepository()
    llm = MagicMock()
    _actions = list(actions or [])

    async def _complete(**_kw):
        return _actions.pop(0) if _actions else "[]"   # exhausted → harmless

    async def _stream(**_kw):
        for t in (tokens or ["Answer."]):
            yield t

    llm.complete = _complete
    llm.stream = _stream

    search_svc = SearchService(adapter=StubWebSearchAdapter(results=search_results or []))
    backend = MagicMock()
    backend.fetchall = AsyncMock(return_value=backend_rows or [])
    backend.fetchone = AsyncMock(return_value=None)

    svc = ChatService(
        chat_repo=chat_repo, file_repo=MagicMock(), backend=backend,
        llm_svc=llm, search_svc=search_svc,
    )
    return svc, chat_repo, backend


def _settings_svc(provider: str, model: str) -> MagicMock:
    svc = MagicMock()
    svc.get = AsyncMock(return_value=MagicMock(
        llm=MagicMock(provider=provider, model=model, api_key="sk-test", base_url="",
                      aws_region="us-east-1", aws_access_key_id="", aws_secret_access_key=""),
        search=MagicMock(engine="duckduckgo", api_key="")))
    svc.enabled_search_engines = AsyncMock(return_value=[("duckduckgo", "")])
    return svc


async def _client(provider="openai", model="gpt-4o-mini", **svc_kwargs):
    svc, repo, backend = _make_svc(**svc_kwargs)
    app = FastAPI()
    app.include_router(chat_router, prefix="/api")
    app.dependency_overrides[get_chat_service] = lambda: svc
    app.dependency_overrides[get_settings_service] = lambda: _settings_svc(provider, model)
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    return client, repo, backend


async def _new_session(client, kb_id=None) -> str:
    r = await client.post("/api/chat/sessions", json={"kb_id": kb_id, "title": "t"})
    return r.json()["id"]


def _sse(body: str) -> list[dict]:
    out = []
    for line in body.splitlines():
        if line.startswith("data: "):
            with contextlib.suppress(json.JSONDecodeError):
                out.append(json.loads(line[6:]))
    return out


def _types(events): return [e["type"] for e in events]


# ─────────────────────────────────────────────────────────────────────────────
# Capable model → ReAct loop
# ─────────────────────────────────────────────────────────────────────────────

class TestCapableReActPath:
    async def test_greeting_with_kb_grounds_nothing(self):
        """A capable model answers 'hi' with NO KB search (final_answer on step 1),
        so no retrieval runs and no sources are emitted — what gpt-oss-120b already
        does, now guaranteed by the loop."""
        client, _, backend = await _client(
            actions=[_action("final_answer")], tokens=["Hi! ", "How can I help?"],
            backend_rows=[_KB_ROW],
        )
        async with client:
            sid = await _new_session(client, kb_id="kb1")
            r = await client.post(f"/api/chat/sessions/{sid}/stream", json={
                "message": "hi", "use_web_search": False, "kb_ids": ["kb1"],
            })
        events = _sse(r.text)
        assert "sources" not in _types(events)
        assert backend.fetchall.await_count == 0           # never retrieved
        assert _types(events).count("done") == 1
        assert [e for e in events if e["type"] == "error"] == []

    async def test_real_question_searches_kb_and_cites(self):
        client, repo, backend = await _client(
            actions=[_action("search_kb", query="payment terms"), _action("final_answer")],
            tokens=["Net ", "30 ", "days."], backend_rows=[_KB_ROW],
        )
        async with client:
            sid = await _new_session(client, kb_id="kb1")
            r = await client.post(f"/api/chat/sessions/{sid}/stream", json={
                "message": "what are the payment terms?", "use_web_search": False,
                "kb_ids": ["kb1"],
            })
            msgs = await repo.find_messages(sid)
        events = _sse(r.text)
        assert backend.fetchall.await_count >= 1
        srcs = [e for e in events if e["type"] == "sources"]
        assert srcs and any(s["file"] == "contract.pdf" for s in srcs[0]["sources"])
        # sources arrive before the first token
        assert _types(events).index("sources") < _types(events).index("token")
        assert _types(events)[-1] == "done"
        assistant = [m for m in msgs if m.role == "assistant"]
        assert assistant and assistant[0].sources                 # persisted with citations

    async def test_web_question_uses_web_search_tool(self):
        client, _, _ = await _client(
            actions=[_action("web_search", query="mars news"), _action("final_answer")],
            tokens=["Latest ", "from ", "Mars."],
            search_results=[SearchResult("Mars Update", "https://m", "snippet")],
        )
        async with client:
            sid = await _new_session(client)
            r = await client.post(f"/api/chat/sessions/{sid}/stream", json={
                "message": "any mars news?", "use_web_search": True, "kb_ids": None,
            })
        events = _sse(r.text)
        assert "web_sources" in _types(events)
        assert _types(events)[-1] == "done"


# ─────────────────────────────────────────────────────────────────────────────
# Small local model → deterministic router (the screenshot bug)
# ─────────────────────────────────────────────────────────────────────────────

class TestSmallModelFallback:
    async def test_greeting_does_not_retrieve_or_ground(self):
        """THE screenshot bug: shiva-chat + KB + 'hi' must NOT retrieve and must
        emit no sources — just a clean greeting. Proven over real HTTP."""
        client, repo, backend = await _client(
            provider="ollama", model="shiva-chat:latest",
            tokens=["Hi! ", "What can I help with?"], backend_rows=[_OFFTOPIC_ROW],
        )
        async with client:
            sid = await _new_session(client, kb_id="kb1")
            r = await client.post(f"/api/chat/sessions/{sid}/stream", json={
                "message": "hi", "use_web_search": False, "kb_ids": ["kb1"],
            })
            msgs = await repo.find_messages(sid)
        events = _sse(r.text)
        assert backend.fetchall.await_count == 0           # no retrieval on a greeting
        assert "sources" not in _types(events)
        assert _types(events).count("done") == 1
        assert [e for e in events if e["type"] == "error"] == []
        assistant = [m for m in msgs if m.role == "assistant"]
        assert assistant and not assistant[0].sources

    async def test_real_question_with_relevant_chunk_is_grounded(self):
        client, _, backend = await _client(
            provider="ollama", model="shiva-chat:latest",
            tokens=["Net 30."], backend_rows=[_KB_ROW],
        )
        async with client:
            sid = await _new_session(client, kb_id="kb1")
            r = await client.post(f"/api/chat/sessions/{sid}/stream", json={
                "message": "what are the payment terms?", "use_web_search": False,
                "kb_ids": ["kb1"],
            })
        events = _sse(r.text)
        assert backend.fetchall.await_count >= 1
        assert "sources" in _types(events)
        assert _types(events)[-1] == "done"

    async def test_relevance_gate_drops_offtopic_chunk(self):
        """A real question whose only retrieved chunk is unrelated must NOT be
        grounded (no sources) — the model answers from general knowledge instead
        of confabulating around the irrelevant chunk."""
        client, _, backend = await _client(
            provider="ollama", model="shiva-chat:latest",
            tokens=["Photosynthesis ", "converts ", "light."], backend_rows=[_OFFTOPIC_ROW],
        )
        async with client:
            sid = await _new_session(client, kb_id="kb1")
            r = await client.post(f"/api/chat/sessions/{sid}/stream", json={
                "message": "tell me about photosynthesis", "use_web_search": False,
                "kb_ids": ["kb1"],
            })
        events = _sse(r.text)
        assert backend.fetchall.await_count >= 1            # it DID retrieve
        assert "sources" not in _types(events)              # …but gated the junk out
        assert _types(events)[-1] == "done"
