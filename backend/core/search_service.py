"""
Search Service — Sprint 4

Thin facade over the web search adapter layer.

SRP: only responsible for coordinating a search request + formatting results.
DIP: depends on IWebSearchAdapter (abstraction) + ISettingsStore for engine config.
OCP: adding a new search engine = add an adapter + register it; nothing else changes.
"""

from __future__ import annotations

import asyncio
import logging

from backend.adapters.web_search import IWebSearchAdapter, SearchResult, get_search_adapter
from backend.models.schemas import WebSearchResponse, WebSearchResult

logger = logging.getLogger("knovex.search")


class SearchService:
    """
    Facade for web search.

    Accepts *engine* and *api_key* per-call so the caller (ChatService,
    API route) can pass the current settings without a dependency on
    SettingsService here.
    """

    def __init__(self, adapter: IWebSearchAdapter | None = None) -> None:
        # Adapter can be injected for testing; resolved at call-time if None.
        self._adapter = adapter

    async def search(
        self,
        query: str,
        engine: str = "duckduckgo",
        api_key: str = "",
        num_results: int = 5,
    ) -> WebSearchResponse:
        """
        Execute *query* via *engine* and return a typed response.

        Returns an empty results list (not an error) if the engine fails.
        """
        adapter = self._adapter or get_search_adapter(engine)
        raw: list[SearchResult] = await adapter.search(
            query=query,
            num_results=num_results,
            api_key=api_key,
        )
        results = [
            WebSearchResult(title=r.title, url=r.url, snippet=r.snippet)
            for r in raw
        ]
        logger.info(
            "Web search: engine=%s query=%r results=%d",
            engine, query[:60], len(results),
        )
        return WebSearchResponse(engine=engine, query=query, results=results)

    async def search_blended(
        self,
        query: str,
        engines: list[tuple[str, str]],
        num_results: int = 5,
    ) -> WebSearchResponse:
        """
        Query every enabled engine concurrently and blend the results:
        round-robin interleave (so each engine contributes near the top),
        de-duplicated by URL, capped at *num_results*.

        *engines* is a list of (engine_id, api_key). Falls back to a single
        DuckDuckGo search when the list is empty. Per-engine failures are
        swallowed (an engine returning nothing never breaks the blend).
        """
        if not engines:
            return await self.search(query, num_results=num_results)

        async def _one(engine: str, api_key: str) -> list[SearchResult]:
            try:
                adapter = self._adapter or get_search_adapter(engine)
                return await adapter.search(query=query, num_results=num_results, api_key=api_key)
            except Exception as exc:   # noqa: BLE001 — one bad engine must not break the blend
                logger.warning("Blended search: engine=%s failed: %s", engine, exc)
                return []

        per_engine = await asyncio.gather(*[_one(e, k) for e, k in engines])

        # Round-robin interleave, de-dupe by URL, cap at num_results.
        blended: list[WebSearchResult] = []
        seen: set[str] = set()
        for rank in range(max((len(r) for r in per_engine), default=0)):
            for results in per_engine:
                if rank < len(results):
                    r = results[rank]
                    key = (r.url or r.title).strip().lower()
                    if key and key not in seen:
                        seen.add(key)
                        blended.append(WebSearchResult(title=r.title, url=r.url, snippet=r.snippet))
                        if len(blended) >= num_results:
                            break
            if len(blended) >= num_results:
                break

        label = "+".join(e for e, _ in engines)
        logger.info("Blended search: engines=%s query=%r results=%d", label, query[:60], len(blended))
        return WebSearchResponse(engine=label, query=query, results=blended)
