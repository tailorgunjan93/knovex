"""
Typed Event Payloads

All events emitted via the EventBus are typed dataclasses.
This replaces raw dict payloads with self-documenting, IDE-friendly structs.

Usage::

    from backend.events.types import FileIngestedEvent
    from backend.events.bus import bus

    # Emit
    await bus.emit_typed(FileIngestedEvent(kb_id="...", file_id="...", chunk_count=47))

    # Subscribe (handlers receive the specific type)
    @bus.on(FileIngestedEvent.event_name)
    async def on_ingested(payload: dict) -> None:
        event = FileIngestedEvent(**payload)
        print(f"File {event.file_id} ingested: {event.chunk_count} chunks")

OCP: add a new event type by adding a new dataclass here — no other changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Base event
# ---------------------------------------------------------------------------

@dataclass
class BaseEvent:
    """
    Base class for all Knovex events.

    Every event has:
      - event_name: class-level constant used as the bus topic string
      - occurred_at: auto-stamped ISO 8601 timestamp
    """
    event_name: str = field(init=False, repr=False)
    occurred_at: str = field(default_factory=_now_iso)

    def to_dict(self) -> dict[str, Any]:
        """Serialise to plain dict for the EventBus (which works with dicts)."""
        return asdict(self)


# ---------------------------------------------------------------------------
# Knowledge Base events
# ---------------------------------------------------------------------------

@dataclass
class KBCreatedEvent(BaseEvent):
    event_name: str = field(init=False, default="kb.created", repr=False)
    kb_id: str = ""
    kb_name: str = ""        # human-readable name for logging


@dataclass
class KBDeletedEvent(BaseEvent):
    event_name: str = field(init=False, default="kb.deleted", repr=False)
    kb_id: str = ""


# ---------------------------------------------------------------------------
# File events
# ---------------------------------------------------------------------------

@dataclass
class FileAddedEvent(BaseEvent):
    event_name: str = field(init=False, default="kb.file.added", repr=False)
    kb_id: str = ""
    file_id: str = ""
    file_path: str = ""
    file_name: str = ""      # basename for display


@dataclass
class FileIngestedEvent(BaseEvent):
    event_name: str = field(init=False, default="kb.file.ingested", repr=False)
    kb_id: str = ""
    file_id: str = ""
    file_name: str = ""      # basename for display
    chunk_count: int = 0


@dataclass
class FileStaleEvent(BaseEvent):
    event_name: str = field(init=False, default="kb.file.stale", repr=False)
    kb_id: str = ""
    file_id: str = ""
    file_name: str = ""
    file_path: str = ""


@dataclass
class FileMissingEvent(BaseEvent):
    event_name: str = field(init=False, default="kb.file.missing", repr=False)
    kb_id: str = ""
    file_id: str = ""
    file_name: str = ""
    last_known_path: str = ""


@dataclass
class FileErrorEvent(BaseEvent):
    event_name: str = field(init=False, default="kb.file.error", repr=False)
    kb_id: str = ""
    file_id: str = ""
    error: str = ""


# ---------------------------------------------------------------------------
# KB re-index events
# ---------------------------------------------------------------------------

@dataclass
class ReindexStartedEvent(BaseEvent):
    event_name: str = field(init=False, default="kb.reindex.started", repr=False)
    kb_id: str = ""
    task_id: str = ""


@dataclass
class ReindexDoneEvent(BaseEvent):
    event_name: str = field(init=False, default="kb.reindex.done", repr=False)
    kb_id: str = ""
    task_id: str = ""
    total_chunks: int = 0


# ---------------------------------------------------------------------------
# Settings events
# ---------------------------------------------------------------------------

@dataclass
class SettingsChangedEvent(BaseEvent):
    event_name: str = field(init=False, default="settings.changed", repr=False)
    changed_keys: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Learn Mode events
# ---------------------------------------------------------------------------

@dataclass
class LearnSessionCompleteEvent(BaseEvent):
    event_name: str = field(init=False, default="learn.session.complete", repr=False)
    session_id: str = ""
    xp_earned: int = 0
    score: float = 0.0
