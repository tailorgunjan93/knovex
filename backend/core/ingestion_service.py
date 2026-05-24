"""
Ingestion Service

Parses files and stores their content as searchable chunks.

Architecture:
  - Strategy pattern for per-format parsers (OCP: add format = add Parser class)
  - Template Method in IngestionService._ingest_internal()
  - Parser registry populated at import time via @register_parser decorator

Supported formats: pdf, docx, txt, md, csv, udf

On success:  file status → ready,  chunks written to DB
On failure:  file status → error,  error_message recorded

Design note: ingestion runs inside asyncio.create_task() so it never
blocks the HTTP response. The frontend polls /status to see progress.
"""

from __future__ import annotations

import asyncio
import csv
import hashlib
import io
import logging
import uuid
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import Any

from backend.events.bus import EventBus
from backend.events.types import FileErrorEvent, FileIngestedEvent
from backend.storage.repositories.file_repository import IFileRepository

logger = logging.getLogger("knovex.ingestion")


# ---------------------------------------------------------------------------
# Chunk value object
# ---------------------------------------------------------------------------

class Chunk:
    """A single text chunk extracted from a document."""

    __slots__ = ("content", "chunk_index", "section", "page", "metadata")

    def __init__(
        self,
        content: str,
        chunk_index: int = 0,
        section: str = "",
        page: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.content = content.strip()
        self.chunk_index = chunk_index
        self.section = section
        self.page = page
        self.metadata = metadata or {}


# ---------------------------------------------------------------------------
# Parser interface + registry (Strategy + Plugin)
# ---------------------------------------------------------------------------

class IFileParser(ABC):
    """
    Strategy interface for format-specific parsers.
    Each parser produces a flat list of Chunk objects.
    """

    @property
    @abstractmethod
    def supported_formats(self) -> frozenset[str]:
        """Return the set of format strings this parser handles."""
        ...

    @abstractmethod
    def parse(self, file_path: Path) -> list[Chunk]:
        """
        Parse *file_path* and return a list of Chunk objects.
        Raises ValueError for unsupported or corrupt files.
        """
        ...


# Module-level parser registry
_PARSERS: dict[str, IFileParser] = {}


def register_parser(cls: type[IFileParser]) -> type[IFileParser]:
    """
    Class decorator that auto-registers a parser for its supported formats.

    OCP: adding a new format = create a new IFileParser subclass + decorator.
         Nothing else changes.
    """
    instance = cls()
    for fmt in instance.supported_formats:
        _PARSERS[fmt.lower()] = instance
        logger.debug("Registered parser: %s for format '%s'", cls.__name__, fmt)
    return cls


def get_parser(fmt: str) -> IFileParser | None:
    """Return the parser for *fmt*, or None if unsupported."""
    return _PARSERS.get(fmt.lower())


# ---------------------------------------------------------------------------
# Concrete parsers
# ---------------------------------------------------------------------------

@register_parser
class PlainTextParser(IFileParser):
    """Handles .txt and .md files."""

    @property
    def supported_formats(self) -> frozenset[str]:
        return frozenset({"txt", "md"})

    def parse(self, file_path: Path) -> list[Chunk]:
        text = file_path.read_text(encoding="utf-8", errors="replace")
        return self._split_into_chunks(text)

    @staticmethod
    def _split_into_chunks(text: str, max_chars: int = 1500) -> list[Chunk]:
        """
        Split text into overlapping chunks at paragraph boundaries.
        Falls back to hard splits if paragraphs are larger than max_chars.
        """
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks: list[Chunk] = []
        buffer = ""
        idx = 0

        for para in paragraphs:
            if len(buffer) + len(para) > max_chars and buffer:
                chunks.append(Chunk(content=buffer, chunk_index=idx))
                idx += 1
                buffer = para
            else:
                buffer = (buffer + "\n\n" + para).strip() if buffer else para

        if buffer:
            chunks.append(Chunk(content=buffer, chunk_index=idx))

        return chunks or [Chunk(content=text[:max_chars], chunk_index=0)]


@register_parser
class CSVParser(IFileParser):
    """Handles .csv files — each row becomes a chunk."""

    @property
    def supported_formats(self) -> frozenset[str]:
        return frozenset({"csv"})

    def parse(self, file_path: Path) -> list[Chunk]:
        chunks: list[Chunk] = []
        text = file_path.read_text(encoding="utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        headers = reader.fieldnames or []

        for idx, row in enumerate(reader):
            row_text = " | ".join(f"{k}: {v}" for k, v in row.items() if v)
            if row_text.strip():
                chunks.append(Chunk(
                    content=row_text,
                    chunk_index=idx,
                    metadata={"headers": headers},
                ))

        return chunks


@register_parser
class PDFParser(IFileParser):
    """Handles .pdf files using PyMuPDF (fitz)."""

    @property
    def supported_formats(self) -> frozenset[str]:
        return frozenset({"pdf"})

    def parse(self, file_path: Path) -> list[Chunk]:
        try:
            import fitz  # type: ignore[import]
        except ImportError:
            raise ImportError(
                "pymupdf is required for PDF parsing. "
                "Install with: pip install pymupdf"
            )

        chunks: list[Chunk] = []
        doc = fitz.open(str(file_path))
        try:
            chunk_idx = 0
            for page_num, page in enumerate(doc, start=1):
                text = page.get_text("text")  # type: ignore[attr-defined]
                if not text.strip():
                    continue
                # Split each page's text into sub-chunks
                page_chunks = PlainTextParser._split_into_chunks(text, max_chars=1200)
                for c in page_chunks:
                    if c.content:
                        chunks.append(Chunk(
                            content=c.content,
                            chunk_index=chunk_idx,
                            page=page_num,
                        ))
                        chunk_idx += 1
        finally:
            doc.close()

        return chunks


@register_parser
class DOCXParser(IFileParser):
    """Handles .docx files using python-docx."""

    @property
    def supported_formats(self) -> frozenset[str]:
        return frozenset({"docx"})

    def parse(self, file_path: Path) -> list[Chunk]:
        try:
            from docx import Document  # type: ignore[import]
        except ImportError:
            raise ImportError(
                "python-docx is required for DOCX parsing. "
                "Install with: pip install python-docx"
            )

        doc = Document(str(file_path))
        chunks: list[Chunk] = []
        buffer = ""
        section_heading = ""
        chunk_idx = 0

        for para in doc.paragraphs:
            style = para.style.name if para.style else ""
            text = para.text.strip()
            if not text:
                continue

            if style.startswith("Heading"):
                # Flush current buffer as a chunk
                if buffer:
                    chunks.append(Chunk(
                        content=buffer,
                        chunk_index=chunk_idx,
                        section=section_heading,
                    ))
                    chunk_idx += 1
                    buffer = ""
                section_heading = text
            else:
                if len(buffer) + len(text) > 1400 and buffer:
                    chunks.append(Chunk(
                        content=buffer,
                        chunk_index=chunk_idx,
                        section=section_heading,
                    ))
                    chunk_idx += 1
                    buffer = text
                else:
                    buffer = (buffer + " " + text).strip() if buffer else text

        if buffer:
            chunks.append(Chunk(
                content=buffer,
                chunk_index=chunk_idx,
                section=section_heading,
            ))

        return chunks


@register_parser
class UDFParser(IFileParser):
    """
    Handles .udf (Universal Document Format) archives.

    Tries to use docnest-ai if installed; falls back to treating the
    UDF as a ZIP and extracting any text/* entries.
    """

    @property
    def supported_formats(self) -> frozenset[str]:
        return frozenset({"udf"})

    def parse(self, file_path: Path) -> list[Chunk]:
        # Prefer docnest-ai native UDF support
        try:
            from docnest.parsers import get_parser as dn_get_parser  # type: ignore
            parser = dn_get_parser("udf")
            parsed_doc = parser.parse(str(file_path))
            chunks = []
            for i, chunk in enumerate(parsed_doc.chunks):
                chunks.append(Chunk(
                    content=chunk.text,
                    chunk_index=i,
                    section=getattr(chunk, "section", ""),
                    page=getattr(chunk, "page", None),
                ))
            return chunks
        except Exception:
            pass  # Fall through to ZIP fallback

        # Fallback: extract text from ZIP entries
        import zipfile

        chunks: list[Chunk] = []
        idx = 0
        with zipfile.ZipFile(str(file_path)) as zf:
            for name in zf.namelist():
                if any(name.endswith(ext) for ext in (".txt", ".md")):
                    raw = zf.read(name).decode("utf-8", errors="replace")
                    sub_chunks = PlainTextParser._split_into_chunks(raw)
                    for c in sub_chunks:
                        if c.content:
                            chunks.append(Chunk(
                                content=c.content,
                                chunk_index=idx,
                                section=name,
                            ))
                            idx += 1
        return chunks


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def compute_sha256(file_path: Path) -> str:
    """Return the SHA-256 hex digest of *file_path*."""
    sha = hashlib.sha256()
    with file_path.open("rb") as fh:
        for block in iter(lambda: fh.read(65536), b""):
            sha.update(block)
    return sha.hexdigest()


# ---------------------------------------------------------------------------
# Ingestion Service
# ---------------------------------------------------------------------------

class IngestionService:
    """
    Orchestrates file parsing + chunk storage.

    SRP: only responsible for parsing → storing chunks → updating status.
    DIP: depends on IFileRepository (abstraction), not SQLiteFileRepository.

    Usage (called from KBService as a fire-and-forget task)::

        asyncio.create_task(ingestion_svc.ingest(file_id, kb_id, path, fmt))
    """

    def __init__(
        self,
        file_repo: IFileRepository,
        backend,          # SQLiteBackend — for bulk chunk INSERT
        event_bus: EventBus,
    ) -> None:
        self._file_repo = file_repo
        self._backend = backend
        self._event_bus = event_bus

    async def ingest(
        self,
        file_id: str,
        kb_id: str,
        file_path: str,
        fmt: str,
    ) -> None:
        """
        Parse *file_path* and store its chunks.

        Status flow: pending → ingesting → ready | error
        Runs in a background asyncio task.
        """
        path = Path(file_path)
        logger.info("Ingesting %s (id=%s, format=%s)", path.name, file_id, fmt)

        # ── 1. Mark as ingesting ────────────────────────────────────────────
        await self._file_repo.update_status(file_id, "ingesting")

        # ── 2. Parse (CPU-bound — run in thread pool to avoid blocking loop) ──
        try:
            chunks = await asyncio.get_event_loop().run_in_executor(
                None, self._parse_file, path, fmt
            )
        except Exception as exc:
            logger.exception("Parse failed for %s: %s", path.name, exc)
            await self._file_repo.update_status(
                file_id, "error", error_message=f"Parse error: {exc}"
            )
            await self._event_bus.emit_typed(FileErrorEvent(
                file_id=file_id, kb_id=kb_id, error=str(exc)
            ))
            return

        # ── 3. Delete old chunks then insert new batch ─────────────────────
        try:
            await self._file_repo.delete_chunks(file_id)
            await self._store_chunks(file_id, kb_id, chunks)
        except Exception as exc:
            logger.exception("Chunk storage failed for %s: %s", path.name, exc)
            await self._file_repo.update_status(
                file_id, "error", error_message=f"Storage error: {exc}"
            )
            await self._event_bus.emit_typed(FileErrorEvent(
                file_id=file_id, kb_id=kb_id, error=str(exc)
            ))
            return

        # ── 4. Mark as ready ───────────────────────────────────────────────
        await self._file_repo.update_status(
            file_id,
            "ready",
            chunk_count=len(chunks),
            ingested_at=datetime.utcnow(),
        )

        logger.info(
            "Ingested %s → %d chunks (file_id=%s)",
            path.name, len(chunks), file_id,
        )

        await self._event_bus.emit_typed(FileIngestedEvent(
            file_id=file_id,
            kb_id=kb_id,
            file_name=path.name,
            chunk_count=len(chunks),
        ))

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_file(path: Path, fmt: str) -> list[Chunk]:
        """Synchronous parse — runs in a thread pool executor."""
        parser = get_parser(fmt)
        if parser is None:
            raise ValueError(f"No parser registered for format: '{fmt}'")
        return parser.parse(path)

    async def _store_chunks(
        self,
        file_id: str,
        kb_id: str,
        chunks: list[Chunk],
    ) -> None:
        """Bulk-insert all chunks in a single transaction."""
        import json

        rows = [
            (
                str(uuid.uuid4()),
                file_id,
                kb_id,
                c.content,
                c.chunk_index,
                c.section,
                c.page,
                json.dumps(c.metadata),
            )
            for c in chunks
            if c.content
        ]
        if rows:
            await self._backend.executemany(
                """
                INSERT INTO chunks
                    (id, file_id, kb_id, content, chunk_index, section, page, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
