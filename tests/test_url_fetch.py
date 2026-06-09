"""
URL text fetch helper — used by /summarize <url> (and shareable with Learn).

Fetches a page server-side (the renderer can't, due to CORS / Electron) and
returns clean plain text. Must NEVER raise: a failure returns "" so the chat
stream degrades gracefully instead of dropping mid-response.
"""

from __future__ import annotations

import pytest

from backend.core import url_fetch


class _Resp:
    def __init__(self, status: int, text: str) -> None:
        self.status_code = status
        self.text = text


def _fake_client(status: int = 200, text: str = "", raise_exc: Exception | None = None):
    class _Client:
        def __init__(self, *a, **k) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url):
            if raise_exc is not None:
                raise raise_exc
            return _Resp(status, text)

    return _Client


@pytest.mark.asyncio
async def test_strips_html_scripts_and_styles(monkeypatch):
    import httpx
    html = (
        "<html><head><style>.x{color:red}</style><script>alert(1)</script></head>"
        "<body><h1>Title</h1><p>Hello&nbsp;world.</p></body></html>"
    )
    monkeypatch.setattr(httpx, "AsyncClient", _fake_client(200, html))
    text = await url_fetch.fetch_url_text("https://example.com")
    assert "Title" in text
    assert "Hello" in text and "world." in text
    assert "alert" not in text          # script body removed
    assert "color:red" not in text      # style body removed
    assert "<" not in text              # all tags stripped


@pytest.mark.asyncio
async def test_truncates_to_max_chars(monkeypatch):
    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", _fake_client(200, "<p>" + "a" * 5000 + "</p>"))
    text = await url_fetch.fetch_url_text("https://example.com", max_chars=100)
    assert len(text) <= 100


@pytest.mark.asyncio
async def test_non_200_returns_empty(monkeypatch):
    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", _fake_client(404, "nope"))
    assert await url_fetch.fetch_url_text("https://example.com") == ""


@pytest.mark.asyncio
async def test_exception_returns_empty(monkeypatch):
    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", _fake_client(raise_exc=RuntimeError("boom")))
    assert await url_fetch.fetch_url_text("https://example.com") == ""


@pytest.mark.asyncio
async def test_empty_url_returns_empty():
    assert await url_fetch.fetch_url_text("") == ""
