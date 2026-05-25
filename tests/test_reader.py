"""
ReaderService unit tests — Sprint 3

Tests are fully isolated:
  - No real files on disk (uses tmp_path fixture where needed)
  - No real LLM (LLMService.stream() is mocked via AsyncMock)
  - No real PDF/DOCX adapters (StubPDFAdapter / StubParagraphAdapter)
  - No real SQLite backend (async mock)

Coverage:
  - _render_txt       → paragraph blocks
  - _render_md        → heading + paragraph blocks
  - _render_csv       → heading + table_row blocks
  - _render_pdf       → page blocks via StubPDFAdapter
  - _render_docx      → heading + paragraph blocks via StubParagraphAdapter
  - get_content       → correct pagination, returns FileContentResponse
  - ask               → SSE tokens yielded from mocked LLMService
  - _check_readable   → raises ValueError for non-ready/stale status
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.adapters.document_parsers import (
    PageContent,
    ParagraphContent,
    StubParagraphAdapter,
    StubPDFAdapter,
)
from backend.core.domain.file_record import FileRecord
from backend.core.reader_service import ReaderService, _heading_level
from backend.models.schemas import FileAskRequest
from backend.storage.repositories.base import EntityNotFoundError

# ---------------------------------------------------------------------------
# Async generator factory helper
# ---------------------------------------------------------------------------

async def _token_gen(*tokens: str):
    """Async generator that yields the given tokens."""
    for t in tokens:
        yield t


# ---------------------------------------------------------------------------
# Helpers / factories
# ---------------------------------------------------------------------------

def _make_file(
    fmt: str = "txt",
    status: str = "ready",
    file_path: str = "/fake/doc.txt",
) -> FileRecord:
    """Return a minimal FileRecord for a given format and status."""
    import uuid
    from datetime import datetime
    return FileRecord(
        id=str(uuid.uuid4()),
        kb_id="kb-1",
        name=f"doc.{fmt}",
        format=fmt,
        file_path=file_path,
        size_bytes=1024,
        status=status,
        added_at=datetime.utcnow(),
    )


def _make_svc(
    file: FileRecord,
    pdf_pages: list[PageContent] | None = None,
    para_paragraphs: list[ParagraphContent] | None = None,
    llm_tokens: list[str] | None = None,
    db_chunks: list[dict] | None = None,
) -> ReaderService:
    """Build a fully-stubbed ReaderService."""
    # File repo mock
    file_repo = MagicMock()
    file_repo.find_by_id = AsyncMock(return_value=file)

    # SQLite backend mock
    backend = MagicMock()
    backend.fetchall = AsyncMock(return_value=db_chunks or [
        {"content": "chunk text here", "section": "Introduction", "chunk_index": 0}
    ])

    # LLMService mock — stream() is an async generator method
    llm_svc = MagicMock()
    tokens = llm_tokens or ["Hello ", "world."]

    async def _stream_gen(*args, **kwargs):
        for t in tokens:
            yield t

    llm_svc.stream = _stream_gen

    return ReaderService(
        file_repo=file_repo,
        backend=backend,
        llm_svc=llm_svc,
        pdf_adapter=StubPDFAdapter(pages=pdf_pages or []),
        para_adapter=StubParagraphAdapter(paragraphs=para_paragraphs or []),
    )


# ---------------------------------------------------------------------------
# _heading_level helper
# ---------------------------------------------------------------------------

def test_heading_level_known():
    assert _heading_level("Heading 1") == 1
    assert _heading_level("Heading 3") == 3
    assert _heading_level("Heading 6") == 6


def test_heading_level_capped():
    assert _heading_level("Heading 9") == 6


def test_heading_level_unknown():
    assert _heading_level("Normal") == 1
    assert _heading_level("Caption") == 1


# ---------------------------------------------------------------------------
# _render_txt
# ---------------------------------------------------------------------------

def test_render_txt(tmp_path: Path):
    txt = tmp_path / "doc.txt"
    txt.write_text("First paragraph.\n\nSecond paragraph.\n\nThird.", encoding="utf-8")
    file = _make_file("txt", file_path=str(txt))
    svc = _make_svc(file)
    blocks = svc._render_txt(txt)

    assert len(blocks) == 3
    assert all(b.type == "paragraph" for b in blocks)
    assert blocks[0].content == "First paragraph."
    assert blocks[2].content == "Third."


def test_render_txt_empty(tmp_path: Path):
    txt = tmp_path / "empty.txt"
    txt.write_text("", encoding="utf-8")
    file = _make_file("txt", file_path=str(txt))
    svc = _make_svc(file)
    blocks = svc._render_txt(txt)
    assert len(blocks) == 1
    assert blocks[0].content == "(empty)"


# ---------------------------------------------------------------------------
# _render_md
# ---------------------------------------------------------------------------

def test_render_md(tmp_path: Path):
    md = tmp_path / "doc.md"
    md.write_text(
        "# Title\n\nIntro paragraph.\n\n## Section\n\nBody text.\n",
        encoding="utf-8",
    )
    file = _make_file("md", file_path=str(md))
    svc = _make_svc(file)
    blocks = svc._render_md(md)

    types = [b.type for b in blocks]
    assert types[0] == "heading"
    assert blocks[0].level == 1
    assert blocks[0].content == "Title"
    assert "paragraph" in types
    assert any(b.type == "heading" and b.level == 2 for b in blocks)


# ---------------------------------------------------------------------------
# _render_csv
# ---------------------------------------------------------------------------

def test_render_csv(tmp_path: Path):
    csv_file = tmp_path / "data.csv"
    csv_file.write_text("name,age,city\nAlice,30,London\nBob,25,Paris\n", encoding="utf-8")
    file = _make_file("csv", file_path=str(csv_file))
    svc = _make_svc(file)
    blocks = svc._render_csv(csv_file)

    assert blocks[0].type == "heading"
    assert "name" in blocks[0].content
    data_rows = [b for b in blocks if b.type == "table_row"]
    assert len(data_rows) == 2
    assert data_rows[0].metadata["headers"] == ["name", "age", "city"]


def test_render_csv_empty(tmp_path: Path):
    csv_file = tmp_path / "empty.csv"
    csv_file.write_text("", encoding="utf-8")
    file = _make_file("csv", file_path=str(csv_file))
    svc = _make_svc(file)
    blocks = svc._render_csv(csv_file)
    assert blocks[0].content == "(empty CSV)"


# ---------------------------------------------------------------------------
# _render_pdf
# ---------------------------------------------------------------------------

def test_render_pdf():
    pages = [
        PageContent(page_num=1, text="Page one text."),
        PageContent(page_num=2, text="Page two text."),
    ]
    file = _make_file("pdf", file_path="/fake/doc.pdf")
    svc = _make_svc(file, pdf_pages=pages)
    blocks = svc._render_pdf(Path("/fake/doc.pdf"))

    assert len(blocks) == 2
    assert all(b.type == "page" for b in blocks)
    assert blocks[0].metadata["page_num"] == 1
    assert blocks[1].content == "Page two text."


def test_render_pdf_empty():
    file = _make_file("pdf")
    svc = _make_svc(file, pdf_pages=[])
    blocks = svc._render_pdf(Path("/fake/doc.pdf"))
    assert len(blocks) == 1
    assert blocks[0].content == "(no text extracted)"


# ---------------------------------------------------------------------------
# _render_docx
# ---------------------------------------------------------------------------

def test_render_docx():
    paras = [
        ParagraphContent(text="Chapter One", style="Heading 1"),
        ParagraphContent(text="Some body text.", style="Normal"),
        ParagraphContent(text="More text.", style="Normal"),
    ]
    file = _make_file("docx", file_path="/fake/doc.docx")
    svc = _make_svc(file, para_paragraphs=paras)
    blocks = svc._render_docx(Path("/fake/doc.docx"))

    assert blocks[0].type == "heading"
    assert blocks[0].level == 1
    assert blocks[1].type == "paragraph"


# ---------------------------------------------------------------------------
# get_content — pagination
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_content_txt(tmp_path: Path):
    txt = tmp_path / "long.txt"
    content = "\n\n".join(f"Paragraph {i}." for i in range(50))
    txt.write_text(content, encoding="utf-8")

    file = _make_file("txt", file_path=str(txt))
    svc = _make_svc(file)

    resp = await svc.get_content("kb-1", file.id, page=1)
    assert resp.current_page == 1
    assert resp.total_pages == 2
    assert len(resp.content["blocks"]) == 40

    resp2 = await svc.get_content("kb-1", file.id, page=2)
    assert resp2.current_page == 2
    assert len(resp2.content["blocks"]) == 10


@pytest.mark.asyncio
async def test_get_content_pdf_pagination():
    pages = [PageContent(page_num=i + 1, text=f"Text {i}") for i in range(5)]
    file = _make_file("pdf", file_path="/fake/doc.pdf")
    svc = _make_svc(file, pdf_pages=pages)

    resp = await svc.get_content("kb-1", file.id, page=3)
    assert resp.current_page == 3
    assert resp.total_pages == 5
    assert len(resp.content["blocks"]) == 1
    assert resp.content["blocks"][0]["metadata"]["page_num"] == 3


@pytest.mark.asyncio
async def test_get_content_not_found():
    file_repo = MagicMock()
    file_repo.find_by_id = AsyncMock(return_value=None)
    svc = ReaderService(
        file_repo=file_repo,
        backend=MagicMock(),
        llm_svc=MagicMock(),
    )
    with pytest.raises(EntityNotFoundError):
        await svc.get_content("kb-1", "nonexistent-id")


@pytest.mark.asyncio
async def test_get_content_not_ready():
    file = _make_file("txt", status="pending")
    svc = _make_svc(file)
    with pytest.raises(ValueError, match="not yet readable"):
        await svc.get_content("kb-1", file.id)


@pytest.mark.asyncio
async def test_get_content_stale_readable():
    """Stale files should still be readable."""
    import os
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
        f.write("Content here.\n")
        tmp = f.name
    try:
        file = _make_file("txt", status="stale", file_path=tmp)
        svc = _make_svc(file)
        resp = await svc.get_content("kb-1", file.id, page=1)
        assert resp.current_page == 1
    finally:
        os.unlink(tmp)


# ---------------------------------------------------------------------------
# ask — SSE streaming
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ask_yields_done():
    file = _make_file("txt", status="ready")
    svc = _make_svc(file, llm_tokens=["Ans", "wer."])

    req = FileAskRequest(question="What is this about?")
    from backend.core.providers.base import ProviderCredentials
    creds = ProviderCredentials()

    events = []
    async for chunk in svc.ask(
        kb_id="kb-1",
        file_id=file.id,
        req=req,
        provider="openai",
        model="gpt-4o-mini",
        credentials=creds,
    ):
        events.append(chunk)

    assert events[-1] == "data: [DONE]\n\n"


@pytest.mark.asyncio
async def test_ask_yields_tokens():
    file = _make_file("txt", status="ready")
    svc = _make_svc(file, llm_tokens=["Hello", " world"])

    req = FileAskRequest(question="Anything?")
    from backend.core.providers.base import ProviderCredentials
    creds = ProviderCredentials()

    token_events = []
    async for chunk in svc.ask("kb-1", file.id, req, "openai", "gpt-4o-mini", creds):
        if chunk.startswith("data: {"):
            payload = json.loads(chunk[6:])
            if "token" in payload:
                token_events.append(payload["token"])

    assert token_events == ["Hello", " world"]


@pytest.mark.asyncio
async def test_ask_no_chunks_still_streams():
    """If no chunks indexed, context = '(no indexed content available)' — ask still streams."""
    file = _make_file("txt", status="ready")
    svc = _make_svc(file, db_chunks=[], llm_tokens=["Reply"])

    req = FileAskRequest(question="Anything?")
    from backend.core.providers.base import ProviderCredentials
    creds = ProviderCredentials()

    events = []
    async for chunk in svc.ask("kb-1", file.id, req, "openai", "gpt-4o-mini", creds):
        events.append(chunk)

    assert any("[DONE]" in e for e in events)
