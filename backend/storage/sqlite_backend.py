"""
SQLite Storage Backend

Concrete implementation of IStorageBackend using aiosqlite.

LSP: fully substitutable for any other IStorageBackend — callers that
     receive an IStorageBackend can use this without knowing it's SQLite.

Design notes:
  - Each public method opens and closes its own connection (simple, safe).
  - For heavy workloads in Phase 2 a connection pool would be used, but
    aiosqlite + WAL mode is fast enough for a single-user desktop app.
  - Row factory is set to aiosqlite.Row so rows can be accessed by
    column name as well as index.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import aiosqlite

from backend.storage.base import IStorageBackend

logger = logging.getLogger("knovex.storage.sqlite")


class SQLiteBackend(IStorageBackend):
    """
    aiosqlite-backed storage backend.

    Accepts the database file path at construction time so it can be
    swapped between the production database and an in-memory :memory:
    database for tests:

        production = SQLiteBackend(Path("knovex.db"))
        test_db    = SQLiteBackend(Path(":memory:"))
    """

    def __init__(self, db_path: Path | str) -> None:
        self._db_path = str(db_path)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        """No-op for per-method connections (here for interface compliance)."""
        logger.debug("SQLiteBackend: connect() called (per-method mode)")

    async def disconnect(self) -> None:
        """No-op for per-method connections."""
        logger.debug("SQLiteBackend: disconnect() called")

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    async def fetchone(
        self, query: str, params: tuple[Any, ...] = ()
    ) -> dict[str, Any] | None:
        async with self._get_connection() as db:
            cursor = await db.execute(query, params)
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def fetchall(
        self, query: str, params: tuple[Any, ...] = ()
    ) -> list[dict[str, Any]]:
        async with self._get_connection() as db:
            cursor = await db.execute(query, params)
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    async def execute(
        self, query: str, params: tuple[Any, ...] = ()
    ) -> None:
        async with self._get_connection() as db:
            await db.execute(query, params)
            await db.commit()

    async def executemany(
        self, query: str, params_list: list[tuple[Any, ...]]
    ) -> None:
        async with self._get_connection() as db:
            await db.executemany(query, params_list)
            await db.commit()

    async def executescript(self, script: str) -> None:
        async with self._get_connection() as db:
            await db.executescript(script)
            await db.commit()

    # ------------------------------------------------------------------
    # Transaction context manager
    # ------------------------------------------------------------------

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[aiosqlite.Connection]:
        """
        Async context manager for explicit multi-statement transactions.

        Commits on clean exit, rolls back on exception.

        Usage::

            async with backend.transaction() as conn:
                await conn.execute("INSERT INTO ...")
                await conn.execute("UPDATE ...")
        """
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA foreign_keys=ON")
            try:
                yield db
                await db.commit()
            except Exception:
                await db.rollback()
                raise

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @asynccontextmanager
    async def _get_connection(self) -> AsyncIterator[aiosqlite.Connection]:
        """Open an aiosqlite connection with standard pragmas applied."""
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA foreign_keys=ON")
            yield db
