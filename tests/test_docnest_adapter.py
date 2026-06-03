"""
Anti-corruption wrapper around docnest-ai.

docnest is the project's dedicated normalisation + OCR engine. Knovex delegates
ingestion to it *when installed* but must never depend on its concrete API:
`backend.adapters.docnest_adapter` is the single seam that imports docnest and
maps its RawDocument/Section shape onto Knovex's flat `DocnestSection`.

Regression this guards: `_try_docnest` was coded against `docnest.parsers.
get_parser(...)`, which does NOT exist in docnest 0.6.0 (real API is
`ParserFactory().get(path).parse(path)`). Delegation silently no-op'd — docnest
was installed but never used. These tests pin the *real* API shape, so a future
API drift fails loudly instead of silently falling back forever.
"""

from __future__ import annotations

import sys
import types

import pytest

from backend.adapters import docnest_adapter as dn


# ── Fake docnest matching the REAL 0.6.0 ParserFactory API ────────────────────

def _install_fake_docnest(monkeypatch, *, sections=None, raw_text=None, supports=True, raise_on_parse=False):
    """Inject a stand-in `docnest.parsers.factory.ParserFactory` into sys.modules."""

    class _Sec:
        def __init__(self, text="", title="", page=None):
            self.text, self.title, self.page = text, title, page

    class _Raw:
        def __init__(self):
            self.sections = sections or []
            self.raw_text = raw_text

    class _Parser:
        def parse(self, _path):
            if raise_on_parse:
                raise RuntimeError("boom")
            return _Raw()

    class _Factory:
        def __init__(self, pdf_engine="docling"):
            self.pdf_engine = pdf_engine

        def supports(self, _path):
            return supports

        def get(self, _path):
            return _Parser()

    pkg = types.ModuleType("docnest")
    parsers = types.ModuleType("docnest.parsers")
    factory = types.ModuleType("docnest.parsers.factory")
    factory.ParserFactory = _Factory  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "docnest", pkg)
    monkeypatch.setitem(sys.modules, "docnest.parsers", parsers)
    monkeypatch.setitem(sys.modules, "docnest.parsers.factory", factory)
    return _Sec


class TestParseDocumentMapping:
    def test_maps_sections_to_docnest_sections(self, monkeypatch):
        Sec = _install_fake_docnest(monkeypatch)   # grab the _Sec factory
        secs = [Sec(text="Backprop reuses activations.", title="Intro", page=None),
                Sec(text="Chain rule propagates gradients.", title="Method", page=3)]
        _install_fake_docnest(monkeypatch, sections=secs)

        out = dn.parse_document("paper.pdf", pdf_engine="pymupdf")
        assert out is not None
        assert [s.text for s in out] == ["Backprop reuses activations.", "Chain rule propagates gradients."]
        assert out[0].section == "Intro"
        assert out[1].page == 3

    def test_skips_fully_empty_sections(self, monkeypatch):
        Sec = _install_fake_docnest(monkeypatch)
        secs = [Sec(text="  ", title=""), Sec(text="real content", title="ok")]
        _install_fake_docnest(monkeypatch, sections=secs)
        out = dn.parse_document("x.pdf")
        assert [s.text for s in out] == ["real content"]

    def test_heading_only_section_uses_title_as_content(self, monkeypatch):
        """OCR'd headings land in title with empty text — still indexable."""
        Sec = _install_fake_docnest(monkeypatch)
        secs = [Sec(text="", title="OCR CONFIRMS DOCNEST WORKS")]
        _install_fake_docnest(monkeypatch, sections=secs)
        out = dn.parse_document("scan.pdf")
        assert out == [dn.DocnestSection(
            text="OCR CONFIRMS DOCNEST WORKS", section="OCR CONFIRMS DOCNEST WORKS")]

    def test_drops_docling_structural_placeholders(self, monkeypatch):
        """An image-only page docling can't OCR leaks as a 'Figures' placeholder
        section — that must NOT be indexed as content."""
        Sec = _install_fake_docnest(monkeypatch)
        secs = [Sec(text="Figures", title="Figures"), Sec(text="real body text", title="Intro")]
        _install_fake_docnest(monkeypatch, sections=secs)
        out = dn.parse_document("invitation.pdf")
        assert [s.text for s in out] == ["real body text"]

    def test_all_placeholders_returns_none(self, monkeypatch):
        Sec = _install_fake_docnest(monkeypatch)
        _install_fake_docnest(monkeypatch, sections=[Sec(text="Figures", title="Figures")])
        assert dn.parse_document("imageonly.pdf") is None

    def test_falls_back_to_raw_text_when_no_sections(self, monkeypatch):
        _install_fake_docnest(monkeypatch, sections=[], raw_text="flat document text")
        out = dn.parse_document("x.pdf")
        assert out == [dn.DocnestSection(text="flat document text")]

    def test_unsupported_format_returns_none(self, monkeypatch):
        _install_fake_docnest(monkeypatch, supports=False)
        assert dn.parse_document("archive.udf") is None

    def test_parse_error_returns_none(self, monkeypatch):
        _install_fake_docnest(monkeypatch, raise_on_parse=True)
        assert dn.parse_document("broken.pdf") is None


