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
import os
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
# News-intent heuristic (shared by every adapter)
# ---------------------------------------------------------------------------

# A generic web search for "today's news" returns news-site HOMEPAGES (thin meta
# snippets) and word-matched junk (e.g. a song titled "Give Me All Your Luvin'").
# News-intent queries are routed to each engine's news-appropriate source instead
# (Serper /news, DuckDuckGo .news(), Wikipedia ITN feed) — real, dated articles.
# RCA 2026-06-08.
_NEWS_HINTS = (
    "news", "headline", "headlines", "breaking", "today", "tonight",
    "latest", "current events", "what happened", "right now", "happening",
    "this morning", "this week", "recent",
)


def is_news_query(query: str) -> bool:
    """Heuristic: does the user want current news/headlines (vs. evergreen info)?"""
    q = query.lower()
    return any(hint in q for hint in _NEWS_HINTS)


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

        news = is_news_query(query)
        try:
            results: list[SearchResult] = []
            with DDGS() as ddgs:
                if news:
                    # .news() returns dated articles (keys: title, url, body,
                    # source, date) — not homepages. RCA 2026-06-08 parity fix.
                    for hit in ddgs.news(query, max_results=num_results):
                        snippet = hit.get("body", "")
                        meta = ", ".join(x for x in (hit.get("source", ""), hit.get("date", "")) if x)
                        if meta:
                            snippet = f"{snippet} ({meta})" if snippet else meta
                        results.append(SearchResult(
                            title=hit.get("title", ""),
                            url=hit.get("url", ""),      # news uses "url"; text uses "href"
                            snippet=snippet,
                        ))
                else:
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
    Calls api.serper.dev for Google results. Requires an API key (Settings → Search).
    Routes news-intent queries to the /news endpoint for real, dated articles.
    """

    _SEARCH_URL = "https://google.serper.dev/search"
    _NEWS_URL = "https://google.serper.dev/news"

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

        news = is_news_query(query)
        endpoint = base_url or (self._NEWS_URL if news else self._SEARCH_URL)

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

        # /news → "news"[]; /search → "organic"[].
        hits = (data.get("news") if news else data.get("organic")) or []
        results: list[SearchResult] = []
        for hit in hits[:num_results]:
            snippet = hit.get("snippet", "")
            if news:
                meta = ", ".join(x for x in (hit.get("source", ""), hit.get("date", "")) if x)
                snippet = f"{snippet} ({meta})" if (snippet and meta) else (snippet or meta)
            results.append(SearchResult(
                title=hit.get("title", ""),
                url=hit.get("link", ""),
                snippet=snippet,
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
    """
    Free encyclopedic grounding via the MediaWiki search API (no key).

    News-intent queries route to the REST "featured feed" In-the-news (ITN)
    items — Wikipedia's own curated current headlines — rather than encyclopedic
    articles about the *concept* of news. Falls back to encyclopedic search when
    the feed is unavailable, so behaviour never degrades below today's.
    """

    _API = "https://en.wikipedia.org/w/api.php"
    _FEED = "https://en.wikipedia.org/api/rest_v1/feed/featured/{y}/{m}/{d}"

    async def search(
        self,
        query: str,
        num_results: int = 5,
        api_key: str = "",
        base_url: str = "",
    ) -> list[SearchResult]:
        if is_news_query(query):
            news = await self._news(num_results)
            if news:
                return news
            # Feed unavailable → fall through to encyclopedic grounding.
        return await self._encyclopedic(query, num_results)

    async def _news(self, num_results: int) -> list[SearchResult]:
        """In-the-news (ITN) items from the dated REST featured feed."""
        import re
        from datetime import UTC, datetime

        import httpx
        now = datetime.now(UTC)
        url = self._FEED.format(y=now.year, m=f"{now.month:02d}", d=f"{now.day:02d}")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers={"User-Agent": _WIKIPEDIA_UA})
                if resp.status_code != 200:
                    logger.warning("Wikipedia feed returned %d", resp.status_code)
                    return []
                data = resp.json()
        except Exception as exc:
            logger.warning("Wikipedia news feed failed: %s", exc)
            return []

        out: list[SearchResult] = []
        for item in (data.get("news") or [])[:num_results]:
            story = re.sub(r"<[^>]+>", "", item.get("story", "")).strip()
            links = item.get("links") or []
            first = links[0] if links else {}
            title = ((first.get("titles") or {}).get("normalized")
                     or first.get("title") or (story[:80] if story else "In the news"))
            page = (((first.get("content_urls") or {}).get("desktop") or {}).get("page")
                    or f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}")
            out.append(SearchResult(title=title, url=page, snippet=story))
        return out

    async def _encyclopedic(self, query: str, num_results: int) -> list[SearchResult]:
        """Standard MediaWiki full-text search (the evergreen path)."""
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

# Deterministic offline adapter for real-backend E2E (KNOVEX_FAKE_SEARCH=1), the
# search-side counterpart to KNOVEX_FAKE_LLM. Returns the same canned results for
# any query/engine so /web, /news, /research run without network flakiness.
_E2E_FAKE_ADAPTER = StubWebSearchAdapter(results=[
    SearchResult("Knovex E2E Source A", "https://e2e.example/a", "Deterministic snippet A."),
    SearchResult("Knovex E2E Source B", "https://e2e.example/b", "Deterministic snippet B."),
])


def get_search_adapter(engine: str) -> IWebSearchAdapter:
    """Return the adapter for *engine* (case-insensitive). Falls back to DuckDuckGo."""
    if os.environ.get("KNOVEX_FAKE_SEARCH"):
        return _E2E_FAKE_ADAPTER
    adapter = _ADAPTERS.get(engine.lower())
    if adapter is None:
        logger.warning("Unknown search engine '%s', falling back to DuckDuckGo", engine)
        return _ADAPTERS["duckduckgo"]
    return adapter
