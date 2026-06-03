"""
Anti-corruption wrapper around docnest-ai's document parser.

docnest is the project's dedicated normalisation + OCR engine. Knovex delegates
PDF (and other docnest-supported) ingestion to it *when it is installed*, but
never depends on it directly: this module is the ONLY place that imports
docnest, mapping its `RawDocument`/`Section` shape onto Knovex's flat
``DocnestSection``. If docnest is absent — or its API drifts — callers get
``None`` and fall back to the lightweight PyMuPDF path, so Knovex keeps working.

docnest 0.6.0 API (pinned by tests in ``tests/test_docnest_adapter.py``)::

    from docnest.parsers.factory import ParserFactory
    raw = ParserFactory(pdf_engine="docling").get(path).parse(path)  # -> RawDocument
    raw.sections: list[Section]      # Section.text / .title  (no page numbers)
    raw.raw_text: str | None         # some parsers populate this instead

Note: docnest is intentionally excluded from the PyInstaller bundle (its docling
dependency pulls multi-GB ML wheels). This adapter therefore must tolerate its
total absence at runtime — hence every entry point degrades to ``None``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DocnestSection:
    """Knovex's clean view of one section recovered by docnest."""

    text: str
    section: str = ""
    page: int | None = None


def is_available() -> bool:
    """True when docnest-ai's parser factory is importable in this interpreter."""
    try:
        import docnest.parsers.factory  # noqa: F401

        return True
    except Exception:
        return False


def parse_document(
    file_path: str | Path,
    *,
    pdf_engine: str = "docling",
) -> list[DocnestSection] | None:
    """
    Parse a document through docnest, returning normalised sections.

    Returns ``None`` when docnest is unavailable or cannot handle the file (the
    caller should fall back to the lightweight adapter). An empty list means
    docnest parsed the file but found no usable text — also a fall-back signal,
    surfaced as ``None`` to keep the caller contract simple.

    ``pdf_engine`` selects docnest's PDF backend: ``"docling"`` (default — ML
    layout analysis + OCR for scans/design PDFs) or ``"pymupdf"`` (fast font
    heuristic, no model downloads).
    """
    try:
        from docnest.parsers.factory import ParserFactory
    except Exception:
        return None

    path = str(file_path)
    try:
        factory = ParserFactory(pdf_engine=pdf_engine)
        if not factory.supports(path):
            return None
        raw = factory.get(path).parse(path)
    except Exception as exc:  # docnest raises ParseError / UnsupportedFormatError etc.
        logger.info("docnest could not parse %s (%s) — falling back", Path(path).name, exc)
        return None

    sections: list[DocnestSection] = []
    for sec in getattr(raw, "sections", None) or []:
        text = (getattr(sec, "text", "") or "").strip()
        if not text:
            continue
        sections.append(
            DocnestSection(
                text=text,
                section=(getattr(sec, "title", "") or "").strip(),
                page=getattr(sec, "page", None),
            )
        )

    # Some parsers populate raw_text instead of structured sections.
    if not sections:
        raw_text = (getattr(raw, "raw_text", "") or "").strip()
        if raw_text:
            sections.append(DocnestSection(text=raw_text))

    return sections or None
