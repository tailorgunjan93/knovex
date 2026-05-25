"""
Storage Backend Interfaces (ISP-compliant)

Split into focused interfaces instead of one wide ABC:

  IReadableStorage  — SELECT operations
  IWritableStorage  — INSERT / UPDATE / DELETE
  IStorageBackend   — full backend (readable + writable + lifecycle)

This satisfies ISP: a read-only replica or cache only needs to implement
IReadableStorage, not the full backend interface.

LSP: any IStorageBackend can substitute for another — callers never check
the concrete type.

OCP: add a new storage backend (PostgreSQL, DynamoDB) by implementing
IStorageBackend. Existing code never changes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

# ---------------------------------------------------------------------------
# Narrow read interface
# ---------------------------------------------------------------------------

class IReadableStorage(ABC):
    """Read-only storage operations."""

    @abstractmethod
    async def fetchone(
        self, query: str, params: tuple[Any, ...] = ()
    ) -> dict[str, Any] | None:
        """Execute a SELECT and return the first row as a dict, or None."""
        ...

    @abstractmethod
    async def fetchall(
        self, query: str, params: tuple[Any, ...] = ()
    ) -> list[dict[str, Any]]:
        """Execute a SELECT and return all matching rows as a list of dicts."""
        ...


# ---------------------------------------------------------------------------
# Narrow write interface
# ---------------------------------------------------------------------------

class IWritableStorage(ABC):
    """Write storage operations."""

    @abstractmethod
    async def execute(
        self, query: str, params: tuple[Any, ...] = ()
    ) -> None:
        """Execute an INSERT / UPDATE / DELETE statement."""
        ...

    @abstractmethod
    async def executemany(
        self, query: str, params_list: list[tuple[Any, ...]]
    ) -> None:
        """Execute a parameterised statement for multiple rows."""
        ...


# ---------------------------------------------------------------------------
# Full backend (lifecycle + schema management)
# ---------------------------------------------------------------------------

class IStorageBackend(IReadableStorage, IWritableStorage):
    """
    Full storage backend interface.

    Combines read + write + lifecycle management (connect, disconnect,
    schema creation).

    Concrete implementations:
      - SQLiteBackend  (Phase 1 — local, zero-setup)
      - PostgreSQLBackend  (Phase 2 — cloud version, same interface)
    """

    @abstractmethod
    async def connect(self) -> None:
        """Open the connection / pool."""
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        """Close the connection / pool gracefully."""
        ...

    @abstractmethod
    async def executescript(self, script: str) -> None:
        """
        Execute a multi-statement SQL script (DDL, migrations).
        Not all backends support this identically — use for schema init only.
        """
        ...

    @abstractmethod
    async def transaction(self):
        """
        Async context manager for explicit transactions.

        Usage::

            async with backend.transaction():
                await backend.execute("INSERT INTO ...")
                await backend.execute("UPDATE ...")
        """
        ...
