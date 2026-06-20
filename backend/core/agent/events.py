"""
Typed events emitted by the ReAct loop.

The agent yields these; ChatService translates them to the existing SSE wire
protocol (``sources`` / ``token`` / ``done``) plus an optional ``agent_step``
event the frontend can render as a "thinking / searching…" trace (and can
safely ignore until it does).
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AgentStep:
    """A reasoning step: the model's thought and the action it chose."""

    thought: str
    action: str
    action_input: dict = field(default_factory=dict)


@dataclass
class Observation:
    """The result of running a tool, surfaced for the step trace."""

    tool: str
    content: str


@dataclass
class Sources:
    """KB / web source rows accumulated during the run, emitted before tokens."""

    sources: list[dict] = field(default_factory=list)
    web_sources: list[dict] = field(default_factory=list)


@dataclass
class Token:
    """One token of the final, streamed answer."""

    text: str


AgentEvent = AgentStep | Observation | Sources | Token
