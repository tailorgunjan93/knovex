"""
File Record Repository

Concrete SQLite implementation of IFileRepository.

Tracks all files within Knowledge Bases: ingestion status, content hash,
chunk counts, and per-file error messages.
"""

from __future__ import annotations

import logging
from abc import abstractmethod
from datetime import datetime
from typing import Any

from backend.core.domain.file_record import FileRecord
from backend.storage.repositories.base import IRepository, SQLiteRepository

logger = logging.getLogger("knovex.repo.file")


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class IFileRepository(IRepository[FileRecord]):
    """File-specific extension of the generic repository interface."""

    @abstractmethod
    async def find_by_kb(self, kb_id: str) -> list[FileRecord]:
        """Return all files belonging to *kb_id*, newest first."""
        ...

    @abstractmethod
    async def find_by_path(self, kb_id: str, file_path: str) -> FileRecord | None:
        """Return the file with *file_path* inside *kb_id*, or None."""
        ...

    @abstractmethod
    async def find_by_status(self, status: str) -> list[FileRecord]:
        """Return all files whose status equals *status*."""
        ...

    @abstractmethod
    async def find_all_ready_or_stale(self) -> list[FileRecord]:
        """Return files that are ready or stale (candidates for watcher scan)."""
        ...

    @abstractmethod
    async def update_status(
        self,
        file_id: str,
        status: str,
        *,
        chunk_count: int | None = None,
        ingested_at: datetime | None = None,
        error_message: str | None = None,
    ) -> None:
        """Partial update — only touches provided fields."""
        ...

    @abstractmethod
    async def delete_chunks(self, file_id: str) -> None:
        """Remove all indexed chunks for *file_id* before re-ingestion."""
        ...


# ---------------------------------------------------------------------------
# Concrete SQLite implementation
# ---------------------------------------------------------------------------

class SQLiteFileRepository(SQLiteRepository[FileRecord], IFileRepository):
    """
    aiosqlite-backed file record repository.

    Datetime fields: ISO-8601 strings in the DB, datetime objects in Python.
    None / NULL handling is explicit to avoid confusion across the layer.
    """

    _TABLE = "file_records"

    # ------------------------------------------------------------------
    # Mapping helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_file(row: dict[str, Any]) -> FileRecord:
        return FileRecord(
            id=row["id"],
            kb_id=row["kb_id"],
            name=row["name"],
            file_path=row["file_path"],
            format=row["format"],
            size_bytes=int(row["size_bytes"] or 0),
            status=row["status"],
            content_hash=row.get("content_hash"),
            chunk_count=int(row["chunk_count"] or 0),
            version=int(row["version"] or 1),
            added_at=datetime.fromisoformat(row["added_at"]),
            ingested_at=(
                datetime.fromisoformat(row["ingested_at"])
                if row.get("ingested_at")
                else None
            ),
            error_message=row.get("error_message"),
        )

    @staticmethod
    def _file_to_params(f: FileRecord) -> tuple:
        return (
            f.id,
            f.kb_id,
            f.name,
            f.file_path,
            f.format,
            f.size_bytes,
            f.status,
            f.content_hash,
            f.chunk_count,
            f.version,
            f.added_at.isoformat(),
            f.ingested_at.isoformat() if f.ingested_at else None,
            f.error_message,
        )

    # ------------------------------------------------------------------
    # IRepository[FileRecord]
    # ------------------------------------------------------------------

    async def find_by_id(self, entity_id: str) -> FileRecord | None:
        row = await self._backend.fetchone(
            "SELECT * FROM file_records WHERE id = ?",
            (entity_id,),
        )
        return self._row_to_file(row) if row else None

    async def find_all(self) -> list[FileRecord]:
        rows = await self._backend.fetchall(
            "SELECT * FROM file_records ORDER BY added_at DESC",
        )
        return [self._row_to_file(r) for r in rows]

    async def save(self, entity: FileRecord) -> FileRecord:
        """UPSERT — INSERT or full UPDATE on conflict."""
        await self._backend.execute(
            """
            INSERT INTO file_records
                (id, kb_id, name, file_path, format, size_bytes, status,
                 content_hash, chunk_count, version, added_at, ingested_at, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name          = excluded.name,
                file_path     = excluded.file_path,
                format        = excluded.format,
                size_bytes    = excluded.size_bytes,
                status        = excluded.status,
                content_hash  = excluded.content_hash,
                chunk_count   = excluded.chunk_count,
                version       = excluded.version,
                added_at      = excluded.added_at,
                ingested_at   = excluded.ingested_at,
                error_message = excluded.error_message
            """,
            self._file_to_params(entity),
        )
        logger.debug("Saved file record: %s (%s)", entity.name, entity.id)
        return entity

    async def delete(self, entity_id: str) -> None:
        await self._backend.execute(
            "DELETE FROM file_records WHERE id = ?",
            (entity_id,),
        )
        logger.debug("Deleted file record: %s", entity_id)

    # ------------------------------------------------------------------
    # IFileRepository extras
    # ------------------------------------------------------------------

    async def find_by_kb(self, kb_id: str) -> list[FileRecord]:
        rows = await self._backend.fetchall(
            "SELECT * FROM file_records WHERE kb_id = ? ORDER BY added_at DESC",
            (kb_id,),
        )
        return [self._row_to_file(r) for r in rows]

    async def find_by_path(self, kb_id: str, file_path: str) -> FileRecord | None:
        row = await self._backend.fetchone(
            "SELECT * FROM file_records WHERE kb_id = ? AND file_path = ?",
            (kb_id, file_path),
        )
        return self._row_to_file(row) if row else None

    async def find_by_status(self, status: str) -> list[FileRecord]:
        rows = await self._backend.fetchall(
            "SELECT * FROM file_records WHERE status = ?",
            (status,),
        )
        return [self._row_to_file(r) for r in rows]

    async def find_all_ready_or_stale(self) -> list[FileRecord]:
        rows = await self._backend.fetchall(
            "SELECT * FROM file_records WHERE status IN ('ready', 'stale')",
        )
        return [self._row_to_file(r) for r in rows]

    async def update_status(
        self,
        file_id: str,
        status: str,
        *,
        chunk_count: int | None = None,
        ingested_at: datetime | None = None,
        error_message: str | None = None,
    ) -> None:
        """
        Partial update of mutable status fields.
        Only columns with non-None values are written.
        """
        sets: list[str] = ["status = ?"]
        params: list[Any] = [status]

        if chunk_count is not None:
            sets.append("chunk_count = ?")
            params.append(chunk_count)
        if ingested_at is not None:
            sets.append("ingested_at = ?")
            params.append(ingested_at.isoformat())
        if error_message is not None:
            sets.append("error_message = ?")
            params.append(error_message)

        params.append(file_id)
        await self._backend.execute(
            f"UPDATE file_records SET {', '.join(sets)} WHERE id = ?",
            tuple(params),
        )

    async def delete_chunks(self, file_id: str) -> None:
        """Remove all chunks for this file (before re-ingestion)."""
        await self._backend.execute(
            "DELETE FROM chunks WHERE file_id = ?",
            (file_id,),
        )
        logger.debug("Deleted chunks for file: %s", file_id)
