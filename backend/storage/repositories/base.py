"""
Repository Pattern — Base Interfaces

The Repository Pattern decouples the domain/service layer from the data access
layer. Services work with entity objects and call repository methods; they never
write SQL themselves.

DIP: services depend on IRepository[T] (abstract), not on SQLiteKBRepository
     (concrete). This lets you:
       - Swap SQLite for PostgreSQL without touching services
       - Inject an InMemoryRepository in tests for speed + isolation
       - Add caching, sharding, or read replicas without changing service code

OCP: adding a new entity (e.g. LearnSession) = add a new repository interface
     + concrete class. Existing code untouched.

ISP: each entity has its own narrow repository interface rather than a God repo.

Usage (Sprint 2)::

    # In a service
    class KBService:
        def __init__(self, kb_repo: IKBRepository, file_repo: IFileRepository) -> None:
            self._kb_repo = kb_repo
            self._file_repo = file_repo

        async def create_kb(self, name: str, color: str) -> KB:
            kb = KB(id=uuid4(), name=name, color=color, ...)
            return await self._kb_repo.save(kb)

    # In a FastAPI dependency
    def get_kb_service(db: SQLiteBackend = Depends(get_sqlite_backend)):
        return KBService(
            kb_repo=SQLiteKBRepository(db),
            file_repo=SQLiteFileRepository(db),
        )
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Generic, TypeVar

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Generic CRUD interface
# ---------------------------------------------------------------------------

class IRepository(ABC, Generic[T]):
    """
    Generic async repository interface.

    T is the entity type (KB, FileRecord, ChatSession, etc.)

    All implementations must be async-safe and raise specific exceptions:
      - EntityNotFoundError  when find_by_id returns nothing
      - RepositoryError      for infrastructure failures (DB down, etc.)
    """

    @abstractmethod
    async def find_by_id(self, entity_id: str) -> T | None:
        """
        Return the entity with *entity_id*, or None if not found.
        Implementations must not raise for missing IDs — return None.
        """
        ...

    @abstractmethod
    async def find_all(self) -> list[T]:
        """Return all entities of type T."""
        ...

    @abstractmethod
    async def save(self, entity: T) -> T:
        """
        Persist *entity* (INSERT or UPDATE).
        Returns the saved entity (may include DB-generated fields).
        """
        ...

    @abstractmethod
    async def delete(self, entity_id: str) -> None:
        """
        Delete the entity with *entity_id*.
        Silently succeeds if the entity doesn't exist.
        """
        ...

    @abstractmethod
    async def exists(self, entity_id: str) -> bool:
        """Return True if an entity with *entity_id* exists."""
        ...


# ---------------------------------------------------------------------------
# SQLite base — shared helpers for concrete SQLite repositories
# ---------------------------------------------------------------------------

class SQLiteRepository(IRepository[T], Generic[T]):
    """
    Base class for SQLite-backed repositories.

    Concrete repositories extend this and implement find_by_id, find_all,
    save, delete. This base class provides _backend and _row_to_entity().

    Sprint 2 will add:
      - SQLiteKBRepository
      - SQLiteFileRepository
      - SQLiteChatRepository
      - SQLiteLearnRepository
    """

    def __init__(self, backend) -> None:
        """
        Args:
            backend: SQLiteBackend instance providing async DB access.
        """
        self._backend = backend

    async def exists(self, entity_id: str) -> bool:
        """Default implementation: call find_by_id and check for None."""
        return await self.find_by_id(entity_id) is not None


# ---------------------------------------------------------------------------
# Repository exceptions
# ---------------------------------------------------------------------------

class EntityNotFoundError(Exception):
    """Raised when a required entity lookup returns nothing."""

    def __init__(self, entity_type: str, entity_id: str) -> None:
        super().__init__(f"{entity_type} '{entity_id}' not found")
        self.entity_type = entity_type
        self.entity_id = entity_id


class RepositoryError(Exception):
    """Raised for infrastructure failures (connection errors, constraint violations)."""
