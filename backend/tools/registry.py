"""
Tool Registry

Maintains the collection of LangChain-compatible tools that Knovex
exposes for agent use (Phase 2 LangGraph agents).

In Phase 1 the registry is populated but tools are invoked directly
by the chat/summarizer services — not via an agent orchestrator.

Usage::

    from backend.tools.registry import tool_registry

    tools = tool_registry.list_tools()
    tool = tool_registry.get("kb_search")
    result = await tool.arun({"query": "What is RAG?", "kb_id": "..."})
"""

from __future__ import annotations

import logging
from typing import Any

from backend.models.schemas import ToolInfo, ToolsListResponse

logger = logging.getLogger("knovex.tools")


class ToolRegistry:
    """
    Central registry for all registered Knovex tools.

    Tools are registered at service startup and can be listed by agents
    for discovery. Each tool has a name, description, and JSON input schema.
    """

    def __init__(self) -> None:
        self._tools: dict[str, dict[str, Any]] = {}

    def register(
        self,
        name: str,
        description: str,
        input_schema: dict[str, Any] | None = None,
        callable: Any | None = None,
    ) -> None:
        """Register a tool by name."""
        self._tools[name] = {
            "name": name,
            "description": description,
            "input_schema": input_schema or {},
            "callable": callable,
        }
        logger.debug("Registered tool: %s", name)

    def get(self, name: str) -> dict[str, Any] | None:
        """Retrieve a tool by name."""
        return self._tools.get(name)

    def list_tools(self) -> ToolsListResponse:
        """Return all registered tools as an API response."""
        return ToolsListResponse(
            tools=[
                ToolInfo(
                    name=t["name"],
                    description=t["description"],
                    input_schema=t["input_schema"],
                )
                for t in self._tools.values()
            ]
        )

    def all_names(self) -> list[str]:
        """Return all registered tool names."""
        return list(self._tools.keys())


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------
tool_registry = ToolRegistry()


# ---------------------------------------------------------------------------
# Register built-in tool stubs (Phase 1 — implementations come in Sprint 2+)
# ---------------------------------------------------------------------------

tool_registry.register(
    name="kb_search",
    description="Search a knowledge base using hybrid RAG (FTS5 + ANN). Returns ranked passages with source citations.",
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query"},
            "kb_id": {"type": "string", "description": "Target KB UUID (omit to search all KBs)"},
            "top_k": {"type": "integer", "default": 5},
        },
        "required": ["query"],
    },
)

tool_registry.register(
    name="web_search",
    description="Search the web using the configured engine (DuckDuckGo, Serper, or Brave). Returns title, URL, and snippet for each result.",
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "num_results": {"type": "integer", "default": 5},
        },
        "required": ["query"],
    },
)

tool_registry.register(
    name="summarize",
    description="Summarize a file or an entire KB. Returns a streaming summary.",
    input_schema={
        "type": "object",
        "properties": {
            "kb_id": {"type": "string"},
            "file_id": {"type": "string", "description": "Omit to summarize the whole KB"},
            "length": {"type": "string", "enum": ["brief", "detailed"], "default": "brief"},
        },
        "required": ["kb_id"],
    },
)

tool_registry.register(
    name="file_read",
    description="Read and return the rendered content of a file in a KB.",
    input_schema={
        "type": "object",
        "properties": {
            "kb_id": {"type": "string"},
            "file_id": {"type": "string"},
            "page": {"type": "integer", "default": 1},
        },
        "required": ["kb_id", "file_id"],
    },
)

tool_registry.register(
    name="learn_generate",
    description="Generate an interactive learning session (quiz, flashcard, mind map, story, timeline, ELI5) from a topic, PDF, or URL.",
    input_schema={
        "type": "object",
        "properties": {
            "topic": {"type": "string"},
            "format": {
                "type": "string",
                "enum": ["quiz", "flashcard", "mindmap", "story", "timeline", "eli5", "speedlearn", "brainstorm"],
            },
            "source_type": {"type": "string", "enum": ["pdf", "url", "topic"]},
            "source_ref": {"type": "string"},
            "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "expert"], "default": "intermediate"},
        },
        "required": ["topic", "format", "source_type"],
    },
)
