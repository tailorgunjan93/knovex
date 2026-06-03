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
import html as _htmllib
import io
import logging
import re
import uuid
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import Any

from backend.adapters import docnest_adapter
from backend.adapters.document_parsers import (
    IParagraphAdapter,
    IPDFAdapter,
    PyMuPDFAdapter,
    PythonDocxAdapter,
)
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


def _try_docnest(file_path: Path) -> list[Chunk] | None:
    """
    Best-effort: parse via docnest-ai (normalisation + OCR) when it's installed.

    Document ingestion is docnest's domain, not Knovex's — so when the engine is
    available we delegate to it (this is how we get OCR for scans/design PDFs
    without owning any of it). All docnest contact goes through the
    ``docnest_adapter`` anti-corruption seam. Returns Chunks, or None when
    docnest is absent or can't handle the file, so the caller falls back to the
    lightweight adapter.
    """
    sections = docnest_adapter.parse_document(file_path)
    if not sections:
        return None
    chunks: list[Chunk] = []
    idx = 0
    for sec in sections:
        for c in PlainTextParser._split_into_chunks(sec.text, max_chars=1200):
            if not c.content:
                continue
            chunks.append(Chunk(
                content=c.content,
                chunk_index=idx,
                section=sec.section,
                page=sec.page,
            ))
            idx += 1
    return chunks or None


def _html_to_plain(html: str) -> str:
    """
    Strip HTML to plain text for indexing. Drops <img> tags entirely (so base64
    data URIs never enter the index) and all other markup; unescapes entities
    and collapses whitespace. An image-only page → "".
    """
    s = re.sub(r"<img\b[^>]*>", " ", html, flags=re.IGNORECASE)   # drop images (base64)
    s = re.sub(r"<[^>]+>", " ", s)                                # strip remaining tags
    s = _htmllib.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


@register_parser
class PDFParser(IFileParser):
    """
    Handles .pdf files.

    DIP: depends on IPDFAdapter (abstraction), not fitz directly.
    The adapter (PyMuPDFAdapter by default) is injected at construction so
    tests can pass a StubPDFAdapter without needing pymupdf installed.
    """

    def __init__(self, pdf_adapter: IPDFAdapter | None = None) -> None:
        self._adapter = pdf_adapter or PyMuPDFAdapter()

    @property
    def supported_formats(self) -> frozenset[str]:
        return frozenset({"pdf"})

    def parse(self, file_path: Path) -> list[Chunk]:
        # Prefer docnest (normalisation + OCR) when installed; else lightweight PyMuPDF.
        dn = _try_docnest(file_path)
        if dn is not None:
            return dn

        pages = self._adapter.extract_pages(file_path)
        chunks: list[Chunk] = []
        chunk_idx = 0
        for page in pages:
            # Index PLAIN TEXT — never the display HTML. Otherwise base64 <img>
            # data URIs (image/raster pages) get stored as "content", polluting
            # FTS + embeddings and feeding the assistant garbage.
            page_text = _html_to_plain(page.text) if page.is_html else page.text
            if not page_text.strip():
                continue   # image-only page with no extractable text → no chunk
            sub_chunks = PlainTextParser._split_into_chunks(page_text, max_chars=1200)
            for c in sub_chunks:
                if c.content:
                    chunks.append(Chunk(
                        content=c.content,
                        chunk_index=chunk_idx,
                        page=page.page_num,
                    ))
                    chunk_idx += 1
        return chunks


@register_parser
class DOCXParser(IFileParser):
    """
    Handles .docx files.

    DIP: depends on IParagraphAdapter (abstraction), not python-docx directly.
    The adapter (PythonDocxAdapter by default) is injected at construction so
    tests can pass a StubParagraphAdapter without python-docx installed.
    """

    def __init__(self, paragraph_adapter: IParagraphAdapter | None = None) -> None:
        self._adapter = paragraph_adapter or PythonDocxAdapter()

    @property
    def supported_formats(self) -> frozenset[str]:
        return frozenset({"docx"})

    def parse(self, file_path: Path) -> list[Chunk]:
        paragraphs = self._adapter.extract_paragraphs(file_path)
        chunks: list[Chunk] = []
        buffer = ""
        section_heading = ""
        chunk_idx = 0

        for para in paragraphs:
            if para.style.startswith("Heading"):
                # Flush buffer before starting a new section
                if buffer:
                    chunks.append(Chunk(
                        content=buffer,
                        chunk_index=chunk_idx,
                        section=section_heading,
                    ))
                    chunk_idx += 1
                    buffer = ""
                section_heading = para.text
            else:
                if len(buffer) + len(para.text) > 1400 and buffer:
                    chunks.append(Chunk(
                        content=buffer,
                        chunk_index=chunk_idx,
                        section=section_heading,
                    ))
                    chunk_idx += 1
                    buffer = para.text
                else:
                    buffer = (buffer + " " + para.text).strip() if buffer else para.text

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
        # Prefer docnest-ai when installed (via the anti-corruption seam). It
        # may decline .udf (the factory parses documents, not docnest's own
        # archive format) — then we fall through to the ZIP extractor below.
        dn = _try_docnest(file_path)
        if dn is not None:
            return dn

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
    Orchestrates file parsing + chunk storage + optional dense embedding.

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
        embedder=None,    # IEmbedder | None — if provided, chunks get vector embeddings
    ) -> None:
        self._file_repo = file_repo
        self._backend = backend
        self._event_bus = event_bus
        self._embedder = embedder

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
            chunk_ids = await self._store_chunks(file_id, kb_id, chunks)
        except Exception as exc:
            logger.exception("Chunk storage failed for %s: %s", path.name, exc)
            await self._file_repo.update_status(
                file_id, "error", error_message=f"Storage error: {exc}"
            )
            await self._event_bus.emit_typed(FileErrorEvent(
                file_id=file_id, kb_id=kb_id, error=str(exc)
            ))
            return

        # ── 3b. Dense embeddings (optional) ───────────────────────────────
        if self._embedder and getattr(self._embedder, "is_available", False):
            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, self._embed_and_store_sync, chunk_ids, chunks
                )
                logger.info("Embedded %d chunks for file_id=%s", len(chunks), file_id)
                # Invalidate the FAISS index for this KB so it rebuilds on
                # the next query with the newly stored embedding vectors.
                from backend.adapters.vector_index import kb_vector_index
                kb_vector_index.invalidate(kb_id)
            except Exception as exc:
                # Non-fatal: log and continue — FTS5 still works
                logger.warning("Embedding failed for %s (FTS5 still active): %s", path.name, exc)

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
    ) -> list[str]:
        """Bulk-insert all chunks in a single transaction. Returns list of inserted IDs."""
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
        return [r[0] for r in rows]

    def _embed_and_store_sync(self, chunk_ids: list[str], chunks: list[Chunk]) -> None:
        """
        Compute embeddings synchronously (runs in thread-pool executor).
        Updates the embedding BLOB column for each chunk row.
        """
        import sqlite3

        import numpy as np

        from backend.core.config import settings as app_cfg

        texts = [c.content for c in chunks if c.content]
        if not texts or not chunk_ids:
            return

        vectors = self._embedder.embed(texts)  # list[list[float]]

        # Write directly with sync sqlite3 (we're in a thread, not async context)
        conn = sqlite3.connect(str(app_cfg.db_path))
        try:
            for cid, vec in zip(chunk_ids, vectors, strict=False):
                blob = np.array(vec, dtype=np.float32).tobytes()
                conn.execute("UPDATE chunks SET embedding = ? WHERE id = ?", (blob, cid))
            conn.commit()
        finally:
            conn.close()
