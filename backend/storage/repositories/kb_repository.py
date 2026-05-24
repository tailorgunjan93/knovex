"""
Knowledge Base Repository

Concrete SQLite implementation of IKBRepository.

OCP: Adding a new KB-specific query = add a method here. Service code
     untouched because it depends on the interface, not this class.
DIP: KBService depends on IKBRepository (abstract), injected at runtime.
"""

from __future__ import annotations

import logging
from abc import abstractmethod
from datetime import datetime
from typing import Any

from backend.core.domain.kb import KB
from backend.storage.repositories.base import IRepository, SQLiteRepository

logger = logging.getLogger("knovex.repo.kb")


# ---------------------------------------------------------------------------
# Abstract interface — ISP: only KB-specific queries
# ---------------------------------------------------------------------------

class IKBRepository(IRepository[KB]):
    """KB-specific extension of the generic repository interface."""

    @abstractmethod
    async def find_by_name(self, name: str) -> KB | None:
        """Return the KB with *name*, or None."""
        ...

    @abstractmethod
    async def count_files(self, kb_id: str) -> int:
        """Return the number of file records for *kb_id*."""
        ...

    @abstractmethod
    async def total_size_bytes(self, kb_id: str) -> int:
        """Return total file bytes across all files in *kb_id*."""
        ...

    @abstractmethod
    async def total_chunks(self, kb_id: str) -> int:
        """Return total indexed chunks across all files in *kb_id*."""
        ...


# ---------------------------------------------------------------------------
# Concrete SQLite implementation
# ---------------------------------------------------------------------------

class SQLiteKBRepository(SQLiteRepository[KB], IKBRepository):
    """
    aiosqlite-backed KB repository.

    All datetime values are stored as ISO-8601 strings in UTC and
    parsed back to datetime objects on read.
    """

    _TABLE = "knowledge_bases"

    # ------------------------------------------------------------------
    # Mapping helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_kb(row: dict[str, Any]) -> KB:
        return KB(
            id=row["id"],
            name=row["name"],
            color=row["color"],
            icon=row["icon"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    @staticmethod
    def _kb_to_params(kb: KB) -> tuple:
        return (
            kb.id,
            kb.name,
            kb.color,
            kb.icon,
            kb.created_at.isoformat(),
            kb.updated_at.isoformat(),
        )

    # ------------------------------------------------------------------
    # IRepository[KB] implementation
    # ------------------------------------------------------------------

    async def find_by_id(self, entity_id: str) -> KB | None:
        row = await self._backend.fetchone(
            "SELECT * FROM knowledge_bases WHERE id = ?",
            (entity_id,),
        )
        return self._row_to_kb(row) if row else None

    async def find_all(self) -> list[KB]:
        rows = await self._backend.fetchall(
            "SELECT * FROM knowledge_bases ORDER BY created_at DESC",
        )
        return [self._row_to_kb(r) for r in rows]

    async def save(self, entity: KB) -> KB:
        """UPSERT — handles both INSERT and UPDATE transparently."""
        await self._backend.execute(
            """
            INSERT INTO knowledge_bases (id, name, color, icon, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name       = excluded.name,
                color      = excluded.color,
                icon       = excluded.icon,
                updated_at = excluded.updated_at
            """,
            self._kb_to_params(entity),
        )
        logger.debug("Saved KB: %s (%s)", entity.name, entity.id)
        return entity

    async def delete(self, entity_id: str) -> None:
        await self._backend.execute(
            "DELETE FROM knowledge_bases WHERE id = ?",
            (entity_id,),
        )
        logger.debug("Deleted KB: %s", entity_id)

    # ------------------------------------------------------------------
    # IKBRepository extras
    # ------------------------------------------------------------------

    async def find_by_name(self, name: str) -> KB | None:
        row = await self._backend.fetchone(
            "SELECT * FROM knowledge_bases WHERE name = ? COLLATE NOCASE",
            (name,),
        )
        return self._row_to_kb(row) if row else None

    async def count_files(self, kb_id: str) -> int:
        row = await self._backend.fetchone(
            "SELECT COUNT(*) AS cnt FROM file_records WHERE kb_id = ?",
            (kb_id,),
        )
        return int(row["cnt"]) if row else 0

    async def total_size_bytes(self, kb_id: str) -> int:
        row = await self._backend.fetchone(
            "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM file_records WHERE kb_id = ?",
            (kb_id,),
        )
        return int(row["total"]) if row else 0

    async def total_chunks(self, kb_id: str) -> int:
        row = await self._backend.fetchone(
            "SELECT COALESCE(SUM(chunk_count), 0) AS total FROM file_records WHERE kb_id = ?",
            (kb_id,),
        )
        return int(row["total"]) if row else 0
