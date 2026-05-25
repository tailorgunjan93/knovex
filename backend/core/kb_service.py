"""
Knowledge Base Service — Facade + Orchestrator

Responsibilities:
  - KB CRUD (create, read, update, delete)
  - File management within a KB (add, remove, reindex, update path)
  - Delegates file parsing to IngestionService (SRP)
  - Delegates storage to IKBRepository + IFileRepository (DIP)
  - Emits typed events via EventBus (Observer)

SOLID compliance:
  SRP  — only KB/file orchestration; no parsing, no SQL, no encryption
  OCP  — new KB operations = new method here; parsers/repos untouched
  DIP  — constructor-injected interfaces; never touches SQLite directly
  LSP  — all injected types satisfy their interface contracts
  ISP  — uses IKBRepository / IFileRepository, not a god-repo

Design patterns used:
  Facade      — single entry point for all KB operations
  Repository  — data access decoupled behind IKBRepository / IFileRepository
  Observer    — state changes published to EventBus
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from backend.core.domain.file_record import SUPPORTED_FORMATS, FileRecord, FileStatus
from backend.core.domain.kb import KB
from backend.core.ingestion_service import IngestionService, compute_sha256
from backend.events.bus import EventBus
from backend.events.types import (
    FileAddedEvent,
    KBCreatedEvent,
    KBDeletedEvent,
)
from backend.models.schemas import (
    FileAddRequest,
    FileListResponse,
    FileRecordResponse,
    FileStatusResponse,
    FileUpdatePathRequest,
    KBCreate,
    KBListResponse,
    KBResponse,
    KBStats,
    KBUpdate,
    ReindexResponse,
)
from backend.storage.repositories.base import EntityNotFoundError
from backend.storage.repositories.file_repository import IFileRepository
from backend.storage.repositories.kb_repository import IKBRepository

logger = logging.getLogger("knovex.kb_service")


class KBService:
    """
    Application service for Knowledge Base operations.

    All public methods are async and return Pydantic response models so
    the API layer can pass them directly to FastAPI.
    """

    def __init__(
        self,
        kb_repo: IKBRepository,
        file_repo: IFileRepository,
        ingestion_svc: IngestionService,
        event_bus: EventBus,
    ) -> None:
        self._kb_repo = kb_repo
        self._file_repo = file_repo
        self._ingestion_svc = ingestion_svc
        self._event_bus = event_bus

    # ==================================================================
    # KB CRUD
    # ==================================================================

    async def list_kbs(self) -> KBListResponse:
        """Return all knowledge bases with live stats."""
        kbs = await self._kb_repo.find_all()
        responses = [await self._kb_with_stats(kb) for kb in kbs]
        return KBListResponse(kbs=responses)

    async def create_kb(self, data: KBCreate) -> KBResponse:
        """Create and persist a new Knowledge Base."""
        now = datetime.utcnow()
        kb = KB(
            id=str(uuid4()),
            name=data.name.strip(),
            color=data.color,
            icon=data.icon,
            created_at=now,
            updated_at=now,
        )
        await self._kb_repo.save(kb)
        logger.info("Created KB: %s (%s)", kb.name, kb.id)

        await self._event_bus.emit_typed(KBCreatedEvent(kb_id=kb.id, kb_name=kb.name))
        return self._kb_to_response(kb, KBStats())

    async def get_kb(self, kb_id: str) -> KBResponse:
        """Return a single KB with live stats; raises 404 if missing."""
        kb = await self._require_kb(kb_id)
        return await self._kb_with_stats(kb)

    async def update_kb(self, kb_id: str, data: KBUpdate) -> KBResponse:
        """Partial-update a KB's name/color/icon."""
        kb = await self._require_kb(kb_id)
        if data.name is not None:
            kb.rename(data.name)
        if data.color is not None or data.icon is not None:
            kb.update_appearance(data.color, data.icon)
        await self._kb_repo.save(kb)
        return await self._kb_with_stats(kb)

    async def delete_kb(self, kb_id: str) -> None:
        """Delete a KB and all its files (CASCADE in DB handles chunks too)."""
        await self._require_kb(kb_id)
        await self._kb_repo.delete(kb_id)
        logger.info("Deleted KB: %s", kb_id)
        await self._event_bus.emit_typed(KBDeletedEvent(kb_id=kb_id))

    async def reindex_kb(self, kb_id: str) -> ReindexResponse:
        """Queue all ready/stale files in a KB for re-ingestion."""
        await self._require_kb(kb_id)
        files = await self._file_repo.find_by_kb(kb_id)
        task_id = str(uuid4())

        count = 0
        for f in files:
            if f.status in (FileStatus.READY, FileStatus.STALE, FileStatus.ERROR):
                f.reset_for_reingest()
                await self._file_repo.save(f)
                asyncio.create_task(
                    self._ingestion_svc.ingest(f.id, f.kb_id, f.file_path, f.format)
                )
                count += 1

        logger.info("Reindexing %d file(s) in KB %s (task=%s)", count, kb_id, task_id)
        return ReindexResponse(
            task_id=task_id,
            status=f"queued {count} file(s)",
        )

    # ==================================================================
    # File management
    # ==================================================================

    async def list_files(self, kb_id: str) -> FileListResponse:
        """Return all files in a KB."""
        await self._require_kb(kb_id)
        files = await self._file_repo.find_by_kb(kb_id)
        return FileListResponse(files=[self._file_to_response(f) for f in files])

    async def add_file(self, kb_id: str, req: FileAddRequest) -> FileRecordResponse:
        """
        Register a file in a KB and trigger async ingestion.

        Validates:
          - KB exists
          - File path exists on disk
          - Format is supported
          - File not already in this KB
        """
        await self._require_kb(kb_id)

        file_path = Path(req.file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found on disk: {req.file_path}")
        if not file_path.is_file():
            raise ValueError(f"Path is not a file: {req.file_path}")

        fmt = file_path.suffix.lstrip(".").lower()
        if fmt not in SUPPORTED_FORMATS:
            raise ValueError(
                f"Unsupported format: .{fmt}. "
                f"Supported: {', '.join(sorted(SUPPORTED_FORMATS))}"
            )

        # Duplicate check (same path in same KB)
        existing = await self._file_repo.find_by_path(kb_id, str(file_path))
        if existing:
            raise ValueError(f"File is already in this KB: {file_path.name}")

        # Compute hash (run in thread pool — may be large)
        content_hash = await asyncio.get_event_loop().run_in_executor(
            None, compute_sha256, file_path
        )

        now = datetime.utcnow()
        record = FileRecord(
            id=str(uuid4()),
            kb_id=kb_id,
            name=file_path.name,
            file_path=str(file_path),
            format=fmt,
            size_bytes=file_path.stat().st_size,
            status=FileStatus.PENDING,
            content_hash=content_hash,
            chunk_count=0,
            version=1,
            added_at=now,
        )
        await self._file_repo.save(record)

        # Fire-and-forget ingestion task
        asyncio.create_task(
            self._ingestion_svc.ingest(record.id, kb_id, str(file_path), fmt),
            name=f"ingest-{record.id}",
        )

        logger.info("Added file %s to KB %s", file_path.name, kb_id)
        await self._event_bus.emit_typed(FileAddedEvent(
            file_id=record.id,
            kb_id=kb_id,
            file_name=file_path.name,
            file_path=str(file_path),
        ))

        return self._file_to_response(record)

    async def get_file(self, kb_id: str, file_id: str) -> FileRecordResponse:
        """Return a single file record."""
        file = await self._require_file(kb_id, file_id)
        return self._file_to_response(file)

    async def get_file_status(self, kb_id: str, file_id: str) -> FileStatusResponse:
        """Lightweight ingestion progress response."""
        file = await self._require_file(kb_id, file_id)
        progress = 1.0 if file.status == FileStatus.READY else (
            0.5 if file.status == FileStatus.INGESTING else 0.0
        )
        return FileStatusResponse(
            id=file.id,
            status=file.status,
            progress=progress,
            chunks_indexed=file.chunk_count,
            error=file.error_message,
        )

    async def remove_file(self, kb_id: str, file_id: str) -> None:
        """Remove a file and all its chunks from a KB."""
        await self._require_file(kb_id, file_id)
        await self._file_repo.delete_chunks(file_id)
        await self._file_repo.delete(file_id)
        logger.info("Removed file %s from KB %s", file_id, kb_id)

    async def reindex_file(self, kb_id: str, file_id: str) -> FileRecordResponse:
        """Re-queue a single file for ingestion."""
        file = await self._require_file(kb_id, file_id)
        file.reset_for_reingest()
        await self._file_repo.save(file)
        asyncio.create_task(
            self._ingestion_svc.ingest(file.id, file.kb_id, file.file_path, file.format),
            name=f"ingest-{file.id}",
        )
        logger.info("Reindexing file %s in KB %s", file_id, kb_id)
        return self._file_to_response(file)

    async def update_file_path(
        self, kb_id: str, file_id: str, req: FileUpdatePathRequest
    ) -> FileRecordResponse:
        """
        Update the stored path for a missing file then re-ingest.
        Typical use-case: user moved the file to a new location.
        """
        file = await self._require_file(kb_id, file_id)
        new_path = Path(req.new_path)
        if not new_path.exists():
            raise FileNotFoundError(f"New path does not exist: {req.new_path}")

        # Recompute hash from new path
        content_hash = await asyncio.get_event_loop().run_in_executor(
            None, compute_sha256, new_path
        )

        file.file_path = str(new_path)
        file.name = new_path.name
        file.content_hash = content_hash
        file.size_bytes = new_path.stat().st_size
        file.reset_for_reingest()

        await self._file_repo.save(file)
        asyncio.create_task(
            self._ingestion_svc.ingest(file.id, file.kb_id, file.file_path, file.format),
            name=f"ingest-{file.id}",
        )
        return self._file_to_response(file)

    # ==================================================================
    # Private helpers
    # ==================================================================

    async def _require_kb(self, kb_id: str) -> KB:
        """Return the KB or raise EntityNotFoundError."""
        kb = await self._kb_repo.find_by_id(kb_id)
        if kb is None:
            raise EntityNotFoundError("KB", kb_id)
        return kb

    async def _require_file(self, kb_id: str, file_id: str) -> FileRecord:
        """Return the file or raise EntityNotFoundError."""
        file = await self._file_repo.find_by_id(file_id)
        if file is None or file.kb_id != kb_id:
            raise EntityNotFoundError("FileRecord", file_id)
        return file

    async def _get_kb_stats(self, kb_id: str) -> KBStats:
        return KBStats(
            file_count=await self._kb_repo.count_files(kb_id),
            total_size_bytes=await self._kb_repo.total_size_bytes(kb_id),
            total_chunks=await self._kb_repo.total_chunks(kb_id),
        )

    async def _kb_with_stats(self, kb: KB) -> KBResponse:
        stats = await self._get_kb_stats(kb.id)
        return self._kb_to_response(kb, stats)

    @staticmethod
    def _kb_to_response(kb: KB, stats: KBStats) -> KBResponse:
        return KBResponse(
            id=kb.id,
            name=kb.name,
            color=kb.color,
            icon=kb.icon,
            created_at=kb.created_at,
            updated_at=kb.updated_at,
            stats=stats,
        )

    @staticmethod
    def _file_to_response(f: FileRecord) -> FileRecordResponse:
        return FileRecordResponse(
            id=f.id,
            kb_id=f.kb_id,
            name=f.name,
            format=f.format,
            size_bytes=f.size_bytes,
            status=f.status,
            content_hash=f.content_hash,
            chunk_count=f.chunk_count,
            version=f.version,
            added_at=f.added_at,
            ingested_at=f.ingested_at,
            error_message=f.error_message,
        )
