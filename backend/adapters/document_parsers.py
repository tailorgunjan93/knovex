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

import base64
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from html import escape as html_escape
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
    is_html: bool = False   # True when text contains HTML markup (e.g. from get_text("html"))


@dataclass(frozen=True)
class ParagraphContent:
    """Content extracted from a single DOCX paragraph."""
    text: str
    style: str = ""     # e.g. "Heading 1", "Normal", "List Bullet"


def _image_coverage(blocks: list[dict], page_width: float, page_height: float) -> float:
    """
    Fraction of the page area covered by image blocks (clamped to [0, 1]).

    Pure + module-level so the "is this page image-dominant?" decision is
    unit-testable without a real PDF. type==1 blocks are images in PyMuPDF's
    ``get_text("dict")`` output.
    """
    page_area = page_width * page_height
    if page_area <= 0:
        return 0.0
    img_area = 0.0
    for b in blocks:
        if b.get("type") == 1:
            x0, y0, x1, y1 = b.get("bbox", (0, 0, 0, 0))
            img_area += max(0.0, (x1 - x0)) * max(0.0, (y1 - y0))
    return min(1.0, img_area / page_area)


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
    Extract text + images from PDFs using PyMuPDF (fitz).

    Requires ``pymupdf`` (pip install pymupdf).

    Extraction strategy
    -------------------
    Uses ``page.get_text("dict")`` which gives us structured block data
    (position, font size, bold/italic flags, colour) rather than raw HTML
    with absolute positioning.  We then:

    1.  Detect two-column layouts and sort blocks in reading order
        (left column top→bottom, then right column).
    2.  Map font sizes to semantic heading levels relative to the page's
        median body-text size, so headings get <h1>–<h4> tags.
    3.  Preserve bold / italic as <strong> / <em>.
    4.  Keep only *accent* colours (luminance 0.25–0.85) — dark colours
        are invisible in dark mode, near-white colours invisible in light mode.
        Body text inherits the UI theme colour automatically.
    5.  Render image blocks as base64 <img> tags.
    6.  Fall back to plain ``get_text("text")`` if dict extraction fails.
    """

    # ── PyMuPDF font-flag bitmask constants ───────────────────────────────────
    _FLAG_ITALIC = 1 << 1   # 2
    _FLAG_BOLD   = 1 << 4   # 16

    # ── Heading detection: (size_ratio_vs_body, html_heading_level) ───────────
    # Tuned for typical document base sizes (10–12 pt body text).
    # e.g. base=11pt → h4≥12.3pt, h3≥14.3pt, h2≥17pt, h1≥20.4pt
    _HEADING_THRESHOLDS: list[tuple[float, int]] = [
        (1.85, 1),
        (1.55, 2),
        (1.30, 3),
        (1.12, 4),
    ]

    # ── Colour range for accent preservation ─────────────────────────────────
    # Luminance outside [_LO, _HI] is stripped so text adapts to the UI theme.
    # _LUM_LO raised to 0.40: colours with lum 0.25–0.40 (dark greys / dark blues)
    # look fine on cream paper but become near-invisible on dark backgrounds.
    # The frontend also strips all inline colours in dark-mode as a second layer.
    _LUM_LO = 0.40   # below → too dark for dark-mode readability
    _LUM_HI = 0.85   # above → near-white (invisible in light mode)

    # ── Decorative / structural Unicode characters to strip from span text ────
    # PDFs exported from Word/Google Docs often use box characters (□ U+25A1) as
    # checkbox-style list bullets.  They render as floating squares between
    # paragraphs and add spurious visual noise.
    _DECO_CHARS: frozenset[str] = frozenset(
        '□'   # □  WHITE SQUARE  — checkbox bullet (most common)
        '■'   # ■  BLACK SQUARE
        '▪'   # ▪  BLACK SMALL SQUARE
        '▫'   # ▫  WHITE SMALL SQUARE
        '☐'   # ☐  BALLOT BOX
        '☑'   # ☑  BALLOT BOX WITH CHECK
        '☒'   # ☒  BALLOT BOX WITH X
    )

    # ── Wingdings / Symbol private-use-area (PUA) bullet codepoints ──────────
    # Word-exported PDFs often use non-Unicode font glyph IDs stored in the
    # PUA block (U+F000–U+FFFF) to represent bullet characters.  Browsers have
    # no Wingdings/Symbol font loaded, so these render as blank rectangles.
    #
    # Rather than strip them we use them as LIST STRUCTURE MARKERS:
    # _span_html returns _BULLET_SENTINEL for PUA-bullet-only spans, and
    # _text_block_html detects that sentinel to emit proper <ul><li> HTML.
    _PUA_BULLETS: frozenset[str] = frozenset(
        ''  # Wingdings  ●  (filled circle — most common bullet)
        ''  # Wingdings  ■  (filled square)
        ''  # Wingdings  ◆  (filled diamond)
        ''  # Wingdings  ➤  (right arrow bullet)
        ''  # Wingdings  ✓  (checkmark bullet)
    )

    # Internal sentinel returned by _span_html for PUA-bullet-only spans.
    # Must not appear in normal document text; used only within a single call
    # to _text_block_html and never written to the final HTML output.
    _BULLET_SENTINEL: str = "\x00BUL\x00"

    # ==================================================================
    # Public interface
    # ==================================================================

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
                html_body = self._page_to_html(page, page_num, file_path.name)

                if html_body:
                    pages.append(PageContent(page_num=page_num, text=html_body, is_html=True))
                    continue

                # Fallback: plain text (e.g. scanned PDFs with no text layer)
                try:
                    plain = page.get_text("text").strip()
                except Exception:
                    continue
                if plain:
                    pages.append(PageContent(page_num=page_num, text=plain, is_html=False))
        finally:
            doc.close()

        return pages

    # ==================================================================
    # Private: page → HTML
    # ==================================================================

    def _page_to_html(self, page, page_num: int, filename: str) -> str:
        """Convert one PDF page to clean semantic HTML."""
        try:
            data = page.get_text("dict")
        except Exception as exc:
            logger.warning(
                "PyMuPDF: dict extraction failed for page %d of %s: %s",
                page_num, filename, exc,
            )
            return ""

        blocks     = data.get("blocks", [])
        page_width = float(data.get("width", 595))
        page_height = float(data.get("height", 842))

        if not blocks:
            return ""

        # Image-dominant pages (design slides, scans, decks) reconstruct poorly
        # from get_text("dict"): raw image bytes ignore soft-masks/colorspaces
        # and vector backgrounds aren't captured at all — producing artefacts.
        # Render the whole page to a composited pixmap instead (true WYSIWYG).
        if _image_coverage(blocks, page_width, page_height) >= 0.55:
            raster = self._render_page_raster(page, page_num, filename)
            if raster:
                return raster

        base_size     = self._median_font_size(blocks)
        sorted_blocks = self._reading_order(blocks, page_width)

        parts: list[str] = []
        for block in sorted_blocks:
            btype = block.get("type", 0)
            if btype == 1:   # image
                html = self._image_block_html(block, page_num, filename)
            else:             # text (type 0)
                html = self._text_block_html(block, base_size)
            if html:
                parts.append(html)

        return "\n".join(parts)

    # ==================================================================
    # Private: reading-order sort
    # ==================================================================

    def _is_two_column(self, blocks: list, page_width: float) -> bool:
        """
        Heuristic: True when most text blocks fit into two horizontal columns.

        A block is "clearly left" when its right edge < mid+margin.
        A block is "clearly right" when its left edge > mid-margin.
        A block is "full-width" when it spans across the midpoint.

        Two-column is detected when fewer than 20 % of blocks are full-width
        AND both columns contain at least 25 % of blocks each.
        """
        text_blocks = [b for b in blocks if b.get("type") == 0]
        n = len(text_blocks)
        if n < 6:
            return False

        mid    = page_width / 2
        margin = page_width * 0.06   # 6 % tolerance

        full_width = sum(
            1 for b in text_blocks
            if b["bbox"][0] < mid - margin and b["bbox"][2] > mid + margin
        )
        left_only  = sum(1 for b in text_blocks if b["bbox"][2] <= mid + margin)
        right_only = sum(1 for b in text_blocks if b["bbox"][0] >= mid - margin)

        return (
            full_width < n * 0.20 and
            left_only  >= n * 0.25 and
            right_only >= n * 0.25
        )

    def _reading_order(self, blocks: list, page_width: float) -> list:
        """
        Return blocks sorted in natural reading order.

        Two-column layout: left column (top→bottom) then right column.
        Single-column: top→bottom, left→right within the same Y band (rounded to 5pt).
        """
        relevant = [b for b in blocks if b.get("type") in (0, 1)]

        if self._is_two_column(relevant, page_width):
            mid = page_width / 2
            left  = sorted(
                [b for b in relevant if b["bbox"][0] < mid],
                key=lambda b: (b["bbox"][1], b["bbox"][0]),
            )
            right = sorted(
                [b for b in relevant if b["bbox"][0] >= mid],
                key=lambda b: (b["bbox"][1], b["bbox"][0]),
            )
            return left + right

        return sorted(relevant, key=lambda b: (round(b["bbox"][1] / 5) * 5, b["bbox"][0]))

    # ==================================================================
    # Private: block → HTML helpers
    # ==================================================================

    def _median_font_size(self, blocks: list) -> float:
        """Median font size across all non-empty text spans on the page."""
        sizes: list[float] = []
        for b in blocks:
            if b.get("type") != 0:
                continue
            for line in b.get("lines", []):
                for span in line.get("spans", []):
                    if span.get("text", "").strip() and span.get("size", 0) > 0:
                        sizes.append(float(span["size"]))
        if not sizes:
            return 11.0
        sizes.sort()
        return sizes[len(sizes) // 2]

    def _heading_level(self, font_size: float, base: float) -> int | None:
        """Return heading level 1-4 if font_size is notably larger than body, else None."""
        ratio = font_size / base if base > 0 else 1.0
        for threshold, level in self._HEADING_THRESHOLDS:
            if ratio >= threshold:
                return level
        return None

    @staticmethod
    def _color_rgb(color) -> tuple[int, int, int]:
        """
        Convert a PyMuPDF span colour to an (R, G, B) tuple of integers 0-255.

        PyMuPDF may return colour as an int (24-bit RGB) or a float tuple.
        """
        if isinstance(color, int):
            return (color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF
        if isinstance(color, (list, tuple)) and len(color) >= 3:
            return int(color[0] * 255), int(color[1] * 255), int(color[2] * 255)
        return 0, 0, 0   # default — treated as dark, stripped

    @staticmethod
    def _luminance(r: int, g: int, b: int) -> float:
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255

    def _span_html(self, span: dict, base: float) -> str:
        """Render a single text span as an HTML fragment."""
        text = span.get("text", "")
        if not text:
            return ""

        # PUA bullet detection: if the span contains *only* Wingdings/Symbol
        # private-use-area bullet glyphs, return the internal sentinel so
        # _text_block_html can build <ul><li> structure around it.
        stripped = text.strip()
        if stripped and all(c in self._PUA_BULLETS for c in stripped):
            return self._BULLET_SENTINEL

        # Strip decorative box / ballot characters that PDFs use as structural
        # bullet markers — they render as floating □ squares between paragraphs.
        text = "".join(c for c in text if c not in self._DECO_CHARS)
        if not text:
            return ""

        flags = int(span.get("flags", 0))
        size  = float(span.get("size", base))

        # ── Inline styles ──────────────────────────────────────────────────────
        styles: list[str] = []

        # Relative font size (only if notably different from body)
        ratio = size / base if base > 0 else 1.0
        if ratio < 0.82:
            styles.append("font-size:0.82em")
        elif ratio > 1.15:
            em = min(round(ratio * 10) / 10, 2.5)
            styles.append(f"font-size:{em}em")

        # Accent colour — keep only if luminance is in the "readable on both themes" band
        raw_color = span.get("color", 0)
        r, g, b = self._color_rgb(raw_color)
        lum = self._luminance(r, g, b)
        if self._LUM_LO < lum < self._LUM_HI:
            styles.append(f"color:#{r:02x}{g:02x}{b:02x}")

        # ── Markup ────────────────────────────────────────────────────────────
        inner = html_escape(text)
        if flags & self._FLAG_BOLD:
            inner = f"<strong>{inner}</strong>"
        if flags & self._FLAG_ITALIC:
            inner = f"<em>{inner}</em>"

        if styles:
            return f'<span style="{";".join(styles)}">{inner}</span>'
        return inner

    def _text_block_html(self, block: dict, base: float) -> str:
        """Render a text block as a heading or paragraph."""
        lines = block.get("lines", [])
        if not lines:
            return ""

        # Dominant font size for heading detection.
        # Exclude PUA-bullet-only spans — their slightly-larger glyph size would
        # skew dom_size away from the true body-text reference.
        sizes: list[float] = [
            float(span["size"])
            for line in lines
            for span in line.get("spans", [])
            if span.get("text", "").strip()
            and span.get("size", 0) > 0
            and not all(c in self._PUA_BULLETS for c in span.get("text", "").strip())
        ]
        dom_size = max(set(sizes), key=sizes.count) if sizes else base

        # Determine heading level first so we can choose the right span_base.
        # For heading blocks we pass dom_size as the reference — that way every
        # span inside the heading has ratio ≈ 1.0 and _span_html won't emit a
        # conflicting inline font-size that fights the CSS heading size.
        level    = self._heading_level(dom_size, base)
        span_base = dom_size if level else base

        # Build per-line HTML fragments (PUA bullets come back as _BULLET_SENTINEL)
        line_htmls: list[str] = []
        for line in lines:
            spans_html = "".join(self._span_html(s, span_base) for s in line.get("spans", []))
            if spans_html.strip():
                line_htmls.append(spans_html)

        # ── List detection ────────────────────────────────────────────────────
        # If any line is a bullet sentinel this block has list structure.
        # Delegate to the list builder instead of emitting a flat paragraph.
        if any(ln == self._BULLET_SENTINEL for ln in line_htmls):
            return self._build_list_block_html(line_htmls)

        content = " ".join(line_htmls).strip()
        if not content:
            return ""

        if level:
            return f"<h{level}>{content}</h{level}>"
        return f"<p>{content}</p>"

    # ── List-block builder ────────────────────────────────────────────────────

    @staticmethod
    def _is_bold_only_line(html_line: str) -> bool:
        """
        Return True when *all* visible text in the line is inside <strong> tags.
        Used to detect job-title / section-sub-header lines within a mixed block.
        """
        import re
        without_bold = re.sub(r"<strong>.*?</strong>", "", html_line, flags=re.DOTALL)
        without_tags = re.sub(r"<[^>]+>", "", without_bold)
        return bool(html_line.strip()) and not without_tags.strip()

    def _build_list_block_html(self, line_htmls: list[str]) -> str:
        """
        Convert a list of per-line HTML fragments that contain _BULLET_SENTINEL
        markers into proper semantic <ul><li>…</li></ul> HTML.

        Handles two common resume patterns in a single text block:

        Pattern A — flat list (Skills):
            SENTINEL · Frontend: … · SENTINEL · Backend: … · …
            → <ul><li>Frontend: …</li><li>Backend: …</li>…</ul>

        Pattern B — grouped list (Experience):
            <strong>Job Title</strong> · SENTINEL · bullet1-line1 · bullet1-line2
            · SENTINEL · bullet2 · … · <strong>Next Job</strong> · …
            → <p><strong>Job Title</strong></p>
              <ul><li>bullet1-line1 bullet1-line2</li><li>bullet2</li>…</ul>
              <p><strong>Next Job</strong></p>
              <ul>…</ul>
        """
        sen = self._BULLET_SENTINEL
        html_out: list[str] = []
        in_list = False
        li_parts: list[str] = []   # lines accumulating into the current <li>

        def _flush_li() -> None:
            if li_parts:
                html_out.append(f"<li>{' '.join(li_parts)}</li>")
                li_parts.clear()

        def _close_list() -> None:
            nonlocal in_list
            if in_list:
                _flush_li()
                html_out.append("</ul>")
                in_list = False

        for line in line_htmls:
            if line == sen:
                # Bullet marker: flush any accumulated li content, open list
                _flush_li()
                if not in_list:
                    html_out.append("<ul>")
                    in_list = True
                # Next non-sentinel lines form the new <li>

            elif self._is_bold_only_line(line):
                # Bold-only line = job title / sub-header → close list, emit as <p>
                _close_list()
                html_out.append(f"<p>{line}</p>")

            else:
                # Regular text: accumulate into current <li> if in list,
                # otherwise emit as a standalone <p>
                if in_list:
                    li_parts.append(line)
                else:
                    html_out.append(f"<p>{line}</p>")

        _close_list()   # close any trailing open list

        return "\n".join(html_out)

    def _render_page_raster(self, page, page_num: int, filename: str) -> str:
        """
        Render the entire PDF page to a composited PNG (text + vector graphics +
        images with their masks all flattened correctly). Used for image-dominant
        pages where HTML reconstruction is unfaithful.
        """
        try:
            pix = page.get_pixmap(dpi=150, alpha=False)   # alpha=False → white bg
            png = pix.tobytes("png")
            b64 = base64.b64encode(png).decode("ascii")
            return (
                f'<figure class="page-raster">'
                f'<img src="data:image/png;base64,{b64}" alt="page {page_num}" '
                f'style="width:100%;height:auto;display:block" />'
                f'</figure>'
            )
        except Exception as exc:
            logger.warning(
                "PyMuPDF: page raster failed for page %d of %s: %s",
                page_num, filename, exc,
            )
            return ""

    def _image_block_html(self, block: dict, page_num: int, filename: str) -> str:
        """Render an image block as a base64 <img> tag wrapped in <figure>."""
        try:
            img_bytes = block.get("image")
            if not img_bytes:
                return ""
            ext = block.get("ext", "png").lower()
            if ext not in ("png", "jpg", "jpeg", "gif", "webp", "bmp"):
                ext = "png"
            b64 = base64.b64encode(img_bytes).decode("ascii")
            return f'<figure><img src="data:image/{ext};base64,{b64}" alt="image" /></figure>'
        except Exception as exc:
            logger.debug(
                "PyMuPDF: failed to encode image on page %d of %s: %s",
                page_num, filename, exc,
            )
            return ""


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

        # Option A — constructor (preferred in tests)
        stub = StubPDFAdapter(pages=[PageContent(1, "Hello world")])

        # Option B — setter (useful when configuring after construction)
        stub = StubPDFAdapter()
        stub.set_pages([PageContent(1, "Hello world")])
    """

    def __init__(self, pages: list[PageContent] | None = None) -> None:
        self._pages: list[PageContent] = pages or []

    def set_pages(self, pages: list[PageContent]) -> None:
        self._pages = pages

    def extract_pages(self, file_path: Path) -> list[PageContent]:
        return self._pages


