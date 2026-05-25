"""
FileRecord — Domain Entity

Tracks a single file that has been added to a Knowledge Base.
Status machine: pending → ingesting → ready | error
                ready → stale (content changed on disk)
                ready | stale → missing (file deleted/moved)
                stale | missing → pending (re-add / path update)

SRP: only holds file metadata; no I/O here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum


class FileStatus(StrEnum):
    PENDING   = "pending"
    INGESTING = "ingesting"
    READY     = "ready"
    STALE     = "stale"
    MISSING   = "missing"
    ERROR     = "error"


# Allowed format identifiers (lower-case extension without dot)
SUPPORTED_FORMATS = frozenset({"pdf", "docx", "txt", "md", "csv", "udf"})


@dataclass
class FileRecord:
    """
    Tracks a file within a Knowledge Base.

    ``file_path`` is the absolute path on the host file system.
    ``content_hash`` (SHA-256 hex) is used by the watcher to detect changes.
    ``chunk_count`` is updated by IngestionService after successful indexing.
    """

    id: str
    kb_id: str
    name: str                           # display name (basename)
    file_path: str                      # absolute OS path
    format: str                         # pdf | docx | txt | md | csv | udf
    size_bytes: int = 0
    status: str = FileStatus.PENDING
    content_hash: str | None = None
    chunk_count: int = 0
    version: int = 1                    # incremented on re-ingest
    added_at: datetime = field(default_factory=datetime.utcnow)
    ingested_at: datetime | None = None
    error_message: str | None = None

    # -------------------------------------------------------------------------
    # State transitions (enforced here, not scattered across services)
    # -------------------------------------------------------------------------

    def mark_ingesting(self) -> None:
        self.status = FileStatus.INGESTING
        self.error_message = None

    def mark_ready(self, chunk_count: int) -> None:
        self.status = FileStatus.READY
        self.chunk_count = chunk_count
        self.ingested_at = datetime.utcnow()
        self.error_message = None

    def mark_error(self, message: str) -> None:
        self.status = FileStatus.ERROR
        self.error_message = message

    def mark_stale(self) -> None:
        if self.status == FileStatus.READY:
            self.status = FileStatus.STALE

    def mark_missing(self) -> None:
        self.status = FileStatus.MISSING

    def reset_for_reingest(self) -> None:
        """Re-queue after path update or manual reindex."""
        self.status = FileStatus.PENDING
        self.version += 1
        self.error_message = None
        self.chunk_count = 0
        self.ingested_at = None
