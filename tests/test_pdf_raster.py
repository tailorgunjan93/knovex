"""
PDF image-dominant page rasterisation.

Image/design pages reconstruct poorly from get_text("dict") (raw image bytes
ignore soft-masks, vector backgrounds are lost) — they showed as artefacts
(a black dot-grid box). Image-dominant pages are now rendered to a composited
pixmap PNG instead. Text pages keep the selectable HTML reconstruction.
"""

from __future__ import annotations

import pytest

from backend.adapters.document_parsers import PyMuPDFAdapter, _image_coverage

fitz = pytest.importorskip("fitz")   # PyMuPDF


# ── Pure coverage maths ───────────────────────────────────────────────────────

class TestImageCoverage:
    def test_full_page_image_is_one(self):
        blocks = [{"type": 1, "bbox": (0, 0, 100, 100)}]
        assert _image_coverage(blocks, 100, 100) == 1.0

    def test_half_page_image(self):
        blocks = [{"type": 1, "bbox": (0, 0, 100, 50)}]
        assert _image_coverage(blocks, 100, 100) == 0.5

    def test_text_only_is_zero(self):
        blocks = [{"type": 0, "bbox": (0, 0, 100, 100)}]
        assert _image_coverage(blocks, 100, 100) == 0.0

    def test_zero_area_is_safe(self):
        assert _image_coverage([{"type": 1, "bbox": (0, 0, 10, 10)}], 0, 0) == 0.0

    def test_clamped_to_one(self):
        # two overlapping full-page images shouldn't exceed 1.0
        blocks = [{"type": 1, "bbox": (0, 0, 100, 100)}, {"type": 1, "bbox": (0, 0, 100, 100)}]
        assert _image_coverage(blocks, 100, 100) == 1.0


# ── End-to-end on generated PDFs ──────────────────────────────────────────────

def _image_dominant_pdf(tmp_path):
    doc = fitz.open()
    page = doc.new_page(width=300, height=300)
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 300, 300))
    pix.clear_with(40)                      # dark fill
    page.insert_image(fitz.Rect(0, 0, 300, 300), pixmap=pix)
    p = tmp_path / "image.pdf"
    doc.save(str(p)); doc.close()
    return p


def _text_pdf(tmp_path):
    doc = fitz.open()
    page = doc.new_page(width=400, height=500)
    page.insert_text((50, 80), "This page is mostly text, no big images at all.")
    p = tmp_path / "text.pdf"
    doc.save(str(p)); doc.close()
    return p


class TestRasterisation:
    def test_image_dominant_page_is_rasterised(self, tmp_path):
        pages = PyMuPDFAdapter().extract_pages(_image_dominant_pdf(tmp_path))
        assert len(pages) == 1
        assert pages[0].is_html is True
        assert "page-raster" in pages[0].text
        assert "data:image/png;base64," in pages[0].text

    def test_text_page_uses_html_reconstruction_not_raster(self, tmp_path):
        pages = PyMuPDFAdapter().extract_pages(_text_pdf(tmp_path))
        assert len(pages) == 1
        assert "page-raster" not in pages[0].text
        assert "mostly text" in pages[0].text
