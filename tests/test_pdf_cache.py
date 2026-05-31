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
    import os, time
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
