"""
PDF ingestion indexes PLAIN TEXT, never display HTML / base64 images.

Regression: chunks were stored as the reader's display HTML — including
base64 <img> data URIs (71 KB blobs) — which polluted FTS + embeddings and
fed the page-assistant garbage. PDFParser now strips HTML to plain text and
skips image-only pages.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.adapters.document_parsers import PageContent, StubPDFAdapter
from backend.core.ingestion_service import PDFParser, _html_to_plain


class TestHtmlToPlain:
    def test_drops_base64_images(self):
        html = '<figure><img src="data:image/png;base64,AAAABBBBCCCC" alt="x" /></figure><p>Real words here.</p>'
        out = _html_to_plain(html)
        assert "base64" not in out
        assert "AAAABBBB" not in out
        assert out == "Real words here."

    def test_strips_tags_and_unescapes(self):
        assert _html_to_plain("<h1>Title</h1> <p>a &amp; b</p>") == "Title a & b"

    def test_image_only_becomes_empty(self):
        assert _html_to_plain('<figure><img src="data:image/png;base64,ZZZZ" /></figure>') == ""


class TestPDFParserIndexesText:
    @pytest.fixture(autouse=True)
    def _ocr_unavailable(self, monkeypatch):
        """Default: OCR engine not available, so the fast PyMuPDF path is what's
        exercised. Routing tests below override parse_document explicitly."""
        from backend.core import ingestion_service
        monkeypatch.setattr(
            ingestion_service.docnest_adapter, "parse_document", lambda *_a, **_k: None)

    def _parser(self, pages: list[PageContent]) -> PDFParser:
        return PDFParser(pdf_adapter=StubPDFAdapter(pages=pages))

    def test_chunks_contain_text_not_base64(self):
        page = PageContent(
            page_num=1,
            text='<figure><img src="data:image/png;base64,QUJD" /></figure><p>The backward pass reuses cached activations.</p>',
            is_html=True,
        )
        chunks = self._parser([page]).parse(Path("x.pdf"))
        assert len(chunks) == 1
        assert "base64" not in chunks[0].content
        assert "backward pass" in chunks[0].content
        assert chunks[0].page == 1

    def test_image_only_page_yields_no_chunk(self):
        page = PageContent(
            page_num=6,
            text='<figure class="page-raster"><img src="data:image/png;base64,QUJDREVG" /></figure>',
            is_html=True,
        )
        chunks = self._parser([page]).parse(Path("deck.pdf"))
        assert chunks == []

    def test_plain_text_page_passes_through(self):
        page = PageContent(page_num=1, text="Just plain text, no markup.", is_html=False)
        chunks = self._parser([page]).parse(Path("t.pdf"))
        assert len(chunks) == 1
        assert chunks[0].content == "Just plain text, no markup."

    def test_text_pdf_skips_ocr_entirely(self, monkeypatch):
        """A born-digital PDF (real text layer, no image-dominant pages) must NOT
        invoke docnest/OCR — it stays on the fast PyMuPDF path even when OCR is
        installed. This is the cost optimisation: no 10s docling pass on text PDFs."""
        from backend.core import ingestion_service

        called = {"ocr": False}

        def _boom(*_a, **_k):
            called["ocr"] = True
            raise AssertionError("OCR must not be called for a text-only PDF")

        monkeypatch.setattr(ingestion_service.docnest_adapter, "parse_document", _boom)

        page = PageContent(page_num=1, text="<p>Plenty of real text on this page.</p>", is_html=True)
        chunks = self._parser([page]).parse(Path("textbook.pdf"))
        assert called["ocr"] is False
        assert len(chunks) == 1
        assert "real text" in chunks[0].content

    def test_image_pdf_routes_to_ocr_when_available(self, monkeypatch):
        """A PDF with an image-dominant (rasterised) page routes to docnest OCR.

        PDFParser consumes the anti-corruption seam's DocnestSection shape — it
        must not reach into docnest's concrete API itself."""
        from backend.adapters import docnest_adapter
        from backend.core import ingestion_service

        monkeypatch.setattr(
            ingestion_service.docnest_adapter, "parse_document",
            lambda *_a, **_k: [docnest_adapter.DocnestSection(
                text="Real text recovered by docnest OCR", section="Slide 6", page=6)],
        )

        page = PageContent(
            page_num=6,
            text='<figure class="page-raster"><img src="data:image/png;base64,QUJD" /></figure>',
            is_html=True,
        )
        chunks = self._parser([page]).parse(Path("scan.pdf"))
        assert len(chunks) == 1
        assert chunks[0].content == "Real text recovered by docnest OCR"
        assert chunks[0].section == "Slide 6"
        assert chunks[0].page == 6

    def test_image_pdf_falls_back_when_ocr_unavailable(self):
        """Image page + no OCR engine → the raster page yields no chunk (no crash),
        exactly as before OCR existed (autouse fixture makes parse_document None)."""
        page = PageContent(
            page_num=6,
            text='<figure class="page-raster"><img src="data:image/png;base64,QUJD" /></figure>',
            is_html=True,
        )
        chunks = self._parser([page]).parse(Path("scan.pdf"))
        assert chunks == []


class TestPagesNeedOcr:
    def test_raster_page_needs_ocr(self):
        from backend.core.ingestion_service import _pages_need_ocr
        pages = [PageContent(page_num=1, text='<figure class="page-raster"><img/></figure>', is_html=True)]
        assert _pages_need_ocr(pages) is True

    def test_text_pages_do_not_need_ocr(self):
        from backend.core.ingestion_service import _pages_need_ocr
        pages = [
            PageContent(page_num=1, text="<p>real text</p>", is_html=True),
            PageContent(page_num=2, text="plain text", is_html=False),
        ]
        assert _pages_need_ocr(pages) is False

    def test_mixed_pdf_with_one_image_page_needs_ocr(self):
        from backend.core.ingestion_service import _pages_need_ocr
        pages = [
            PageContent(page_num=1, text="<p>intro text</p>", is_html=True),
            PageContent(page_num=2, text='<figure class="page-raster"><img/></figure>', is_html=True),
        ]
        assert _pages_need_ocr(pages) is True