class StubParagraphAdapter(IParagraphAdapter):
    """
    Stub DOCX adapter for unit tests.

    Returns pre-configured paragraphs without touching the file system.

    Usage::

        # Option A — constructor (preferred in tests)
        stub = StubParagraphAdapter(paragraphs=[ParagraphContent("Intro", "Heading 1")])

        # Option B — setter
        stub = StubParagraphAdapter()
        stub.set_paragraphs([ParagraphContent("Intro", "Heading 1")])
    """

    def __init__(self, paragraphs: list[ParagraphContent] | None = None) -> None:
        self._paragraphs: list[ParagraphContent] = paragraphs or []

    def set_paragraphs(self, paragraphs: list[ParagraphContent]) -> None:
        self._paragraphs = paragraphs

    def extract_paragraphs(self, file_path: Path) -> list[ParagraphContent]:
        return self._paragraphs


# ---------------------------------------------------------------------------
# Caching decorator — Reader performance fix
# ---------------------------------------------------------------------------

class CachingPDFAdapter(IPDFAdapter):
    """
    Decorator (GoF) that memoizes ``extract_pages`` of any ``IPDFAdapter``.

    Why: ReaderService re-parsed the whole PDF on every page turn and threw
    away all but one page — O(full-parse) per turn. Wrapping the real adapter
    in this cache makes the first open parse once and every subsequent page
    turn an O(1) dict lookup.

    Cache key: ``(resolved_path, mtime_ns, size)`` so the entry auto-invalidates
    if the file is modified or replaced on disk (correctness over staleness).

    Bounded LRU (``maxsize`` entries, default 8) so a long reading session over
    many documents can't grow memory without bound; the least-recently-used
    document is evicted first. Thread-safe: ``get_content`` runs the renderer in
    a thread-pool executor, so the cache may be touched from multiple threads.

    SOLID: SRP (only caching — parsing stays in the wrapped adapter), OCP (wraps
    any current/future IPDFAdapter without modifying it), LSP (is an IPDFAdapter).
    """

    def __init__(self, inner: IPDFAdapter, maxsize: int = 8) -> None:
        self._inner = inner
        self._maxsize = max(1, maxsize)
        # OrderedDict as an LRU: most-recently-used moved to the end.
        from collections import OrderedDict
        from threading import Lock
        self._cache: "OrderedDict[tuple, list[PageContent]]" = OrderedDict()
        self._lock = Lock()

    @staticmethod
    def _key(file_path: Path) -> tuple:
        """Identity that changes whenever the file content could have changed."""
        p = file_path.resolve()
        try:
            st = p.stat()
            return (str(p), st.st_mtime_ns, st.st_size)
        except OSError:
            # File missing/unreadable — use a key that won't collide with a real
            # stat; the inner adapter will raise the appropriate error.
            return (str(p), -1, -1)

    def extract_pages(self, file_path: Path) -> list[PageContent]:
        key = self._key(file_path)

        with self._lock:
            hit = self._cache.get(key)
            if hit is not None:
                self._cache.move_to_end(key)        # mark most-recently-used
                return hit

        # Parse outside the lock so concurrent reads of *different* files don't
        # serialize on a slow parse. A duplicate concurrent miss for the same
        # file may parse twice, but the result is identical and idempotent.
        pages = self._inner.extract_pages(file_path)

        with self._lock:
            self._cache[key] = pages
            self._cache.move_to_end(key)
            while len(self._cache) > self._maxsize:
                self._cache.popitem(last=False)     # evict least-recently-used
        return pages
