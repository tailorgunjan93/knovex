"""
Out-of-process OCR sidecar.

The packaged backend is a frozen PyInstaller binary: it can't pip-install or
import docnest. So OCR runs in a *separate* Python (a provisioned env), driven
by `backend/adapters/ocr_sidecar.py` and invoked through the docnest_adapter
sidecar path. These tests pin:
  * the adapter's payload mapping + interpreter resolution (fast, pure),
  * the real sidecar round-trip via a subprocess (gated on docnest; uses the
    fast pymupdf engine so no ML models download).
"""

from __future__ import annotations

import json
import sys

import pytest

from backend.adapters import docnest_adapter as dn
from backend.adapters import ocr_sidecar

fitz = pytest.importorskip("fitz")
_HAS_DOCNEST = dn.is_available()


# ── Pure: payload mapping ─────────────────────────────────────────────────────

class TestSectionsFromPayload:
    def test_maps_ok_payload(self):
        out = dn._sections_from_payload(
            {"ok": True, "sections": [
                {"text": "Recovered line", "section": "Slide 6", "page": 6},
                {"text": "Second", "section": "", "page": None},
            ]}
        )
        assert out == [
            dn.DocnestSection(text="Recovered line", section="Slide 6", page=6),
            dn.DocnestSection(text="Second", section="", page=None),
        ]

    def test_not_ok_returns_none(self):
        assert dn._sections_from_payload({"ok": False, "error": "boom"}) is None

    def test_empty_sections_returns_none(self):
        assert dn._sections_from_payload({"ok": True, "sections": []}) is None

    def test_drops_docling_placeholder_sections(self):
        out = dn._sections_from_payload(
            {"ok": True, "sections": [{"text": "Figures", "section": "Figures"}, {"text": "real"}]}
        )
        assert out == [dn.DocnestSection(text="real")]

    def test_skips_blank_text_entries(self):
        out = dn._sections_from_payload(
            {"ok": True, "sections": [{"text": "  ", "section": "x"}, {"text": "real"}]}
        )
        assert out == [dn.DocnestSection(text="real")]


# ── Pure: interpreter resolution ──────────────────────────────────────────────

class TestResolveOcrPython:
    def test_none_when_unset(self, monkeypatch):
        monkeypatch.delenv("KNOVEX_OCR_PYTHON", raising=False)
        monkeypatch.delenv("KNOVEX_OCR_HOME", raising=False)
        assert dn._resolve_ocr_python() is None

    def test_explicit_python_path(self, monkeypatch, tmp_path):
        exe = tmp_path / "python.exe"
        exe.write_text("")
        monkeypatch.setenv("KNOVEX_OCR_PYTHON", str(exe))
        assert dn._resolve_ocr_python() == str(exe)

    def test_explicit_path_missing_is_ignored(self, monkeypatch, tmp_path):
        monkeypatch.setenv("KNOVEX_OCR_PYTHON", str(tmp_path / "nope.exe"))
        monkeypatch.delenv("KNOVEX_OCR_HOME", raising=False)
        assert dn._resolve_ocr_python() is None

    def test_home_windows_layout(self, monkeypatch, tmp_path):
        scripts = tmp_path / "Scripts"
        scripts.mkdir()
        (scripts / "python.exe").write_text("")
        monkeypatch.delenv("KNOVEX_OCR_PYTHON", raising=False)
        monkeypatch.setenv("KNOVEX_OCR_HOME", str(tmp_path))
        assert dn._resolve_ocr_python() == str(scripts / "python.exe")

    def test_home_posix_layout(self, monkeypatch, tmp_path):
        binp = tmp_path / "bin"
        binp.mkdir()
        (binp / "python").write_text("")
        monkeypatch.delenv("KNOVEX_OCR_PYTHON", raising=False)
        monkeypatch.setenv("KNOVEX_OCR_HOME", str(tmp_path))
        assert dn._resolve_ocr_python() == str(binp / "python")


# ── parse_via_sidecar with a fake interpreter (no real subprocess) ────────────

class TestParseViaSidecarMapping:
    def _fake_run(self, payload, returncode=0):
        def _run(cmd, capture_output, text, timeout):
            # cmd = [python, sidecar, file, --engine, eng, --out, OUT, ...]
            out_path = cmd[cmd.index("--out") + 1]
            with open(out_path, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)

            class _P:
                pass

            p = _P()
            p.returncode = returncode
            p.stdout = ""
            p.stderr = ""
            return p

        return _run

    def test_success_round_trip(self, monkeypatch):
        import subprocess
        monkeypatch.setattr(
            subprocess, "run",
            self._fake_run({"ok": True, "sections": [{"text": "hi", "section": "s", "page": 2}]}),
        )
        out = dn.parse_via_sidecar("x.pdf", "py", engine="pymupdf")
        assert out == [dn.DocnestSection(text="hi", section="s", page=2)]

    def test_sidecar_failure_returns_none(self, monkeypatch):
        import subprocess
        monkeypatch.setattr(
            subprocess, "run",
            self._fake_run({"ok": False, "error": "ParseError"}, returncode=1),
        )
        assert dn.parse_via_sidecar("x.pdf", "py") is None


# ── Real sidecar subprocess (dev only; fast pymupdf engine, no model download) ─

@pytest.mark.skipif(not _HAS_DOCNEST, reason="docnest-ai not installed")
class TestRealSidecar:
    def _text_pdf(self, tmp_path):
        doc = fitz.open()
        doc.new_page().insert_text((72, 72), "Sidecar recovered this sentence.")
        p = tmp_path / "s.pdf"
        doc.save(str(p))
        doc.close()
        return p

    def test_extract_sections_direct(self, tmp_path):
        out = ocr_sidecar.extract_sections(str(self._text_pdf(tmp_path)), engine="pymupdf", ocr=False)
        assert any("Sidecar recovered" in s["text"] for s in out)

    def test_subprocess_round_trip(self, tmp_path):
        # Drive the real sidecar through the current interpreter (which has
        # docnest), exactly as the packaged app will drive the OCR env.
        out = dn.parse_via_sidecar(self._text_pdf(tmp_path), sys.executable,
                                   engine="pymupdf", ocr=False)
        assert out is not None
        assert any("Sidecar recovered" in s.text for s in out)
