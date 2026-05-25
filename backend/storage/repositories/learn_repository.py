"""
Learn Repository — Sprint 6

ILearnRepository:     abstract interface (DIP)
SQLiteLearnRepository: concrete SQLite implementation
"""

from __future__ import annotations

import json
import logging
from abc import abstractmethod
from datetime import datetime
from typing import Any

from backend.core.domain.learn import LearnSession, UserStats
from backend.storage.repositories.base import EntityNotFoundError, SQLiteRepository

logger = logging.getLogger("knovex.repos.learn")

_DT_FMT = "%Y-%m-%dT%H:%M:%S.%f"


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in (_DT_FMT, "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def _fmt_dt(dt: datetime | None) -> str | None:
    return dt.strftime(_DT_FMT) if dt else None


# ---------------------------------------------------------------------------
# Interface
# ---------------------------------------------------------------------------

class ILearnRepository(SQLiteRepository[LearnSession]):
    """Abstract interface for learn-mode persistence."""

    @abstractmethod
    async def get_user_stats(self) -> UserStats:
        """Return the singleton UserStats row (always exists)."""
        ...

    @abstractmethod
    async def save_user_stats(self, stats: UserStats) -> None:
        """Persist UserStats (upsert on id=1)."""
        ...

    @abstractmethod
    async def find_sessions(self, limit: int = 50) -> list[LearnSession]:
        """Return recent sessions ordered by created_at DESC."""
        ...


# ---------------------------------------------------------------------------
# SQLite implementation
# ---------------------------------------------------------------------------

class SQLiteLearnRepository(ILearnRepository):

    # ── LearnSession ──────────────────────────────────────────────────────

    async def find_by_id(self, entity_id: str) -> LearnSession | None:
        row = await self._backend.fetchone(
            "SELECT * FROM learn_sessions WHERE id = ?", (entity_id,)
        )
        return _row_to_session(row) if row else None

    async def find_all(self) -> list[LearnSession]:
        rows = await self._backend.fetchall(
            "SELECT * FROM learn_sessions ORDER BY created_at DESC"
        )
        return [_row_to_session(r) for r in rows]

    async def find_sessions(self, limit: int = 50) -> list[LearnSession]:
        rows = await self._backend.fetchall(
            "SELECT * FROM learn_sessions ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        return [_row_to_session(r) for r in rows]

    async def save(self, session: LearnSession) -> LearnSession:
        await self._backend.execute(
            """
            INSERT INTO learn_sessions
                (id, topic, format, source_type, source_ref, difficulty,
                 status, content, created_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status       = excluded.status,
                content      = excluded.content,
                completed_at = excluded.completed_at
            """,
            (
                session.id,
                session.topic,
                session.format,
                session.source_type,
                session.source_ref,
                session.difficulty,
                session.status,
                json.dumps(session.content) if session.content is not None else None,
                _fmt_dt(session.created_at),
                _fmt_dt(session.completed_at),
            ),
        )
        return session

    async def delete(self, entity_id: str) -> None:
        await self._backend.execute(
            "DELETE FROM learn_sessions WHERE id = ?", (entity_id,)
        )

    async def exists(self, entity_id: str) -> bool:
        row = await self._backend.fetchone(
            "SELECT 1 FROM learn_sessions WHERE id = ?", (entity_id,)
        )
        return row is not None

    # ── UserStats ─────────────────────────────────────────────────────────

    async def get_user_stats(self) -> UserStats:
        row = await self._backend.fetchone(
            "SELECT * FROM user_stats WHERE id = 1"
        )
        if not row:
            # Insert default row (should have been created by schema DDL)
            stats = UserStats()
            await self.save_user_stats(stats)
            return stats
        return _row_to_stats(row)

    async def save_user_stats(self, stats: UserStats) -> None:
        await self._backend.execute(
            """
            INSERT INTO user_stats (id, xp, level, streak, last_activity, badges)
            VALUES (1, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                xp            = excluded.xp,
                level         = excluded.level,
                streak        = excluded.streak,
                last_activity = excluded.last_activity,
                badges        = excluded.badges
            """,
            (
                stats.xp,
                stats.level,
                stats.streak,
                _fmt_dt(stats.last_activity),
                json.dumps(stats.badges),
            ),
        )


# ---------------------------------------------------------------------------
# Row → entity converters
# ---------------------------------------------------------------------------

def _row_to_session(row: dict[str, Any]) -> LearnSession:
    content = None
    raw_content = row.get("content")
    if raw_content:
        try:
            content = json.loads(raw_content)
        except (json.JSONDecodeError, TypeError):
            pass
    return LearnSession(
        id=row["id"],
        topic=row["topic"],
        format=row["format"],
        source_type=row["source_type"],
        source_ref=row.get("source_ref"),
        difficulty=row.get("difficulty", "intermediate"),
        status=row.get("status", "pending"),
        content=content,
        created_at=_parse_dt(row.get("created_at")) or datetime.utcnow(),
        completed_at=_parse_dt(row.get("completed_at")),
    )


def _row_to_stats(row: dict[str, Any]) -> UserStats:
    badges: list[str] = []
    try:
        badges = json.loads(row.get("badges") or "[]")
    except (json.JSONDecodeError, TypeError):
        pass
    return UserStats(
        xp=int(row.get("xp") or 0),
        level=int(row.get("level") or 1),
        streak=int(row.get("streak") or 0),
        last_activity=_parse_dt(row.get("last_activity")),
        badges=badges,
    )
