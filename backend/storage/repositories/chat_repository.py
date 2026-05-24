"""
Chat Repository — Sprint 4

IChatRepository:  abstract interface (DIP — services depend on this)
SQLiteChatRepository: concrete SQLite implementation

Responsibilities:
  - Persist / retrieve ChatSession + ChatMessage entities
  - Count messages per session
  - Enforce cascade-delete (messages deleted with session via FK)
"""

from __future__ import annotations

import json
import logging
from abc import abstractmethod
from datetime import datetime
from typing import Any

from backend.core.domain.chat import ChatMessage, ChatSession
from backend.storage.repositories.base import EntityNotFoundError, SQLiteRepository

logger = logging.getLogger("knovex.repos.chat")

_DT_FMT = "%Y-%m-%dT%H:%M:%S.%f"


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()
    for fmt in (_DT_FMT, "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return datetime.utcnow()


# ---------------------------------------------------------------------------
# Interface
# ---------------------------------------------------------------------------

class IChatRepository(SQLiteRepository[ChatSession]):
    """Abstract interface for chat persistence."""

    @abstractmethod
    async def find_sessions_by_kb(self, kb_id: str) -> list[ChatSession]:
        """Return all sessions scoped to *kb_id*."""
        ...

    @abstractmethod
    async def find_messages(self, session_id: str) -> list[ChatMessage]:
        """Return all messages for *session_id* ordered by created_at."""
        ...

    @abstractmethod
    async def save_message(self, message: ChatMessage) -> ChatMessage:
        """Persist a new message."""
        ...

    @abstractmethod
    async def delete_message(self, message_id: str) -> None:
        """Delete a single message."""
        ...


# ---------------------------------------------------------------------------
# SQLite implementation
# ---------------------------------------------------------------------------

class SQLiteChatRepository(IChatRepository):
    """SQLite-backed chat repository."""

    # ── Sessions ──────────────────────────────────────────────────────────

    async def find_by_id(self, entity_id: str) -> ChatSession | None:
        row = await self._backend.fetchone(
            "SELECT cs.*, COUNT(cm.id) AS message_count "
            "FROM chat_sessions cs "
            "LEFT JOIN chat_messages cm ON cm.session_id = cs.id "
            "WHERE cs.id = ? "
            "GROUP BY cs.id",
            (entity_id,),
        )
        return _row_to_session(row) if row else None

    async def find_all(self) -> list[ChatSession]:
        rows = await self._backend.fetchall(
            "SELECT cs.*, COUNT(cm.id) AS message_count "
            "FROM chat_sessions cs "
            "LEFT JOIN chat_messages cm ON cm.session_id = cs.id "
            "GROUP BY cs.id "
            "ORDER BY cs.updated_at DESC"
        )
        return [_row_to_session(r) for r in rows]

    async def find_sessions_by_kb(self, kb_id: str) -> list[ChatSession]:
        rows = await self._backend.fetchall(
            "SELECT cs.*, COUNT(cm.id) AS message_count "
            "FROM chat_sessions cs "
            "LEFT JOIN chat_messages cm ON cm.session_id = cs.id "
            "WHERE cs.kb_id = ? "
            "GROUP BY cs.id "
            "ORDER BY cs.updated_at DESC",
            (kb_id,),
        )
        return [_row_to_session(r) for r in rows]

    async def save(self, session: ChatSession) -> ChatSession:
        await self._backend.execute(
            """
            INSERT INTO chat_sessions (id, kb_id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title      = excluded.title,
                kb_id      = excluded.kb_id,
                updated_at = excluded.updated_at
            """,
            (
                session.id,
                session.kb_id,
                session.title,
                session.created_at.strftime(_DT_FMT),
                session.updated_at.strftime(_DT_FMT),
            ),
        )
        return session

    async def delete(self, entity_id: str) -> None:
        await self._backend.execute(
            "DELETE FROM chat_sessions WHERE id = ?", (entity_id,)
        )

    async def exists(self, entity_id: str) -> bool:
        row = await self._backend.fetchone(
            "SELECT 1 FROM chat_sessions WHERE id = ?", (entity_id,)
        )
        return row is not None

    # ── Messages ──────────────────────────────────────────────────────────

    async def find_messages(self, session_id: str) -> list[ChatMessage]:
        rows = await self._backend.fetchall(
            "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        )
        return [_row_to_message(r) for r in rows]

    async def save_message(self, message: ChatMessage) -> ChatMessage:
        await self._backend.execute(
            """
            INSERT INTO chat_messages
                (id, session_id, role, content, sources, web_sources, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                content     = excluded.content,
                sources     = excluded.sources,
                web_sources = excluded.web_sources
            """,
            (
                message.id,
                message.session_id,
                message.role,
                message.content,
                json.dumps(message.sources),
                json.dumps(message.web_sources),
                message.created_at.strftime(_DT_FMT),
            ),
        )
        return message

    async def delete_message(self, message_id: str) -> None:
        await self._backend.execute(
            "DELETE FROM chat_messages WHERE id = ?", (message_id,)
        )


# ---------------------------------------------------------------------------
# Row → entity converters
# ---------------------------------------------------------------------------

def _row_to_session(row: dict[str, Any]) -> ChatSession:
    return ChatSession(
        id=row["id"],
        title=row["title"],
        kb_id=row.get("kb_id"),
        created_at=_parse_dt(row.get("created_at")),
        updated_at=_parse_dt(row.get("updated_at")),
        message_count=int(row.get("message_count") or 0),
    )


def _row_to_message(row: dict[str, Any]) -> ChatMessage:
    sources: list[dict] = []
    web_sources: list[dict] = []
    try:
        sources = json.loads(row.get("sources") or "[]")
    except (json.JSONDecodeError, TypeError):
        pass
    try:
        web_sources = json.loads(row.get("web_sources") or "[]")
    except (json.JSONDecodeError, TypeError):
        pass
    return ChatMessage(
        id=row["id"],
        session_id=row["session_id"],
        role=row["role"],
        content=row["content"],
        sources=sources,
        web_sources=web_sources,
        created_at=_parse_dt(row.get("created_at")),
    )
