"""
Agent tools — thin, injected wrappers over existing Knovex capabilities.

Each tool takes an injected async callable (not a service), so the ReAct loop
depends only on the small ``AgentTool`` surface and the tools are testable with
plain fakes. A tool ALWAYS returns a ``ToolResult`` with a human-readable
``content`` observation — even on empty results — because an empty observation
would make the model hallucinate (the original over-grounding failure mode).
"""

from __future__ import annotations

from backend.core.agent.tools import (
    AgentTool,
    FetchURLTool,
    SearchKBTool,
    ToolResult,
    WebSearchTool,
)


class TestToolResult:
    def test_defaults_are_empty_not_none(self):
        r = ToolResult(content="hi")
        assert r.content == "hi"
        assert r.sources == []
        assert r.web_sources == []


class TestSearchKBTool:
    async def test_name_and_description(self):
        tool = SearchKBTool(lambda q: _async(("", [])))
        assert tool.name == "search_kb"
        assert isinstance(tool, AgentTool)
        assert tool.description.strip()

    async def test_returns_context_and_sources(self):
        async def fake_retrieve(query):
            assert query == "photosynthesis"
            return ("Plants convert light...", [{"file": "bio.pdf"}])

        tool = SearchKBTool(fake_retrieve)
        res = await tool.run(query="photosynthesis")
        assert "Plants convert light" in res.content
        assert res.sources == [{"file": "bio.pdf"}]

    async def test_empty_results_give_a_clear_observation(self):
        tool = SearchKBTool(lambda q: _async(("", [])))
        res = await tool.run(query="nothing here")
        assert res.content.strip()                      # never blank
        assert "no" in res.content.lower()              # signals "nothing found"
        assert res.sources == []


class TestWebSearchTool:
    async def test_name(self):
        tool = WebSearchTool(lambda q: _async([]))
        assert tool.name == "web_search"

    async def test_formats_results_and_keeps_web_sources(self):
        rows = [{"title": "T1", "url": "http://a", "snippet": "S1"}]
        tool = WebSearchTool(lambda q: _async(rows))
        res = await tool.run(query="news today")
        assert "T1" in res.content and "http://a" in res.content
        assert res.web_sources == rows

    async def test_empty_results_give_a_clear_observation(self):
        tool = WebSearchTool(lambda q: _async([]))
        res = await tool.run(query="obscure")
        assert res.content.strip()
        assert res.web_sources == []


class TestFetchURLTool:
    async def test_name(self):
        tool = FetchURLTool(lambda u: _async(""))
        assert tool.name == "fetch_url"

    async def test_returns_page_text(self):
        tool = FetchURLTool(lambda u: _async("Page body text"))
        res = await tool.run(url="http://example.com")
        assert "Page body text" in res.content

    async def test_empty_fetch_gives_a_clear_observation(self):
        tool = FetchURLTool(lambda u: _async(""))
        res = await tool.run(url="http://broken")
        assert res.content.strip()


async def _async(value):
    return value
