"""
Reader Service — Sprint 3

Responsibilities:
  - Read file content from disk and render it as structured ContentBlocks
  - Inline Q&A: fetch stored chunks, build context, stream LLM answer via SSE
  - Paginate content for large files (PDF page-by-page, text by block-count)

Supported formats:
  txt / md  — paragraph blocks
  csv       — table_row blocks
  pdf       — page blocks (one page = one ContentBlock of type "page")
  docx      — heading + paragraph blocks (section-aware)
  udf       — delegated to IngestionService parsers (fallback)

SOLID:
  SRP  — only file rendering + Q&A coordination; no DB writes, no ingestion
  DIP  — depends on IFileRepository, ILLMService, adapters (not concrete impls)
  OCP  — add new format = add a renderer; nothing else changes
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
from collections.abc import AsyncGenerator
from pathlib import Path

# Optional import — SearchService may not be injected in all contexts
from typing import TYPE_CHECKING

from backend.adapters.document_parsers import (
    CachingPDFAdapter,
    IParagraphAdapter,
    IPDFAdapter,
    PyMuPDFAdapter,
    PythonDocxAdapter,
)
from backend.core.domain.file_record import FileRecord
from backend.core.llm_service import LLMService
from backend.core.providers.base import ProviderCredentials
from backend.models.schemas import (
    ContentBlock,
    FileAskRequest,
    FileContentResponse,
)
from backend.storage.repositories.base import EntityNotFoundError
from backend.storage.repositories.file_repository import IFileRepository

if TYPE_CHECKING:
    from backend.core.search_service import SearchService

logger = logging.getLogger("knovex.reader")

# Max chunks used as context for inline Q&A
_MAX_CONTEXT_CHUNKS = 20
_MAX_CONTEXT_CHARS  = 6000

# Blocks per page for pagination
_BLOCKS_PER_PAGE = 40


# ---------------------------------------------------------------------------
# Reader Service
# ---------------------------------------------------------------------------

class ReaderService:
    """
    Reads file content and powers inline Q&A.

    DIP: PDF/DOCX adapters are injected; can be swapped for stubs in tests.
    """

    def __init__(
        self,
        file_repo: IFileRepository,
        backend,                          # SQLiteBackend — for raw chunk queries
        llm_svc: LLMService,
        pdf_adapter: IPDFAdapter | None = None,
        para_adapter: IParagraphAdapter | None = None,
        search_svc: SearchService | None = None,   # injected for web search support
    ) -> None:
        self._file_repo = file_repo
        self._backend = backend
        self._llm_svc = llm_svc
        # Wrap the PDF adapter in a caching decorator so page turns don't
        # re-parse the whole document each time (Reader perf fix). The wrap is
        # transparent (same IPDFAdapter contract) and applies to injected stubs
        # too, which keeps tests fast and still exercises the cached path.
        #
        # CRITICAL: do NOT re-wrap an adapter that already caches. ReaderService
        # is built per-request (see dependencies.get_reader_service), so the
        # cache only survives across page turns when a *singleton*
        # CachingPDFAdapter is injected — re-wrapping it here would give each
        # request a fresh, empty cache and re-parse the whole PDF every turn.
        if isinstance(pdf_adapter, CachingPDFAdapter):
            self._pdf_adapter: IPDFAdapter = pdf_adapter
        else:
            self._pdf_adapter = CachingPDFAdapter(pdf_adapter or PyMuPDFAdapter())
        self._para_adapter = para_adapter or PythonDocxAdapter()
        self._search_svc = search_svc

    # ==================================================================
    # File content rendering
    # ==================================================================

    async def get_content(
        self,
        kb_id: str,
        file_id: str,
        page: int = 1,
    ) -> FileContentResponse:
        """
        Return a page of ContentBlocks for the given file.

        Page 1 = blocks 1–_BLOCKS_PER_PAGE, page 2 = next batch, etc.
        For PDF files each block is one page; page parameter maps 1:1.

        Raises EntityNotFoundError if file doesn't exist in this KB.
        Raises ValueError if file is not yet ingested (status ≠ ready/stale).
        """
        file = await self._require_file(kb_id, file_id)
        self._check_readable(file)

        blocks, total_pages = await asyncio.get_event_loop().run_in_executor(
            None, self._render_blocks, file, page
        )

        return FileContentResponse(
            id=file.id,
            name=file.name,
            format=file.format,
            total_pages=total_pages,
            current_page=page,
            content={
                "blocks": [b.model_dump() for b in blocks],
                "page": page,
                "total_pages": total_pages,
            },
        )

    def _render_blocks(
        self, file: FileRecord, page: int
    ) -> tuple[list[ContentBlock], int]:
        """Synchronous render — runs in thread pool executor."""
        renderer = self._get_renderer(file.format)
        all_blocks = renderer(Path(file.file_path))

        # PDF: page-per-block, page param maps directly
        if file.format == "pdf":
            total_pages = len(all_blocks) or 1
            page = max(1, min(page, total_pages))
            return [all_blocks[page - 1]] if all_blocks else [], total_pages

        # All other formats: slice by _BLOCKS_PER_PAGE
        total_pages = max(1, -(-len(all_blocks) // _BLOCKS_PER_PAGE))  # ceil div
        page = max(1, min(page, total_pages))
        start = (page - 1) * _BLOCKS_PER_PAGE
        return all_blocks[start : start + _BLOCKS_PER_PAGE], total_pages

    def _get_renderer(self, fmt: str):
        """Return the rendering callable for *fmt*."""
        renderers = {
            "txt": self._render_txt,
            "md":  self._render_md,
            "csv": self._render_csv,
            "pdf": self._render_pdf,
            "docx": self._render_docx,
            "udf": self._render_txt,   # fallback: raw text
        }
        renderer = renderers.get(fmt.lower())
        if renderer is None:
            raise ValueError(f"No renderer for format: '{fmt}'")
        return renderer

    # ------------------------------------------------------------------
    # Per-format renderers (synchronous — run in thread pool)
    # ------------------------------------------------------------------

    def _render_txt(self, path: Path) -> list[ContentBlock]:
        text = path.read_text(encoding="utf-8", errors="replace")
        blocks: list[ContentBlock] = []
        for para in text.split("\n\n"):
            para = para.strip()
            if para:
                blocks.append(ContentBlock(type="paragraph", content=para))
        return blocks or [ContentBlock(type="paragraph", content="(empty)")]

    def _render_md(self, path: Path) -> list[ContentBlock]:
        """Render Markdown — detect headings (#, ##, ###) as heading blocks."""
        text = path.read_text(encoding="utf-8", errors="replace")
        blocks: list[ContentBlock] = []
        buffer: list[str] = []

        def flush() -> None:
            joined = " ".join(buffer).strip()
            if joined:
                blocks.append(ContentBlock(type="paragraph", content=joined))
            buffer.clear()

        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                flush()
                level = len(stripped) - len(stripped.lstrip("#"))
                heading_text = stripped.lstrip("# ").strip()
                blocks.append(ContentBlock(
                    type="heading",
                    content=heading_text,
                    level=min(level, 6),
                ))
            elif stripped == "":
                flush()
            else:
                buffer.append(stripped)

        flush()
        return blocks

    def _render_csv(self, path: Path) -> list[ContentBlock]:
        """Render CSV — header row + data rows as table_row blocks."""
        text = path.read_text(encoding="utf-8", errors="replace")
        reader = csv.reader(io.StringIO(text))
        blocks: list[ContentBlock] = []
        rows = list(reader)
        if not rows:
            return [ContentBlock(type="paragraph", content="(empty CSV)")]
        # First row as heading
        headers = rows[0]
        blocks.append(ContentBlock(
            type="heading",
            content=", ".join(headers),
            level=3,
            metadata={"is_header": True},
        ))
        for row in rows[1:]:
            if any(cell.strip() for cell in row):
                blocks.append(ContentBlock(
                    type="table_row",
                    content=row,
                    metadata={"headers": headers},
                ))
        return blocks

    def _render_pdf(self, path: Path) -> list[ContentBlock]:
        """Render PDF — one ContentBlock of type 'page' per PDF page.

        When PyMuPDFAdapter extracts HTML (is_html=True), the content field
        contains HTML markup and the frontend renders it with dangerouslySetInnerHTML.
        """
        pages = self._pdf_adapter.extract_pages(path)
        blocks: list[ContentBlock] = []
        for page in pages:
            blocks.append(ContentBlock(
                type="page",
                content=page.text,
                metadata={
                    "page_num": page.page_num,
                    "is_html": page.is_html,
                },
            ))
        return blocks or [ContentBlock(type="paragraph", content="(no text extracted)")]

    def _render_docx(self, path: Path) -> list[ContentBlock]:
        """Render DOCX — heading + paragraph blocks with section context."""
        paragraphs = self._para_adapter.extract_paragraphs(path)
        blocks: list[ContentBlock] = []
        for para in paragraphs:
            if para.style.startswith("Heading"):
                level = _heading_level(para.style)
                blocks.append(ContentBlock(
                    type="heading",
                    content=para.text,
                    level=level,
                ))
            else:
                blocks.append(ContentBlock(
                    type="paragraph",
                    content=para.text,
                ))
        return blocks or [ContentBlock(type="paragraph", content="(empty document)")]

    # ==================================================================
    # Inline Q&A (SSE streaming)
    # ==================================================================

    async def ask(
        self,
        kb_id: str,
        file_id: str,
        req: FileAskRequest,
        provider: str,
        model: str,
        credentials: ProviderCredentials,
        search_engine: str = "duckduckgo",
        search_api_key: str = "",
        search_engines: list[tuple[str, str]] | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Stream an answer to *req.question* grounded in the file's chunks.

        When *req.use_web_search* is True and a SearchService is available,
        web results are appended as additional context.

        Yields SSE-formatted strings: ``data: {"token": "..."}\\n\\n``
        Ends with: ``data: [DONE]\\n\\n``
        """
        file = await self._require_file(kb_id, file_id)
        self._check_readable(file)

        context = await self._build_context(file_id, req.question)

        # ── Page-scoped context — prioritise the page the reader is on ────────
        page_context = ""
        if req.page:
            page_context = await self._build_page_context(file_id, req.page)

        # ── Optional web search context ──────────────────────────────────────
        web_context = ""
        if req.use_web_search and self._search_svc is not None:
            try:
                web_resp = (
                    await self._search_svc.search_blended(
                        query=req.question, engines=search_engines, num_results=5,
                    )
                    if search_engines
                    else await self._search_svc.search(
                        query=req.question, engine=search_engine, api_key=search_api_key, num_results=5,
                    )
                )
                if web_resp.results:
                    parts = []
                    for r in web_resp.results:
                        parts.append(f"**{r.title}** ({r.url})\n{r.snippet}")
                    web_context = "\n\n".join(parts)
                    logger.info(
                        "Reader web search: %d results for %r",
                        len(web_resp.results), req.question[:60],
                    )
            except Exception as exc:
                logger.warning("Reader web search failed: %s", exc)

        combined_context = context
        if page_context:
            # The current page leads; the rest of the document follows as backup.
            combined_context = (
                f"Current page ({req.page}) — the user is reading this now:\n{page_context}\n\n"
                f"--- Elsewhere in the document ---\n{context}"
            )
        if web_context:
            combined_context = (
                f"Document context:\n{combined_context}\n\n"
                f"Web search results:\n{web_context}"
            )

        page_hint = (
            f' The user is currently on page {req.page}; prioritise that page unless the question is broader.'
            if req.page else ""
        )
        system_prompt = (
            f"You are a helpful assistant answering questions about the document "
            f'"{file.name}".{page_hint} '
            "Use the provided document context and any web search results to answer. "
            "If the answer is not in the context, say so clearly. "
            "Be concise and cite specific parts of the document when helpful."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    f"Context:\n\n{combined_context}\n\n"
                    f"Question: {req.question}"
                ),
            },
        ]

        logger.info(
            "Inline Q&A: file=%s question=%r chunks_in_context=%d",
            file.name, req.question[:80], context.count("---\n"),
        )

        try:
            async for token in self._llm_svc.stream(
                messages=messages,
                provider=provider,
                model=model,
                credentials=credentials,
                max_tokens=1024,
                temperature=0.3,
            ):
                yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as exc:
            logger.exception("Inline Q&A stream failed: %s", exc)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

        yield "data: [DONE]\n\n"

    # ==================================================================
    # Private helpers
    # ==================================================================

    async def _require_file(self, kb_id: str, file_id: str) -> FileRecord:
        file = await self._file_repo.find_by_id(file_id)
        if file is None or file.kb_id != kb_id:
            raise EntityNotFoundError("FileRecord", file_id)
        return file

    @staticmethod
    def _check_readable(file: FileRecord) -> None:
        if file.status not in ("ready", "stale"):
            raise ValueError(
                f"File '{file.name}' is not yet readable (status: {file.status}). "
                f"Wait for ingestion to complete."
            )

    async def _build_page_context(self, file_id: str, page: int) -> str:
        """
        Text of the chunks on a specific page — used to ground the page-assistant
        in what the reader is currently looking at. Returns "" when the format
        has no page info (e.g. plain text/markdown) so the caller falls back to
        whole-document context.
        """
        rows = await self._backend.fetchall(
            """
            SELECT content
            FROM   chunks
            WHERE  file_id = ? AND page = ?
            ORDER  BY chunk_index
            LIMIT  ?
            """,
            (file_id, page, _MAX_CONTEXT_CHUNKS),
        )
        if not rows:
            return ""

        parts: list[str] = []
        total_chars = 0
        for row in rows:
            chunk_text = row["content"]
            if total_chars + len(chunk_text) > _MAX_CONTEXT_CHARS:
                break
            parts.append(chunk_text)
            total_chars += len(chunk_text)
        return "\n".join(parts)

    async def _build_context(self, file_id: str, question: str) -> str:
        """Fetch stored chunks and build a context string for the LLM."""
        rows = await self._backend.fetchall(
            """
            SELECT content, section, chunk_index
            FROM   chunks
            WHERE  file_id = ?
            ORDER  BY chunk_index
            LIMIT  ?
            """,
            (file_id, _MAX_CONTEXT_CHUNKS),
        )

        if not rows:
            return "(no indexed content available)"

        parts: list[str] = []
        total_chars = 0
        for row in rows:
            chunk_text = row["content"]
            if total_chars + len(chunk_text) > _MAX_CONTEXT_CHARS:
                break
            section = row.get("section") or ""
            header = f"[{section}] " if section else ""
            parts.append(f"{header}{chunk_text}")
            total_chars += len(chunk_text)
            parts.append("---")

        return "\n".join(parts)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _heading_level(style: str) -> int:
    """Extract heading level from DOCX style name (e.g. 'Heading 2' → 2)."""
    parts = style.split()
    if len(parts) >= 2 and parts[-1].isdigit():
        return min(int(parts[-1]), 6)
    return 1
