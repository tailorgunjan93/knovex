"""
Document Parser Adapters — wraps PyMuPDF (fitz) and python-docx

Only this file is allowed to import fitz or docx.
File parsers in ingestion_service.py depend on IPDFAdapter /
IParagraphAdapter (interfaces), never on the libraries directly.

Interfaces:
    IPDFAdapter        — extract_pages(path) → list[PageContent]
    IParagraphAdapter  — extract_paragraphs(path) → list[ParagraphContent]

Value objects:
    PageContent        — (page_num, text)
    ParagraphContent   — (text, style)

Implementations:
    PyMuPDFAdapter     — delegates to fitz (PyMuPDF)
    PythonDocxAdapter  — delegates to python-docx
    StubPDFAdapter     — deterministic stub for tests
    StubParagraphAdapter — deterministic stub for tests

Pattern: Adapter (GoF) + Value Object
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger("knovex.adapters.docs")


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class PageContent:
    """Content extracted from a single PDF page."""
    page_num: int       # 1-based
    text: str


@dataclass(frozen=True)
class ParagraphContent:
    """Content extracted from a single DOCX paragraph."""
    text: str
    style: str = ""     # e.g. "Heading 1", "Normal", "List Bullet"


# ---------------------------------------------------------------------------
# Interfaces
# ---------------------------------------------------------------------------

class IPDFAdapter(ABC):
    """
    Extract text from a PDF file, one ``PageContent`` per page.

    Implementations must:
      - Skip blank pages (empty/whitespace-only text)
      - Preserve page numbers (1-based)
      - Never raise on encrypted/corrupt pages — skip them with a warning
    """

    @abstractmethod
    def extract_pages(self, file_path: Path) -> list[PageContent]:
        """
        Return a list of PageContent objects — one per non-empty page.
        Raises ``ValueError`` if the file cannot be opened at all.
        """
        ...


class IParagraphAdapter(ABC):
    """
    Extract paragraphs from a DOCX file, one ``ParagraphContent`` per paragraph.

    Implementations must:
      - Preserve heading style names for section detection
      - Skip empty paragraphs
    """

    @abstractmethod
    def extract_paragraphs(self, file_path: Path) -> list[ParagraphContent]:
        """
        Return a list of ParagraphContent objects — one per non-empty paragraph.
        Raises ``ValueError`` if the file cannot be opened.
        """
        ...


# ---------------------------------------------------------------------------
# PyMuPDF implementation
# ---------------------------------------------------------------------------

class PyMuPDFAdapter(IPDFAdapter):
    """
    Extract text from PDFs using PyMuPDF (fitz).

    Requires ``pymupdf`` (pip install pymupdf).
    Raises ``ImportError`` with an actionable message if not installed.
    """

    def extract_pages(self, file_path: Path) -> list[PageContent]:
        try:
            import fitz  # only import site (PyMuPDF)
        except ImportError as exc:
            raise ImportError(
                "PyMuPDF is required for PDF parsing. "
                "Install with: pip install pymupdf"
            ) from exc

        pages: list[PageContent] = []
        doc = fitz.open(str(file_path))
        try:
            for page_num, page in enumerate(doc, start=1):
                try:
                    text = page.get_text("text")
                except Exception as exc:
                    logger.warning(
                        "PyMuPDF: failed to extract page %d of %s: %s",
                        page_num, file_path.name, exc,
                    )
                    continue
                if text.strip():
                    pages.append(PageContent(page_num=page_num, text=text))
        finally:
            doc.close()

        return pages


# ---------------------------------------------------------------------------
# python-docx implementation
# ---------------------------------------------------------------------------

class PythonDocxAdapter(IParagraphAdapter):
    """
    Extract paragraphs from DOCX files using python-docx.

    Requires ``python-docx`` (pip install python-docx).
    Raises ``ImportError`` with an actionable message if not installed.
    """

    def extract_paragraphs(self, file_path: Path) -> list[ParagraphContent]:
        try:
            from docx import Document  # only import site (python-docx)
        except ImportError as exc:
            raise ImportError(
                "python-docx is required for DOCX parsing. "
                "Install with: pip install python-docx"
            ) from exc

        doc = Document(str(file_path))
        paragraphs: list[ParagraphContent] = []

        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            style = para.style.name if para.style else ""
            paragraphs.append(ParagraphContent(text=text, style=style))

        return paragraphs


# ---------------------------------------------------------------------------
# Stubs for tests
# ---------------------------------------------------------------------------

class StubPDFAdapter(IPDFAdapter):
    """
    Stub PDF adapter for unit tests.

    Returns pre-configured pages without touching the file system.

    Usage::

        stub = StubPDFAdapter()
        stub.set_pages([PageContent(1, "Hello world")])
    """

    def __init__(self) -> None:
        self._pages: list[PageContent] = []

    def set_pages(self, pages: list[PageContent]) -> None:
        self._pages = pages

    def extract_pages(self, file_path: Path) -> list[PageContent]:
        return self._pages


class StubParagraphAdapter(IParagraphAdapter):
    """
    Stub DOCX adapter for unit tests.

    Returns pre-configured paragraphs without touching the file system.

    Usage::

        stub = StubParagraphAdapter()
        stub.set_paragraphs([ParagraphContent("Intro", "Heading 1")])
    """

    def __init__(self) -> None:
        self._paragraphs: list[ParagraphContent] = []

    def set_paragraphs(self, paragraphs: list[ParagraphContent]) -> None:
        self._paragraphs = paragraphs

    def extract_paragraphs(self, file_path: Path) -> list[ParagraphContent]:
        return self._paragraphs
