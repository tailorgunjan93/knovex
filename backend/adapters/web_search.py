"""
Web Search Adapter — anti-corruption layer for search libraries

Only this file may import duckduckgo_search, requests, or any search SDK.
All callers depend on IWebSearchAdapter (interface), not on any library directly.

Implementations:
    DuckDuckGoAdapter  — free, no API key (duckduckgo-search library)
    SerperAdapter      — paid Google Search via api.serper.dev
    BraveAdapter       — paid Brave Search API

Pattern: Adapter (GoF) + Strategy (DIP)
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass

logger = logging.getLogger("knovex.adapters.search")


# ---------------------------------------------------------------------------
# Value object
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SearchResult:
    """A single web search result."""
    title: str
    url: str
    snippet: str = ""


# ---------------------------------------------------------------------------
# Interface
# ---------------------------------------------------------------------------

class IWebSearchAdapter(ABC):
    """
    Minimal async interface for web search.
    All implementations return a list of SearchResult value objects.
    """

    @abstractmethod
    async def search(
        self,
        query: str,
        num_results: int = 5,
        api_key: str = "",
        base_url: str = "",
    ) -> list[SearchResult]:
        """
        Search *query* and return up to *num_results* results.
        Returns empty list (never raises) if the engine is unreachable.
        """
        ...


# ---------------------------------------------------------------------------
# DuckDuckGo — free, no key required
# ---------------------------------------------------------------------------

class DuckDuckGoAdapter(IWebSearchAdapter):
    """
    Wraps the duckduckgo-search library (pip install duckduckgo-search).

    Import is deferred so the module is importable without the library.
    Falls back to empty results if the library is not installed.
    """

    async def search(
        self,
        query: str,
        num_results: int = 5,
        api_key: str = "",
        base_url: str = "",
    ) -> list[SearchResult]:
        try:
            # Try new package name first (ddgs), fall back to old (duckduckgo_search)
            try:
                from ddgs import DDGS
            except ImportError:
                from duckduckgo_search import DDGS  # type: ignore[no-redef]
        except ImportError:
            logger.warning("ddgs / duckduckgo-search not installed — returning empty results")
            return []

        try:
            results: list[SearchResult] = []
            with DDGS() as ddgs:
                for hit in ddgs.text(query, max_results=num_results):
                    results.append(SearchResult(
                        title=hit.get("title", ""),
                        url=hit.get("href", ""),
                        snippet=hit.get("body", ""),
                    ))
            return results
        except Exception as exc:
            logger.warning("DuckDuckGo search failed: %s", exc)
            return []


# ---------------------------------------------------------------------------
# Serper — paid Google Search (api.serper.dev)
# ---------------------------------------------------------------------------

class SerperAdapter(IWebSearchAdapter):
    """
    Calls api.serper.dev for Google Search results.
    Requires an API key (set via Settings → Search).
    """

    _DEFAULT_URL = "https://google.serper.dev/search"

    async def search(
        self,
        query: str,
        num_results: int = 5,
        api_key: str = "",
        base_url: str = "",
    ) -> list[SearchResult]:
        if not api_key:
            logger.warning("Serper search: no API key configured")
            return []

        endpoint = base_url or self._DEFAULT_URL

        try:
            import httpx  # only import site
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    endpoint,
                    json={"q": query, "num": num_results},
                    headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
                )
                if resp.status_code != 200:
                    logger.warning("Serper returned %d", resp.status_code)
                    return []
                data = resp.json()
        except Exception as exc:
            logger.warning("Serper search failed: %s", exc)
            return []

        results: list[SearchResult] = []
        for hit in data.get("organic", [])[:num_results]:
            results.append(SearchResult(
                title=hit.get("title", ""),
                url=hit.get("link", ""),
                snippet=hit.get("snippet", ""),
            ))
        return results


# ---------------------------------------------------------------------------
# Brave Search
# ---------------------------------------------------------------------------

class BraveAdapter(IWebSearchAdapter):
    """
    Calls the Brave Search API.
    Requires an API key (set via Settings → Search).
    """

    _DEFAULT_URL = "https://api.search.brave.com/res/v1/web/search"

    async def search(
        self,
        query: str,
        num_results: int = 5,
        api_key: str = "",
        base_url: str = "",
    ) -> list[SearchResult]:
        if not api_key:
            logger.warning("Brave search: no API key configured")
            return []

        endpoint = base_url or self._DEFAULT_URL

        try:
            import httpx  # only import site
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    endpoint,
                    params={"q": query, "count": num_results},
                    headers={
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip",
                        "X-Subscription-Token": api_key,
                    },
                )
                if resp.status_code != 200:
                    logger.warning("Brave returned %d", resp.status_code)
                    return []
                data = resp.json()
        except Exception as exc:
            logger.warning("Brave search failed: %s", exc)
            return []

        results: list[SearchResult] = []
        for hit in data.get("web", {}).get("results", [])[:num_results]:
            results.append(SearchResult(
                title=hit.get("title", ""),
                url=hit.get("url", ""),
                snippet=hit.get("description", ""),
            ))
        return results


# ---------------------------------------------------------------------------
# Wikipedia — free encyclopedic search (MediaWiki API, no key)
# ---------------------------------------------------------------------------

# Wikimedia's API policy 403s requests whose User-Agent lacks contact info.
# A bare product token ("Knovex/1.0 (knowledge base)") is rejected — it must
# include a contact URL/email. RCA 2026-06-08 (verified: old UA → 403, this → 200).
_WIKIPEDIA_UA = "Knovex/1.0 (+https://github.com/tailorgunjan93/knovex; AI knowledge base)"


class WikipediaAdapter(IWebSearchAdapter):
    """Free encyclopedic grounding via the MediaWiki search API (no key)."""

    _API = "https://en.wikipedia.org/w/api.php"

    async def search(
        self,
        query: str,
        num_results: int = 5,
        api_key: str = "",
        base_url: str = "",
    ) -> list[SearchResult]:
        try:
            import re

            import httpx
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    self._API,
                    params={
                        "action": "query", "list": "search", "srsearch": query,
                        "format": "json", "srlimit": num_results,
                    },
                    headers={"User-Agent": _WIKIPEDIA_UA},
                )
                if resp.status_code != 200:
                    logger.warning("Wikipedia returned %d", resp.status_code)
                    return []
                data = resp.json()
        except Exception as exc:
            logger.warning("Wikipedia search failed: %s", exc)
            return []

        out: list[SearchResult] = []
        for hit in data.get("query", {}).get("search", []):
            title = hit.get("title", "")
            snippet = re.sub(r"<[^>]+>", "", hit.get("snippet", ""))  # strip HTML
            out.append(SearchResult(
                title=title,
                url=f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
                snippet=snippet,
            ))
        return out


# ---------------------------------------------------------------------------
# Stub for tests
# ---------------------------------------------------------------------------

class StubWebSearchAdapter(IWebSearchAdapter):
    """Deterministic stub — returns pre-configured results for any query."""

    def __init__(self, results: list[SearchResult] | None = None) -> None:
        self._results: list[SearchResult] = results or []

    def set_results(self, results: list[SearchResult]) -> None:
        self._results = results

    async def search(
        self,
        query: str,
        num_results: int = 5,
        api_key: str = "",
        base_url: str = "",
    ) -> list[SearchResult]:
        return self._results[:num_results]


# ---------------------------------------------------------------------------
# Factory function — maps engine name to adapter instance
# ---------------------------------------------------------------------------

_ADAPTERS: dict[str, IWebSearchAdapter] = {
    "duckduckgo": DuckDuckGoAdapter(),
    "wikipedia":  WikipediaAdapter(),
    "serper":     SerperAdapter(),
    "brave":      BraveAdapter(),
}


def get_search_adapter(engine: str) -> IWebSearchAdapter:
    """Return the adapter for *engine* (case-insensitive). Falls back to DuckDuckGo."""
    adapter = _ADAPTERS.get(engine.lower())
    if adapter is None:
        logger.warning("Unknown search engine '%s', falling back to DuckDuckGo", engine)
        return _ADAPTERS["duckduckgo"]
    return adapter
