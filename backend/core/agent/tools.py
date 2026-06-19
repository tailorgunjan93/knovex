"""
Agent tools — the actions the ReAct loop can take.

Each tool is a thin wrapper over an *injected async callable*, not over a
service. That keeps the agent decoupled from ChatService / SearchService and
makes every tool testable with a one-line fake. ChatService binds the real
callables (with the request's kb_ids, engines, api keys, …) when it constructs
the toolset per request.

Invariant: ``run`` ALWAYS returns a ``ToolResult`` with a non-empty,
human-readable ``content``. An empty observation is what made the model
hallucinate in the first place, so "found nothing" is stated explicitly.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

# Injected callable signatures.
RetrieveFn = Callable[[str], Awaitable[tuple[str, list[dict]]]]  # query -> (context, sources)
WebSearchFn = Callable[[str], Awaitable[list[dict]]]             # query -> [ {title,url,snippet} ]
FetchFn = Callable[[str], Awaitable[str]]                        # url -> page text


@dataclass
class ToolResult:
    """The observation a tool hands back to the loop, plus UI source rows."""

    content: str
    sources: list[dict] = field(default_factory=list)
    web_sources: list[dict] = field(default_factory=list)


class AgentTool(ABC):
    """A named, described action the agent can invoke."""

    name: str = ""
    description: str = ""

    @abstractmethod
    async def run(self, **kwargs) -> ToolResult:
        """Execute the tool. Must never raise on expected-empty results."""
        raise NotImplementedError


class SearchKBTool(AgentTool):
    """Search the user's selected knowledge base(s)."""

    name = "search_kb"
    description = (
        "Search the user's knowledge base for passages relevant to a query. "
        "Use this when the question is about the user's own documents or when "
        "you need grounded, cited facts. Input: {\"query\": \"...\"}."
    )

    def __init__(self, retrieve: RetrieveFn) -> None:
        self._retrieve = retrieve

    async def run(self, *, query: str = "", **_) -> ToolResult:
        context, sources = await self._retrieve(query)
        if not (context and context.strip()):
            return ToolResult(
                content="No relevant passages were found in the knowledge base for that query."
            )
        return ToolResult(content=context, sources=sources)


class WebSearchTool(AgentTool):
    """Search the live web."""

    name = "web_search"
    description = (
        "Search the live web for current information, news, or facts not in the "
        "knowledge base. Use for recent events or anything time-sensitive. "
        "Input: {\"query\": \"...\"}."
    )

    def __init__(self, search: WebSearchFn) -> None:
        self._search = search

    async def run(self, *, query: str = "", **_) -> ToolResult:
        rows = await self._search(query)
        if not rows:
            return ToolResult(content="The web search returned no results for that query.")
        formatted = "\n\n".join(
            f"[{r.get('title', '')}] ({r.get('url', '')})\n{r.get('snippet', '')}".strip()
            for r in rows
        )
        return ToolResult(content=formatted, web_sources=rows)


class FetchURLTool(AgentTool):
    """Fetch and read the text of a specific URL."""

    name = "fetch_url"
    description = (
        "Fetch the readable text of a specific web page. Use when the user gives "
        "a URL or when a search result needs to be read in full. "
        "Input: {\"url\": \"https://...\"}."
    )

    def __init__(self, fetch: FetchFn) -> None:
        self._fetch = fetch

    async def run(self, *, url: str = "", **_) -> ToolResult:
        text = await self._fetch(url)
        if not (text and text.strip()):
            return ToolResult(content=f"Could not fetch or read any text from {url}.")
        return ToolResult(content=f"[Fetched page: {url}]\n{text}")
