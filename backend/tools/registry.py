"""
Tool Registry (Plugin Pattern)

Tools self-register via the @register_tool decorator, mirroring the
provider factory pattern. Adding a new tool = new file + decorator.
Nothing in the registry itself changes (OCP).

Usage::

    from backend.tools.registry import register_tool, tool_registry

    @register_tool(
        name="my_tool",
        description="Does something useful",
        input_schema={...},
    )
    async def my_tool_handler(payload: dict) -> dict:
        ...

    # List all tools (API response):
    response = tool_registry.list_tools()
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from backend.models.schemas import ToolInfo, ToolsListResponse

logger = logging.getLogger("knovex.tools")

ToolCallable = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


# ---------------------------------------------------------------------------
# Tool descriptor
# ---------------------------------------------------------------------------

@dataclass
class ToolDescriptor:
    """
    Metadata + callable for a single registered tool.

    The callable (handler) is injected when available (Sprint 2+).
    In Sprint 1 it's None — the registry is for discovery only.
    """
    name: str
    description: str
    input_schema: dict[str, Any] = field(default_factory=dict)
    handler: ToolCallable | None = None

    def to_tool_info(self) -> ToolInfo:
        return ToolInfo(
            name=self.name,
            description=self.description,
            input_schema=self.input_schema,
        )


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

class ToolRegistry:
    """
    Central registry for all Knovex agent-ready tools.

    OCP: new tools are added by creating a new file and calling register()
         (or using @register_tool decorator). Registry never changes.
    SRP: only responsible for storing and retrieving tool descriptors.
    """

    def __init__(self) -> None:
        self._tools: dict[str, ToolDescriptor] = {}

    def register(
        self,
        name: str,
        description: str,
        input_schema: dict[str, Any] | None = None,
        handler: ToolCallable | None = None,
    ) -> None:
        """Register a tool by name. Overwrites if already registered."""
        self._tools[name] = ToolDescriptor(
            name=name,
            description=description,
            input_schema=input_schema or {},
            handler=handler,
        )
        logger.debug("Registered tool: %s", name)

    def get(self, name: str) -> ToolDescriptor | None:
        """Return the ToolDescriptor for *name*, or None."""
        return self._tools.get(name)

    def list_tools(self) -> ToolsListResponse:
        """Return all tools as an API response."""
        return ToolsListResponse(
            tools=[t.to_tool_info() for t in self._tools.values()]
        )

    def all_names(self) -> list[str]:
        return list(self._tools.keys())

    async def invoke(self, name: str, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Invoke a tool by name.

        Sprint 1: raises NotImplementedError (tools are stubs).
        Sprint 2+: delegates to the registered handler.
        """
        descriptor = self.get(name)
        if descriptor is None:
            raise ValueError(f"Unknown tool: '{name}'")
        if descriptor.handler is None:
            raise NotImplementedError(
                f"Tool '{name}' has no handler registered yet (Sprint 2+)"
            )
        return await descriptor.handler(payload)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_registry = ToolRegistry()


def get_tool_registry() -> ToolRegistry:
    """FastAPI Depends() provider. Returns the singleton registry."""
    return _registry


# ---------------------------------------------------------------------------
# Decorator for self-registering tools (Plugin Pattern)
# ---------------------------------------------------------------------------

def register_tool(
    name: str,
    description: str,
    input_schema: dict[str, Any] | None = None,
) -> Callable[[ToolCallable], ToolCallable]:
    """
    Decorator to register an async function as a Knovex tool.

    Example::

        @register_tool(
            name="kb_search",
            description="Search a knowledge base",
            input_schema={"type": "object", "properties": {"query": {"type": "string"}}},
        )
        async def kb_search_handler(payload: dict) -> dict:
            ...
    """
    def decorator(fn: ToolCallable) -> ToolCallable:
        _registry.register(name=name, description=description, input_schema=input_schema, handler=fn)
        return fn
    return decorator


# ---------------------------------------------------------------------------
# Built-in tool stubs — registered at import time
# ---------------------------------------------------------------------------

_registry.register(
    name="kb_search",
    description=(
        "Search a knowledge base using hybrid RAG (FTS5 + ANN). "
        "Returns ranked passages with source citations."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "query":  {"type": "string", "description": "The search query"},
            "kb_id":  {"type": "string", "description": "Target KB UUID (omit to search all KBs)"},
            "top_k":  {"type": "integer", "default": 5},
        },
        "required": ["query"],
    },
)

_registry.register(
    name="web_search",
    description=(
        "Search the web using the configured engine "
        "(DuckDuckGo, Serper, or Brave). Returns title, URL, and snippet."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "query":       {"type": "string"},
            "num_results": {"type": "integer", "default": 5},
        },
        "required": ["query"],
    },
)

_registry.register(
    name="summarize",
    description="Summarize a file or an entire KB.",
    input_schema={
        "type": "object",
        "properties": {
            "kb_id":   {"type": "string"},
            "file_id": {"type": "string", "description": "Omit to summarize the whole KB"},
            "length":  {"type": "string", "enum": ["brief", "detailed"], "default": "brief"},
        },
        "required": ["kb_id"],
    },
)

_registry.register(
    name="file_read",
    description="Read and return the rendered content of a file in a KB.",
    input_schema={
        "type": "object",
        "properties": {
            "kb_id":   {"type": "string"},
            "file_id": {"type": "string"},
            "page":    {"type": "integer", "default": 1},
        },
        "required": ["kb_id", "file_id"],
    },
)

_registry.register(
    name="learn_generate",
    description=(
        "Generate an interactive learning session (quiz, flashcard, mind map, "
        "story, timeline, ELI5) from a topic, PDF, or URL."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "topic":       {"type": "string"},
            "format":      {"type": "string", "enum": ["quiz", "flashcard", "mindmap", "story", "timeline", "eli5", "speedlearn", "brainstorm"]},
            "source_type": {"type": "string", "enum": ["pdf", "url", "topic"]},
            "source_ref":  {"type": "string"},
            "difficulty":  {"type": "string", "enum": ["beginner", "intermediate", "expert"], "default": "intermediate"},
        },
        "required": ["topic", "format", "source_type"],
    },
)
