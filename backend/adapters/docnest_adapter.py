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

import contextlib
import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

# docling leaks its document-structure *group* labels (e.g. an image-only page
# with no OCR'd text becomes a section whose entire content is the word
# "Figures"). Indexing those pollutes search with meaningless chunks, so we drop
# any section whose whole content is just such a structural placeholder.
_DOCLING_PLACEHOLDERS = frozenset({
    "figures", "figure", "tables", "table", "pictures", "picture", "forms", "form",
})


def _is_placeholder(content: str) -> bool:
    return content.strip().lower() in _DOCLING_PLACEHOLDERS


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


# Default OCR languages per engine (the user reads Hindi + English). EasyOCR
# uses 2-letter codes, Tesseract ISO 639-2. Override either via KNOVEX_OCR_LANG.
_DEFAULT_OCR_LANG = {"easyocr": ["en", "hi"], "tesseract": ["eng", "hin"]}


def _resolve_tesseract() -> str | None:
    """Locate the Tesseract executable, or None. Env override → PATH → common
    Windows install path."""
    import os
    import shutil

    explicit = os.environ.get("KNOVEX_TESSERACT_CMD")
    if explicit and Path(explicit).exists():
        return explicit
    found = shutil.which("tesseract")
    if found:
        return found
    for p in (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ):
        if Path(p).exists():
            return p
    return None


def _easyocr_available() -> bool:
    import importlib.util

    return importlib.util.find_spec("easyocr") is not None


def _resolve_ocr_engine() -> str:
    """Pick the OCR engine. Honour KNOVEX_OCR_ENGINE if set; else prefer EasyOCR
    (pure-Python, reads Devanagari/Hindi, works in the on-demand env), then a
    Tesseract binary, else docnest's default (Latin/CJK only)."""
    import os

    forced = os.environ.get("KNOVEX_OCR_ENGINE", "").strip().lower()
    if forced in ("easyocr", "tesseract", "auto"):
        return forced
    if _easyocr_available():
        return "easyocr"
    if _resolve_tesseract():
        return "tesseract"
    return "auto"


def _ocr_languages(engine: str) -> list[str]:
    """OCR language codes for ``engine``. Override via ``KNOVEX_OCR_LANG``
    (comma-separated, codes matching the engine)."""
    import os

    raw = os.environ.get("KNOVEX_OCR_LANG", "").strip()
    if raw:
        langs = [x.strip() for x in raw.split(",") if x.strip()]
        if langs:
            return langs
    return _DEFAULT_OCR_LANG.get(engine, ["en"])


