#!/usr/bin/env python
"""
Out-of-process OCR sidecar.

This script runs INSIDE the on-demand OCR environment — a *separate* Python
interpreter that has ``docnest-ai`` installed — NOT inside Knovex's frozen
backend (which can't pip-install or import docnest). It must therefore be
fully self-contained: **no ``backend.*`` imports**. Knovex's ``docnest_adapter``
invokes it as a subprocess and reads the JSON result.

It deliberately mirrors the in-process mapping in ``docnest_adapter`` — that
duplication is the cost of the process boundary (the two interpreters share no
code), and both sides are covered by tests so they can't silently drift.

Usage::

    python ocr_sidecar.py <file_path> [--engine docling|pymupdf] [--no-ocr] [--out PATH]

Result is written as JSON to ``--out`` (preferred — keeps it clear of any stray
library logging on stdout) or to stdout::

    {"ok": true,  "sections": [{"text": "...", "section": "...", "page": 1}]}
    {"ok": false, "error": "ParseError: ..."}

Exit code is 0 on success (even with zero sections) and non-zero only on a hard
failure, so the caller can distinguish "no text found" from "sidecar broke".
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

# Mirror of docnest_adapter._DOCLING_PLACEHOLDERS (process boundary → can't import
# it). docling group labels that leak as a section's entire content; drop them.
_DOCLING_PLACEHOLDERS = frozenset({
    "figures", "figure", "tables", "table", "pictures", "picture", "forms", "form",
})


def extract_sections(file_path: str, *, engine: str = "docling", ocr: bool = True) -> list[dict]:
    """Parse a document via docnest and return plain section dicts.

    Mirror of ``docnest_adapter`` mapping, kept dependency-free so it runs in the
    OCR env. Raises on docnest failure (the caller reports it as ok=false).
    """
    import os
    import shutil

    from docnest.parsers.factory import ParserFactory

    factory = ParserFactory(pdf_engine=engine)
    if ocr and engine == "docling":
        try:
            from docnest.parsers.pdf import DoclingPDFParser

            # Tesseract (Devanagari/Hindi-capable) when available, else default.
            tcmd = os.environ.get("KNOVEX_TESSERACT_CMD") or shutil.which("tesseract")
            langs = [x.strip() for x in os.environ.get("KNOVEX_OCR_LANG", "eng,hin").split(",") if x.strip()]
            if tcmd:
                parser = DoclingPDFParser(
                    ocr=True, ocr_engine="tesseract", ocr_lang=langs or ["eng"],
                    tesseract_cmd=tcmd, force_full_page_ocr=True,
                )
            else:
                parser = DoclingPDFParser(ocr=True)
            factory.unregister(DoclingPDFParser)
            factory.register(parser, position=0)
        except Exception:
            pass  # fall back to factory default if docnest internals differ

    if not factory.supports(file_path):
        return []

    raw = factory.get(file_path).parse(file_path)
    sections: list[dict] = []
    for sec in getattr(raw, "sections", None) or []:
        title = (getattr(sec, "title", "") or "").strip()
        text = (getattr(sec, "text", "") or "").strip()
        content = text or title  # heading-only sections still carry indexable text
        if not content or content.strip().lower() in _DOCLING_PLACEHOLDERS:
            continue
        sections.append({"text": content, "section": title, "page": getattr(sec, "page", None)})

    if not sections:
        raw_text = (getattr(raw, "raw_text", "") or "").strip()
        if raw_text:
            sections.append({"text": raw_text, "section": "", "page": None})

    return sections


def main(argv: list[str] | None = None) -> int:
    # Silence docling/rapidocr chatter so stdout stays clean when --out is absent.
    logging.disable(logging.CRITICAL)

    ap = argparse.ArgumentParser(description="docnest OCR sidecar")
    ap.add_argument("file_path")
    ap.add_argument("--engine", default="docling", choices=["docling", "pymupdf"])
    ap.add_argument("--no-ocr", action="store_true", help="disable OCR (text-layer only)")
    ap.add_argument("--out", default=None, help="write JSON here instead of stdout")
    args = ap.parse_args(argv)

    try:
        sections = extract_sections(args.file_path, engine=args.engine, ocr=not args.no_ocr)
        payload = {"ok": True, "sections": sections}
        rc = 0
    except Exception as exc:  # noqa: BLE001 — report any failure to the parent
        payload = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
        rc = 1

    text = json.dumps(payload)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)
    else:
        sys.stdout.write(text)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
