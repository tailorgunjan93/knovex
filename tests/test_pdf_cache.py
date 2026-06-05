"""
CachingPDFAdapter tests — Reader performance root-fix (redesign Phase 3).

Bug: ReaderService re-parsed the ENTIRE PDF on every page turn
(`_render_blocks` → `extract_pages`), discarding all but one page. Turning to
page N of an M-page PDF cost a full M-page parse every time.

Fix: a Decorator (CachingPDFAdapter) that memoizes extract_pages keyed by
(path, mtime, size). These tests prove:
  - transparent: identical output to the wrapped adapter (LSP),
  - fast: the wrapped adapter is invoked ONCE across repeated calls (O(1) turns),
  - correct: the cache invalidates when the file changes on disk.
"""

from __future__ import annotations

from pathlib import Path

from backend.adapters.document_parsers import (
    CachingPDFAdapter,
    IPDFAdapter,
    PageContent,
)


class CountingPDFAdapter(IPDFAdapter):
    """Wrapped adapter that records how many times it actually parsed."""

    def __init__(self, pages: list[PageContent]) -> None:
        self._pages = pages
        self.calls = 0

    def extract_pages(self, file_path: Path) -> list[PageContent]:
        self.calls += 1
        return list(self._pages)


def _write_pdf_stub(tmp_path: Path, name: str = "doc.pdf", body: bytes = b"%PDF-1.4 stub") -> Path:
    p = tmp_path / name
    p.write_bytes(body)
    return p


def test_output_matches_wrapped_adapter(tmp_path: Path):
    pages = [PageContent(page_num=1, text="one"), PageContent(page_num=2, text="two")]
    inner = CountingPDFAdapter(pages)
    cached = CachingPDFAdapter(inner)
    path = _write_pdf_stub(tmp_path)

    result = cached.extract_pages(path)
    assert [(p.page_num, p.text) for p in result] == [(1, "one"), (2, "two")]


def test_parses_only_once_across_many_calls(tmp_path: Path):
    inner = CountingPDFAdapter([PageContent(page_num=1, text="x")])
    cached = CachingPDFAdapter(inner)
    path = _write_pdf_stub(tmp_path)

    for _ in range(10):
        cached.extract_pages(path)

    # The whole point: 10 "page turns" → 1 real parse.
    assert inner.calls == 1


def test_cache_invalidates_when_file_changes(tmp_path: Path):
    inner = CountingPDFAdapter([PageContent(page_num=1, text="x")])
    cached = CachingPDFAdapter(inner)
    path = _write_pdf_stub(tmp_path, body=b"%PDF-1.4 first")

    cached.extract_pages(path)
    assert inner.calls == 1

    # Rewrite the file with different content + bump mtime → must re-parse.
    import os
    import time
    time.sleep(0.01)
    path.write_bytes(b"%PDF-1.4 second-and-longer")
    os.utime(path, None)

    cached.extract_pages(path)
    assert inner.calls == 2


def test_distinct_files_cached_independently(tmp_path: Path):
    inner = CountingPDFAdapter([PageContent(page_num=1, text="x")])
    cached = CachingPDFAdapter(inner)
    a = _write_pdf_stub(tmp_path, name="a.pdf")
    b = _write_pdf_stub(tmp_path, name="b.pdf", body=b"%PDF-1.4 other")

    cached.extract_pages(a)
    cached.extract_pages(b)
    cached.extract_pages(a)
    cached.extract_pages(b)

    # Two distinct files → two parses, then served from cache.
    assert inner.calls == 2


def test_is_a_pdf_adapter(tmp_path: Path):
    """LSP: a CachingPDFAdapter must be usable anywhere an IPDFAdapter is."""
    cached = CachingPDFAdapter(CountingPDFAdapter([]))
    assert isinstance(cached, IPDFAdapter)


# ──────────────────────────────────────────────────────────────────────────────
# Cache LIFETIME — the decorator only helps if its instance survives across
# requests. ReaderService is built per-request (DI), so the cache must live in a
# process singleton that is INJECTED, not re-wrapped per instance.
#
# Bug being guarded: __init__ unconditionally wrapped pdf_adapter in a NEW
# CachingPDFAdapter, so an injected singleton cache was discarded and every page
# turn re-parsed the whole PDF.
# ──────────────────────────────────────────────────────────────────────────────

def _make_reader(pdf_adapter):
    """Construct a ReaderService with only the PDF adapter wired (other deps are
    unused for cache-lifetime assertions)."""
    from backend.core.reader_service import ReaderService
    return ReaderService(file_repo=None, backend=None, llm_svc=None, pdf_adapter=pdf_adapter)


def test_reader_does_not_rewrap_an_injected_caching_adapter():
    """A CachingPDFAdapter passed in must be used as-is, so its cache is shared
    across the per-request ReaderService instances."""
    shared = CachingPDFAdapter(CountingPDFAdapter([PageContent(page_num=1, text="x")]))

    svc1 = _make_reader(shared)
    svc2 = _make_reader(shared)

    assert svc1._pdf_adapter is shared
    assert svc2._pdf_adapter is shared


def test_reader_still_wraps_a_raw_adapter():
    """A raw (non-caching) adapter must still be wrapped so caching is always on
    (back-compat for injected stubs / default PyMuPDFAdapter)."""
    raw = CountingPDFAdapter([PageContent(page_num=1, text="x")])
    svc = _make_reader(raw)
    assert isinstance(svc._pdf_adapter, CachingPDFAdapter)


def test_get_pdf_adapter_is_a_process_singleton():
    """The DI provider must hand out ONE CachingPDFAdapter for the whole process
    so the page cache persists across requests."""
    from backend.core.dependencies import get_pdf_adapter
    get_pdf_adapter.cache_clear()
    a = get_pdf_adapter()
    b = get_pdf_adapter()
    assert a is b
    assert isinstance(a, CachingPDFAdapter)
