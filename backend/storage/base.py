"""
Abstract Storage Backend

Defines the interface that all storage backends must implement.
Currently only SQLite is used (Phase 1), but the abstraction allows
PostgreSQL to be dropped in for the cloud version in Phase 2 without
touching any service code.
"""

from abc import ABC, abstractmethod
from typing import Any


class StorageBackend(ABC):
    """Abstract base class for Knovex storage backends."""

    @abstractmethod
    async def connect(self) -> None:
        """Open / initialise the connection."""
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        """Close the connection gracefully."""
        ...

    @abstractmethod
    async def execute(self, query: str, params: tuple[Any, ...] = ()) -> None:
        """Execute a write statement (INSERT / UPDATE / DELETE)."""
        ...

    @abstractmethod
    async def fetchone(
        self, query: str, params: tuple[Any, ...] = ()
    ) -> dict[str, Any] | None:
        """Execute a SELECT and return the first row as a dict (or None)."""
        ...

    @abstractmethod
    async def fetchall(
        self, query: str, params: tuple[Any, ...] = ()
    ) -> list[dict[str, Any]]:
        """Execute a SELECT and return all rows as a list of dicts."""
        ...

    @abstractmethod
    async def executescript(self, script: str) -> None:
        """Execute a multi-statement SQL script (DDL, migrations)."""
        ...