class TestTesseractResolution:
    def test_lang_default_is_english_hindi(self, monkeypatch):
        monkeypatch.delenv("KNOVEX_OCR_LANG", raising=False)
        assert dn._ocr_languages() == ["eng", "hin"]

    def test_lang_override(self, monkeypatch):
        monkeypatch.setenv("KNOVEX_OCR_LANG", "eng, mar , hin")
        assert dn._ocr_languages() == ["eng", "mar", "hin"]

    def test_resolve_explicit_cmd(self, monkeypatch, tmp_path):
        exe = tmp_path / "tesseract.exe"
        exe.write_text("")
        monkeypatch.setenv("KNOVEX_TESSERACT_CMD", str(exe))
        assert dn._resolve_tesseract() == str(exe)

    def test_resolve_none_when_absent(self, monkeypatch):
        monkeypatch.delenv("KNOVEX_TESSERACT_CMD", raising=False)
        monkeypatch.setattr("shutil.which", lambda _n: None)
        monkeypatch.setattr(dn.Path, "exists", lambda self: False)
        assert dn._resolve_tesseract() is None

    @pytest.mark.skipif(not dn.is_available(), reason="docnest-ai not installed")
    def test_factory_uses_tesseract_when_available(self, monkeypatch, tmp_path):
        """When a Tesseract binary resolves, the registered docling parser is
        configured for Tesseract + the requested languages."""
        exe = tmp_path / "tesseract.exe"
        exe.write_text("")
        monkeypatch.setenv("KNOVEX_TESSERACT_CMD", str(exe))
        monkeypatch.setenv("KNOVEX_OCR_LANG", "eng,hin")
        factory = dn._build_factory("docling", ocr=True)
        from docnest.parsers.pdf import DoclingPDFParser
        parser = next(p for p in factory._registry if isinstance(p, DoclingPDFParser))
        assert parser._ocr_engine == "tesseract"
        assert parser._ocr_lang == ["eng", "hin"]
        assert parser._tesseract_cmd == str(exe)
        assert parser._force_full_page_ocr is True


class TestAvailability:
    def test_absent_docnest_reports_unavailable(self, monkeypatch):
        monkeypatch.setitem(sys.modules, "docnest.parsers.factory", None)
        assert dn.is_available() is False
        assert dn.parse_document("x.pdf") is None


# ── Real integration: only when docnest-ai is actually installed ──────────────

_HAS_DOCNEST = dn.is_available()
fitz = pytest.importorskip("fitz")


@pytest.mark.skipif(not _HAS_DOCNEST, reason="docnest-ai not installed")
class TestRealDocnest:
    def test_recovers_text_from_real_pdf(self, tmp_path):
        doc = fitz.open()
        for line in ("Backpropagation reuses cached activations.",
                     "The chain rule propagates gradients layer by layer."):
            page = doc.new_page()
            page.insert_text((72, 72), line)
        path = tmp_path / "smoke.pdf"
        doc.save(str(path)); doc.close()

        # pymupdf engine: real docnest, but no ML model downloads in the test.
        out = dn.parse_document(path, pdf_engine="pymupdf")
        assert out, "docnest returned no sections for a text PDF"
        joined = " ".join(s.text for s in out)
        assert "Backpropagation" in joined
        assert "chain rule" in joined.lower()

    @pytest.mark.slow
    def test_ocr_recovers_image_only_pdf(self, tmp_path):
        """The whole point of delegating to docnest: a PDF with NO text layer
        (text baked into an image) is recovered via OCR. docnest's docling
        parser defaults ocr=False, so the adapter must enable it. Slow — downloads
        docling OCR models on first run."""
        src = fitz.open(); sp = src.new_page(width=600, height=200)
        sp.insert_text((40, 110), "OCR CONFIRMS DOCNEST WORKS", fontsize=34)
        pix = sp.get_pixmap(dpi=150)
        img = fitz.open(); ip = img.new_page(width=600, height=200)
        ip.insert_image(fitz.Rect(0, 0, 600, 200), pixmap=pix)
        path = tmp_path / "image_only.pdf"
        img.save(str(path)); img.close(); src.close()

        assert fitz.open(str(path))[0].get_text().strip() == "", "PDF must have no text layer"

        out = dn.parse_document(path, pdf_engine="docling", ocr=True)
        assert out, "OCR recovered no text from the image-only PDF"
        joined = " ".join(s.text for s in out).upper()
        assert "DOCNEST" in joined
