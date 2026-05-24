"""
Adapter unit tests — Sprint 2 / 3

Uses only stub adapters — no network, no real files, no LiteLLM.
Tests verify:
  - StubLLMClient honours injected replies
  - StubHttpClient honours pre-configured responses
  - StubPDFAdapter / StubParagraphAdapter return injected pages/paragraphs
  - HttpResponse helper methods behave correctly
  - LiteLLMAdapter defers import (anti-corruption layer check)
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# HttpResponse
# ---------------------------------------------------------------------------

def test_http_response_ok():
    from backend.adapters.http_client import HttpResponse
    assert HttpResponse(status_code=200, text="").ok is True
    assert HttpResponse(status_code=204, text="").ok is True
    assert HttpResponse(status_code=299, text="").ok is True
    assert HttpResponse(status_code=300, text="").ok is False
    assert HttpResponse(status_code=404, text="").ok is False
    assert HttpResponse(status_code=500, text="").ok is False


def test_http_response_json():
    from backend.adapters.http_client import HttpResponse
    payload = {"models": [{"name": "llama3"}]}
    r = HttpResponse(status_code=200, text=json.dumps(payload))
    assert r.json() == payload


def test_http_response_json_invalid():
    from backend.adapters.http_client import HttpResponse
    r = HttpResponse(status_code=200, text="not-json")
    with pytest.raises(Exception):
        r.json()


# ---------------------------------------------------------------------------
# StubHttpClient
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stub_http_client_get():
    from backend.adapters.http_client import StubHttpClient
    client = StubHttpClient()
    client.set_response("http://example.com/api", 200, '{"result": 1}')
    resp = await client.get("http://example.com/api")
    assert resp.ok
    assert resp.json() == {"result": 1}


@pytest.mark.asyncio
async def test_stub_http_client_post():
    from backend.adapters.http_client import StubHttpClient
    client = StubHttpClient()
    client.set_response("http://example.com/submit", 201, '{"id": "abc"}')
    resp = await client.post("http://example.com/submit", json={"data": "x"})
    assert resp.status_code == 201
    assert resp.json()["id"] == "abc"


@pytest.mark.asyncio
async def test_stub_http_client_default_200():
    """StubHttpClient returns a 200 with empty text for unconfigured URLs."""
    from backend.adapters.http_client import StubHttpClient
    client = StubHttpClient()
    resp = await client.get("http://not-configured.com/")
    assert resp.status_code == 200
    assert resp.ok
    assert resp.text == ""


# ---------------------------------------------------------------------------
# StubLLMClient
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stub_llm_client_complete():
    from backend.adapters.llm_client import StubLLMClient
    client = StubLLMClient(reply="Hello from stub")
    # ILLMClient.complete requires max_tokens and temperature
    result = await client.complete(
        messages=[{"role": "user", "content": "Hi"}],
        max_tokens=256,
        temperature=0.3,
    )
    assert result == "Hello from stub"


@pytest.mark.asyncio
async def test_stub_llm_client_stream():
    from backend.adapters.llm_client import StubLLMClient
    client = StubLLMClient(reply="hello world")
    tokens = []
    # StubLLMClient.stream splits on whitespace and appends a space to each word
    async for token in client.stream(
        messages=[{"role": "user", "content": "Hi"}],
        max_tokens=256,
        temperature=0.3,
    ):
        tokens.append(token)
    # "hello world".split() → ["hello", "world"], each yielded as "word + ' '"
    assert tokens == ["hello ", "world "]


@pytest.mark.asyncio
async def test_stub_llm_client_stream_not_empty():
    from backend.adapters.llm_client import StubLLMClient
    client = StubLLMClient(reply="Token1 Token2 Token3")
    tokens = []
    async for token in client.stream(
        messages=[{"role": "user", "content": "Test"}],
        max_tokens=512,
        temperature=0.0,
    ):
        tokens.append(token)
    assert len(tokens) == 3
    combined = "".join(tokens).strip()
    assert "Token1" in combined
    assert "Token3" in combined


# ---------------------------------------------------------------------------
# StubPDFAdapter
# ---------------------------------------------------------------------------

def test_stub_pdf_adapter():
    from backend.adapters.document_parsers import StubPDFAdapter, PageContent
    pages = [
        PageContent(page_num=1, text="First page text"),
        PageContent(page_num=2, text="Second page text"),
    ]
    adapter = StubPDFAdapter(pages=pages)
    result = adapter.extract_pages(Path("fake.pdf"))
    assert len(result) == 2
    assert result[0].page_num == 1
    assert result[1].text == "Second page text"


def test_stub_pdf_adapter_empty():
    from backend.adapters.document_parsers import StubPDFAdapter
    adapter = StubPDFAdapter(pages=[])
    result = adapter.extract_pages(Path("fake.pdf"))
    assert result == []


# ---------------------------------------------------------------------------
# StubParagraphAdapter
# ---------------------------------------------------------------------------

def test_stub_paragraph_adapter():
    from backend.adapters.document_parsers import StubParagraphAdapter, ParagraphContent
    paragraphs = [
        ParagraphContent(text="Introduction", style="Heading 1"),
        ParagraphContent(text="Body text here.", style="Normal"),
    ]
    adapter = StubParagraphAdapter(paragraphs=paragraphs)
    result = adapter.extract_paragraphs(Path("fake.docx"))
    assert len(result) == 2
    assert result[0].style == "Heading 1"
    assert result[1].text == "Body text here."


# ---------------------------------------------------------------------------
# Anti-corruption layer: litellm only imported inside LiteLLMAdapter methods
# ---------------------------------------------------------------------------

def test_litellm_not_imported_at_module_level():
    """
    LiteLLMAdapter must not import litellm at module level — only inside
    async methods. This keeps the adapter layer importable even without
    litellm installed (e.g., in CI with a minimal requirements install).
    """
    import backend.adapters.llm_client as llm_mod  # noqa: F401
    module_globals = vars(llm_mod)
    # litellm should not appear as a module-level name in llm_client.py
    assert "litellm" not in module_globals, (
        "litellm was imported at the module level of llm_client.py — "
        "it must only be imported inside method bodies"
    )
