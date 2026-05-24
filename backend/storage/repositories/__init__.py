"""
Repository Pattern Package

Exports all repository interfaces and concrete implementations
so that the rest of the codebase can import from a single location.
"""

from backend.storage.repositories.base import (
    EntityNotFoundError,
    IRepository,
    RepositoryError,
    SQLiteRepository,
)
from backend.storage.repositories.kb_repository import (
    IKBRepository,
    SQLiteKBRepository,
)
from backend.storage.repositories.file_repository import (
    IFileRepository,
    SQLiteFileRepository,
)

__all__ = [
    # Base
    "IRepository",
    "SQLiteRepository",
    "EntityNotFoundError",
    "RepositoryError",
    # KB
    "IKBRepository",
    "SQLiteKBRepository",
    # File
    "IFileRepository",
    "SQLiteFileRepository",
]
