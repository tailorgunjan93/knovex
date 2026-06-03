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


def _build_factory(pdf_engine: str, ocr: bool):
    """Construct a docnest ParserFactory, enabling OCR for the docling engine.

    docnest's ``DoclingPDFParser`` defaults ``ocr=False`` and the factory wires
    it with that default — so scanned/image-only PDFs yield nothing. To get the
    OCR we delegated here for, swap in an OCR-enabled docling parser. This is
    best-effort: if docnest's internals differ, we keep the factory's default.
    """
    from docnest.parsers.factory import ParserFactory

    factory = ParserFactory(pdf_engine=pdf_engine)
    if ocr and pdf_engine == "docling":
        try:
            from docnest.parsers.pdf import DoclingPDFParser

            factory.unregister(DoclingPDFParser)
            factory.register(DoclingPDFParser(ocr=True), position=0)
        except Exception:
            logger.info("docnest OCR-enabled docling parser unavailable — using factory default")
    return factory


def parse_document(
    file_path: str | Path,
    *,
    pdf_engine: str = "docling",
    ocr: bool = True,
) -> list[DocnestSection] | None:
    """
    Parse a document through docnest, returning normalised sections.

    Returns ``None`` when docnest is unavailable or cannot handle the file (the
    caller should fall back to the lightweight adapter). An empty list means
    docnest parsed the file but found no usable text — also a fall-back signal,
    surfaced as ``None`` to keep the caller contract simple.

    ``pdf_engine`` selects docnest's PDF backend: ``"docling"`` (default — ML
    layout analysis) or ``"pymupdf"`` (fast font heuristic, no model downloads).
    ``ocr`` enables OCR for scanned/image-only PDFs on the docling path (the
    reason delegation exists); first use downloads docling's OCR models.
    """
    try:
        factory = _build_factory(pdf_engine, ocr)
    except Exception:
        return None

    path = str(file_path)
    try:
        if not factory.supports(path):
            return None
        raw = factory.get(path).parse(path)
    except Exception as exc:  # docnest raises ParseError / UnsupportedFormatError etc.
        logger.info("docnest could not parse %s (%s) — falling back", Path(path).name, exc)
        return None

    sections: list[DocnestSection] = []
    for sec in getattr(raw, "sections", None) or []:
        title = (getattr(sec, "title", "") or "").strip()
        text = (getattr(sec, "text", "") or "").strip()
        # docnest emits heading-only sections (e.g. a slide title, or a single
        # OCR'd line) as title-with-empty-text — that title is still real,
        # indexable content, so fall back to it. Skip only when both are empty.
        content = text or title
        if not content:
            continue
        sections.append(
            DocnestSection(text=content, section=title, page=getattr(sec, "page", None))
        )

    # Some parsers populate raw_text instead of structured sections.
    if not sections:
        raw_text = (getattr(raw, "raw_text", "") or "").strip()
        if raw_text:
            sections.append(DocnestSection(text=raw_text))

    return sections or None
