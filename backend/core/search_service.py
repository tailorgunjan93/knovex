"""
Search Service — Sprint 4

Thin facade over the web search adapter layer.

SRP: only responsible for coordinating a search request + formatting results.
DIP: depends on IWebSearchAdapter (abstraction) + ISettingsStore for engine config.
OCP: adding a new search engine = add an adapter + register it; nothing else changes.
"""

from __future__ import annotations

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