def _build_factory(pdf_engine: str, ocr: bool):
    """Construct a docnest ParserFactory, enabling OCR for the docling engine.

    docnest's ``DoclingPDFParser`` defaults ``ocr=False`` and the factory wires
    it with that default — so scanned/image-only PDFs yield nothing. We swap in
    an OCR-enabled parser using a Devanagari/Hindi-capable engine (EasyOCR by
    default — no system binary; Tesseract if its binary is present), so Hindi
    scans are read. Falls back to docnest's default engine when neither is
    available. Best-effort: any failure leaves the factory's default in place.
    """
    from docnest.parsers.factory import ParserFactory

    factory = ParserFactory(pdf_engine=pdf_engine)
    if ocr and pdf_engine == "docling":
        try:
            from docnest.parsers.pdf import DoclingPDFParser

            engine = _resolve_ocr_engine()
            if engine == "easyocr":
                parser = DoclingPDFParser(
                    ocr=True, ocr_engine="easyocr",
                    ocr_lang=_ocr_languages("easyocr"), force_full_page_ocr=True,
                )
            elif engine == "tesseract":
                parser = DoclingPDFParser(
                    ocr=True, ocr_engine="tesseract",
                    ocr_lang=_ocr_languages("tesseract"),
                    tesseract_cmd=_resolve_tesseract(), force_full_page_ocr=True,
                )
            else:
                parser = DoclingPDFParser(ocr=True)   # default engine (Latin/CJK)
            factory.unregister(DoclingPDFParser)
            factory.register(parser, position=0)
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

    Strategy: use docnest **in-process** when it's importable (dev / a venv with
    docnest installed); otherwise fall back to an **out-of-process sidecar** in a
    provisioned OCR environment (the packaged app, where docnest can't be bundled
    or imported into the frozen backend). Returns ``None`` when neither route is
    available or can't handle the file, so the caller uses the lightweight path.

    ``pdf_engine`` selects docnest's PDF backend: ``"docling"`` (default — ML
    layout analysis) or ``"pymupdf"`` (fast font heuristic, no model downloads).
    ``ocr`` enables OCR for scanned/image-only PDFs on the docling path (the
    reason delegation exists); first use downloads docling's OCR models.
    """
    if is_available():
        return _parse_in_process(file_path, pdf_engine, ocr)

    python_exe = _resolve_ocr_python()
    if python_exe:
        return parse_via_sidecar(file_path, python_exe, engine=pdf_engine, ocr=ocr)
    return None


def _parse_in_process(
    file_path: str | Path, pdf_engine: str, ocr: bool
) -> list[DocnestSection] | None:
    """Parse using docnest imported into the current interpreter."""
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
        if not content or _is_placeholder(content):
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


# ── Out-of-process sidecar (packaged app: docnest lives in a provisioned env) ──

def _resolve_ocr_python() -> str | None:
    """Locate a Python interpreter that has docnest installed, or ``None``.

    Resolution is config-free (no ``core`` import) so the adapter stays a leaf:
    the provisioner / desktop layer points us at the env via environment vars.
      * ``KNOVEX_OCR_PYTHON`` — explicit interpreter path, or
      * ``KNOVEX_OCR_HOME``   — an env dir (we find Scripts/python.exe | bin/python).
    """
    import os

    explicit = os.environ.get("KNOVEX_OCR_PYTHON")
    if explicit and Path(explicit).exists():
        return explicit

    home = os.environ.get("KNOVEX_OCR_HOME")
    if home:
        for rel in ("Scripts/python.exe", "bin/python", "bin/python3"):
            cand = Path(home) / rel
            if cand.exists():
                return str(cand)
    return None


def _sections_from_payload(data: dict) -> list[DocnestSection] | None:
    """Map the sidecar's JSON payload onto DocnestSections (pure, unit-tested)."""
    if not isinstance(data, dict) or not data.get("ok"):
        return None
    sections = [
        DocnestSection(
            text=s["text"],
            section=s.get("section", "") or "",
            page=s.get("page"),
        )
        for s in data.get("sections", [])
        if isinstance(s, dict)
        and (s.get("text") or "").strip()
        and not _is_placeholder(s["text"])
    ]
    return sections or None


def parse_via_sidecar(
    file_path: str | Path,
    python_exe: str,
    *,
    engine: str = "docling",
    ocr: bool = True,
    timeout: int = 900,
) -> list[DocnestSection] | None:
    """Run ``ocr_sidecar.py`` under ``python_exe`` and map its JSON result.

    The sidecar writes JSON to a temp file (kept clear of any library logging on
    stdout). Any launch/parse/OCR failure degrades to ``None`` so the caller
    falls back to the lightweight path — OCR is best-effort, never fatal.
    """
    import json
    import os
    import subprocess
    import tempfile

    sidecar = os.path.join(os.path.dirname(__file__), "ocr_sidecar.py")
    fd, out_path = tempfile.mkstemp(suffix=".json", prefix="knovex_ocr_")
    os.close(fd)
    cmd = [str(python_exe), sidecar, str(file_path), "--engine", engine, "--out", out_path]
    if not ocr:
        cmd.append("--no-ocr")
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if proc.returncode != 0:
            detail = (proc.stdout or proc.stderr or "").strip()[:500]
            logger.info("OCR sidecar exited %s: %s", proc.returncode, detail)
        with open(out_path, encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception as exc:  # noqa: BLE001 — launch/timeout/JSON errors all fall back
        logger.info("OCR sidecar failed for %s (%s)", Path(str(file_path)).name, exc)
        return None
    finally:
        with contextlib.suppress(OSError):
            os.unlink(out_path)

    if not data.get("ok"):
        logger.info("OCR sidecar reported failure: %s", data.get("error"))
        return None
    return _sections_from_payload(data)
