"""
Research Brief Service — the "agentic mode" (a workflow, not an autonomous agent).

The APP owns the control flow; the LLM only narrates at two leaves:

    plan ──► search (parallel fan-out) ──► synthesise
     │              │                          │
   LLM text     APP logic                  LLM text
  (sub-Qs)   (asyncio.gather, dedup,      (cited brief over
              cap, order)                  the gathered sources)

This is Anthropic's "prompt chaining + parallelization" workflow pattern:
predefined code paths orchestrating LLM calls — deterministic, testable, cheap.
There is NO ReAct loop and the LLM never decides which tools to call.

Yields TYPED dict events (not SSE strings) so the caller (ChatService) can format
them, accumulate the brief text, and persist — and so this service is unit-testable
without parsing wire formats:

    {"type": "status",       "stage": "planning|searching|writing", "detail": "..."}
    {"type": "subquestions", "items": [...]}
    {"type": "web_sources",  "sources": [{title,url,snippet}, ...]}
    {"type": "token",        "content": "..."}
    {"type": "error",        "error": "..."}
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import AsyncGenerator
from typing import Any

from backend.core.llm_service import LLMService
from backend.core.providers.base import ProviderCredentials
from backend.core.search_service import SearchService

logger = logging.getLogger("knovex.research")

_DEFAULT_SUBQUESTIONS = 4
_DEFAULT_SOURCES_PER_Q = 3
_DEFAULT_MAX_SOURCES = 12


class ResearchService:
    """Orchestrates a cited research brief. Depends on LLMService + SearchService."""

    def __init__(self, llm_svc: LLMService, search_svc: SearchService) -> None:
        self._llm = llm_svc
        self._search = search_svc

    async def stream_brief(
        self,
        *,
        topic: str,
        provider: str,
        model: str,
        credentials: ProviderCredentials,
        search_engines: list[tuple[str, str]] | None = None,
        max_subquestions: int = _DEFAULT_SUBQUESTIONS,
        sources_per_q: int = _DEFAULT_SOURCES_PER_Q,
        max_sources: int = _DEFAULT_MAX_SOURCES,
    ) -> AsyncGenerator[dict[str, Any], None]:
        # 1 ── Plan: the LLM proposes sub-questions (text); the app caps + cleans.
        yield {"type": "status", "stage": "planning", "detail": f"Planning research on “{topic}”"}
        subquestions = await self._plan(topic, provider, model, credentials, max_subquestions)
        yield {"type": "subquestions", "items": subquestions}

        # 2 ── Search: the app fans out the sub-questions in parallel, dedups, caps.
        yield {"type": "status", "stage": "searching",
               "detail": f"Searching {len(subquestions)} angle(s)"}
        sources = await self._gather_sources(subquestions, search_engines, sources_per_q, max_sources)
        yield {"type": "web_sources", "sources": sources}

        # 3 ── Synthesise: the LLM writes a cited brief over the gathered sources.
        yield {"type": "status", "stage": "writing", "detail": "Writing the brief"}
        messages = self._build_synthesis_prompt(topic, subquestions, sources)
        try:
            async for token in self._llm.stream(
                messages=messages,
                provider=provider,
                model=model,
                credentials=credentials,
                max_tokens=2048,
                temperature=0.4,
            ):
                yield {"type": "token", "content": token}
        except Exception as exc:  # noqa: BLE001 — surface as an event, never crash the stream
            logger.exception("Research synthesis failed for %r: %s", topic, exc)
            yield {"type": "error", "error": str(exc)}

    # ── Step 1: planning ────────────────────────────────────────────────────

    async def _plan(
        self, topic: str, provider: str, model: str,
        credentials: ProviderCredentials, max_subquestions: int,
    ) -> list[str]:
        """Ask the LLM for sub-questions; degrade to [topic] if parsing fails."""
        prompt = [
            {"role": "system", "content": (
                "You plan research. Return ONLY a JSON array of "
                f"{max_subquestions} specific, non-overlapping sub-questions that, "
                "answered together, would thoroughly cover the topic. No prose."
            )},
            {"role": "user", "content": f"Topic: {topic}"},
        ]
        try:
            raw = await self._llm.complete(
                messages=prompt, provider=provider, model=model,
                credentials=credentials, max_tokens=400, temperature=0.5,
            )
            data = json.loads(_strip_fences(raw))
            items = data if isinstance(data, list) else data.get("questions") or data.get("items") or []
            cleaned = [str(q).strip() for q in items if str(q).strip()]
            if cleaned:
                return cleaned[:max_subquestions]
        except Exception as exc:  # noqa: BLE001 — planning is best-effort
            logger.warning("Research planning failed for %r (%s); using topic as the only query", topic, exc)
        return [topic]

    # ── Step 2: parallel search fan-out ──────────────────────────────────────

    async def _gather_sources(
        self, subquestions: list[str], search_engines: list[tuple[str, str]] | None,
        sources_per_q: int, max_sources: int,
    ) -> list[dict[str, str]]:
        async def _one(q: str):
            try:
                resp = await self._search.search_blended(
                    query=q, engines=search_engines or [], num_results=sources_per_q,
                )
                return resp.results
            except Exception as exc:  # noqa: BLE001 — one bad query mustn't sink the brief
                logger.warning("Research sub-query failed %r: %s", q, exc)
                return []

        batches = await asyncio.gather(*[_one(q) for q in subquestions])

        out: list[dict[str, str]] = []
        seen: set[str] = set()
        for batch in batches:
            for r in batch:
                key = (r.url or r.title).strip().lower()
                if key and key not in seen:
                    seen.add(key)
                    out.append({"title": r.title, "url": r.url, "snippet": r.snippet})
                    if len(out) >= max_sources:
                        return out
        return out

    # ── Step 3: synthesis prompt ─────────────────────────────────────────────

    @staticmethod
    def _build_synthesis_prompt(
        topic: str, subquestions: list[str], sources: list[dict[str, str]],
    ) -> list[dict[str, str]]:
        if sources:
            numbered = "\n\n".join(
                f"[{i}] {s['title']}\n{s['url']}\n{s['snippet']}"
                for i, s in enumerate(sources, start=1)
            )
            source_block = f"Sources:\n\n{numbered}"
            grounding = (
                "Write a clear, well-structured research brief on the topic using ONLY "
                "the sources below. Cite every claim inline as [n] matching the numbered "
                "list. Open with a 2-3 sentence summary, then sections with headings, then "
                "a short 'Gaps / open questions' note. If the sources don't cover something, "
                "say so rather than inventing it."
            )
        else:
            source_block = "(No web sources were found.)"
            grounding = (
                "Write a clear, well-structured research brief on the topic from your own "
                "knowledge. State plainly that no live sources were available, and flag any "
                "claims that should be verified."
            )

        angles = "\n".join(f"- {q}" for q in subquestions)
        return [
            {"role": "system", "content": f"You are a meticulous research analyst. {grounding}"},
            {"role": "user", "content": (
                f"Topic: {topic}\n\nAngles to cover:\n{angles}\n\n{source_block}"
            )},
        ]


def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()
