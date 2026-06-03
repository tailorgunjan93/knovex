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

    def test_skips_empty_sections(self, monkeypatch):
        Sec = _install_fake_docnest(monkeypatch, sections=[])
        secs = [Sec(text="  ", title="blank"), Sec(text="real content", title="ok")]
        _install_fake_docnest(monkeypatch, sections=secs)
        out = dn.parse_document("x.pdf")
        assert [s.text for s in out] == ["real content"]

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
