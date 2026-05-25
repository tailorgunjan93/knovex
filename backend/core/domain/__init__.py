"""Domain entities — pure Python dataclasses, no framework dependencies."""

from backend.core.domain.file_record import FileRecord
from backend.core.domain.kb import KB

__all__ = ["KB", "FileRecord"]
