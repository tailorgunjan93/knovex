"""
Research Brief workflow — the agentic mode (app-orchestrated, LLM narrates).

ResearchService is a deterministic pipeline: the APP decides the steps (how many
sub-questions, the parallel search fan-out, dedup/cap/order, sequencing) and the
LLM only generates text at two leaves — the sub-questions and the final brief.
This is the "workflow" pattern, NOT an autonomous tool-calling agent.

These tests stub the LLM + search so the orchestration is verified in isolation.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from backend.adapters.web_search import SearchResult, StubWebSearchAdapter
from backend.core.providers.base import ProviderCredentials
from backend.core.research_service import ResearchService
from backend.core.search_service import SearchService


def _creds() -> ProviderCredentials:
    return ProviderCredentials(api_key="k")


def _llm(*, plan: str, tokens: list[str]) -> MagicMock:
    llm = MagicMock()
    llm.complete = AsyncMock(return_value=plan)

    async def _stream(*a, **k):
        for t in tokens:
            yield t

    llm.stream = _stream
    return llm


def _search(results: list[SearchResult]) -> SearchService:
    return SearchService(adapter=StubWebSearchAdapter(results=results))


async def _collect(gen) -> list[dict]:
    return [ev async for ev in gen]


async def _run(llm, search, **kw) -> list[dict]:
    svc = ResearchService(llm_svc=llm, search_svc=search)
    return await _collect(svc.stream_brief(
        topic=kw.pop("topic", "quantum computing"),
        provider="openai", model="gpt-4o-mini", credentials=_creds(), **kw,
    ))


class TestHappyPath:
    async def test_emits_plan_sources_and_brief_tokens_in_order(self):
        llm = _llm(plan='["What is it?", "How does it work?", "Why does it matter?"]',
                   tokens=["Quantum ", "computing ", "is…"])
        search = _search([SearchResult("A", "https://a", "sa"), SearchResult("B", "https://b", "sb")])
        events = await _run(llm, search)

        types = [e["type"] for e in events]
        # planning happens before searching happens before writing
        assert types.index("subquestions") < types.index("web_sources") < types.index("token")

        subq = next(e for e in events if e["type"] == "subquestions")
        assert len(subq["items"]) == 3

        brief = "".join(e["content"] for e in events if e["type"] == "token")
        assert brief == "Quantum computing is…"

    async def test_sources_are_deduped_by_url(self):
        # Every sub-question search returns the same two URLs → deduped to two.
        llm = _llm(plan='["q1","q2","q3"]', tokens=["x"])
        search = _search([SearchResult("A", "https://a", "sa"), SearchResult("B", "https://b", "sb")])
        events = await _run(llm, search)
        ws = next(e for e in events if e["type"] == "web_sources")
        urls = [s["url"] for s in ws["sources"]]
        assert urls == ["https://a", "https://b"]

    async def test_subquestions_capped(self):
        llm = _llm(plan='["a","b","c","d","e","f"]', tokens=["x"])
        events = await _run(llm, _search([SearchResult("A", "https://a", "s")]), max_subquestions=3)
        subq = next(e for e in events if e["type"] == "subquestions")
        assert len(subq["items"]) == 3


class TestSynthesisPromptCapture:
    async def test_prompt_carries_numbered_sources(self):
        captured: dict = {}
        llm = MagicMock()
        llm.complete = AsyncMock(return_value='["q1"]')

        async def _stream(*a, **k):
            captured["messages"] = k.get("messages")
            yield "x"

        llm.stream = _stream
        search = _search([SearchResult("Quantum Primer", "https://q", "a useful snippet")])
        await _run(llm, search)
        blob = " ".join(m["content"] for m in captured["messages"])
        assert "https://q" in blob
        assert "Quantum Primer" in blob
        assert "[1]" in blob or "1." in blob   # numbered for citation


class TestResilience:
    async def test_unparseable_plan_falls_back_to_topic(self):
        llm = _llm(plan="not json at all", tokens=["brief"])
        events = await _run(llm, _search([SearchResult("A", "https://a", "s")]), topic="black holes")
        subq = next(e for e in events if e["type"] == "subquestions")
        assert subq["items"] == ["black holes"]   # graceful fallback, no crash

    async def test_llm_stream_error_emits_error_event(self):
        llm = MagicMock()
        llm.complete = AsyncMock(return_value='["q1"]')

        async def _boom(*a, **k):
            raise RuntimeError("LLM down")
            yield  # make it an async generator

        llm.stream = _boom
        events = await _run(llm, _search([SearchResult("A", "https://a", "s")]))
        assert any(e["type"] == "error" for e in events)

    async def test_no_sources_still_writes(self):
        # Search returns nothing → still attempts a brief (from model knowledge),
        # never crashes; web_sources event is empty.
        llm = _llm(plan='["q1"]', tokens=["From training knowledge…"])
        events = await _run(llm, _search([]))
        ws = next(e for e in events if e["type"] == "web_sources")
        assert ws["sources"] == []
        assert any(e["type"] == "token" for e in events)
