"""
Knovex ReAct agent package.

A capability-gated agentic layer for chat. Capable cloud models run a bounded
Thought→Action→Observation loop (``react.ReActAgent``) that decides for itself
whether to search the knowledge base, search the web, or just answer. Small /
local models take a deterministic fallback (``router``) so they stay reliable
and fast.

Root cause this fixes: the previous chat pipeline retrieved KB context and
forced grounding on *every* message, so a greeting like "hi" produced a
confabulated answer from an irrelevant chunk. The agent only uses a tool when
the query actually calls for one.
"""

from __future__ import annotations

from backend.core.agent.capability import supports_react

__all__ = ["supports_react"]
