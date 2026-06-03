"""
PDF ingestion indexes PLAIN TEXT, never display HTML / base64 images.

Regression: chunks were stored as the reader's display HTML — including
base64 <img> data URIs (71 KB blobs) — which polluted FTS + embeddings and
fed the page-assistant garbage. PDFParser now strips HTML to plain text and
skips image-only pages.
"""

from __future__ import annotations

from pathlib import Path

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

    def test_delegates_to_docnest_when_installed(self, monkeypatch):
        """Ingestion is docnest's domain: when installed, PDFParser uses it
        (OCR + normalisation) instead of the lightweight PyMuPDF fallback."""
        import sys
        import types

        class _Ch:
            def __init__(self, t, s, p):
                self.text, self.section, self.page = t, s, p

        class _Parsed:
            chunks = [_Ch("Real text recovered by docnest OCR", "Slide 6", 6)]

        class _Parser:
            def parse(self, _path):
                return _Parsed()

        pkg = types.ModuleType("docnest")
        sub = types.ModuleType("docnest.parsers")
        sub.get_parser = lambda _fmt: _Parser()           # type: ignore[attr-defined]
        monkeypatch.setitem(sys.modules, "docnest", pkg)
        monkeypatch.setitem(sys.modules, "docnest.parsers", sub)

        # Even though the PyMuPDF stub would yield "fallback text", docnest wins.
        page = PageContent(page_num=1, text="<p>pymupdf fallback text</p>", is_html=True)
        chunks = self._parser([page]).parse(Path("scan.pdf"))
        assert len(chunks) == 1
        assert chunks[0].content == "Real text recovered by docnest OCR"
        assert chunks[0].page == 6
