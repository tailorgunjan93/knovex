"""
URL text fetch — server-side page fetch + HTML→text cleanup.

The renderer can't fetch arbitrary URLs (CORS / Electron file://), so the
backend does it. Used by /summarize <url> via the chat stream; the same cleanup
that Learn applies to URL sources.

Contract: NEVER raises. A bad URL, non-200, or network error returns "" so the
caller (a streaming response that has already begun) degrades gracefully rather
than dropping the connection mid-stream.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger("knovex.url_fetch")

_UA = "Mozilla/5.0 (compatible; Knovex/1.0)"
_DEFAULT_MAX_CHARS = 8000


async def fetch_url_text(url: str, max_chars: int = _DEFAULT_MAX_CHARS) -> str:
    """Fetch *url* and return up to *max_chars* of clean plain text ("" on failure)."""
    if not url:
        return ""
    try:
        import httpx  # only import site
        async with httpx.AsyncClient(
            timeout=12,
            follow_redirects=True,
            headers={"User-Agent": _UA},
        ) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                logger.warning("URL fetch returned %d for %s", resp.status_code, url)
                return ""
            html = resp.text
    except Exception as exc:  # noqa: BLE001 — never raise into a started stream
        logger.warning("URL fetch failed for %s: %s", url, exc)
        return ""

    # Drop script/style bodies, then all tags + entities, then collapse whitespace.
    no_script = re.sub(r"<(script|style)[^>]*>.*?</(script|style)>", " ", html, flags=re.S | re.I)
    plain = re.sub(r"<[^>]+>", " ", no_script)
    plain = re.sub(r"&[a-z]+;", " ", plain)
    return re.sub(r"\s{2,}", " ", plain).strip()[:max_chars]
