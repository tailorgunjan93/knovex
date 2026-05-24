"""
Import smoke tests — Sprint 1, 2, 3

Every module must import cleanly without network access, DB connections,
or missing optional dependencies raising errors.

Strategy:
  - Import each public module
  - Create the FastAPI app
  - Verify expected routes are registered
  - Verify adapter interfaces are respected
"""

from __future__ import annotations

import pytest


# ---------------------------------------------------------------------------
# Core / Config
# ---------------------------------------------------------------------------

def test_config_imports():
    from backend.core.config import settings  # noqa: F401
    assert settings.version == "0.3.0"
    assert settings.backend_port == 8765


def test_schemas_import():
    from backend.models.schemas import (  # noqa: F401
        ContentBlock,
        FileAskRequest,
        FileContentResponse,
        KBCreate,
        KBResponse,
    )


# ---------------------------------------------------------------------------
# Domain
# ---------------------------------------------------------------------------

def test_domain_kb_import():
    from backend.core.domain.kb import KB  # noqa: F401
    import uuid
    kb = KB(id=str(uuid.uuid4()), name="test", color="#ff0000", icon="📚")
    assert kb.name == "test"


def test_domain_file_record_import():
    from backend.core.domain.file_record import FileRecord, SUPPORTED_FORMATS  # noqa: F401
    assert "pdf" in SUPPORTED_FORMATS
    assert "docx" in SUPPORTED_FORMATS


# ---------------------------------------------------------------------------
# Adapters
# ---------------------------------------------------------------------------

def test_llm_adapter_imports():
    from backend.adapters.llm_client import ILLMClient, LiteLLMAdapter, StubLLMClient  # noqa: F401


def test_http_adapter_imports():
    from backend.adapters.http_client import IHttpClient, HttpxAdapter, StubHttpClient, HttpResponse  # noqa: F401
    r = HttpResponse(status_code=200, text='{"ok": true}')
    assert r.ok is True
    assert r.json() == {"ok": True}


def test_document_parser_imports():
    from backend.adapters.document_parsers import (  # noqa: F401
        IPDFAdapter,
        IParagraphAdapter,
        PageContent,
        ParagraphContent,
        PyMuPDFAdapter,
        PythonDocxAdapter,
        StubPDFAdapter,
        StubParagraphAdapter,
    )


# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------

def test_ingestion_service_imports():
    from backend.core.ingestion_service import (  # noqa: F401
        IngestionService,
        IFileParser,
        get_parser,
        PlainTextParser,
        CSVParser,
        PDFParser,
        DOCXParser,
    )
    # All parsers must be registered
    for fmt in ("txt", "md", "csv", "pdf", "docx", "udf"):
        assert get_parser(fmt) is not None, f"Parser not registered for format: {fmt}"


def test_reader_service_imports():
    from backend.core.reader_service import ReaderService  # noqa: F401


def test_kb_service_imports():
    from backend.core.kb_service import KBService  # noqa: F401


def test_llm_service_imports():
    from backend.core.llm_service import LLMService  # noqa: F401


def test_watcher_service_imports():
    from backend.core.watcher_service import WatcherService  # noqa: F401


# ---------------------------------------------------------------------------
# Providers (no network calls)
# ---------------------------------------------------------------------------

def test_provider_factory_imports():
    import backend.core.providers  # noqa: F401 — triggers self-registration
    from backend.core.providers.factory import LLMProviderFactory
    providers = LLMProviderFactory.registered_providers()
    for name in ("openai", "anthropic", "groq", "gemini", "ollama"):
        assert name in providers, f"Provider not registered: {name}"


# ---------------------------------------------------------------------------
# FastAPI app creation
# ---------------------------------------------------------------------------

def test_app_creates():
    """The app must create without errors and expose expected routes."""
    from backend.main import create_app
    app = create_app()
    routes = {r.path for r in app.routes}  # type: ignore[attr-defined]
    assert "/api/health" in routes
    assert "/api/settings" in routes
    # KB + reader routes
    assert any("/kb" in r for r in routes)
    assert any("/content" in r for r in routes)
    assert any("/ask" in r for r in routes)


def test_reader_route_registered():
    """Verify the reader router is wired up."""
    from backend.main import create_app
    app = create_app()
    paths = [r.path for r in app.routes]  # type: ignore[attr-defined]
    assert "/api/kb/{kb_id}/files/{file_id}/content" in paths
    assert "/api/kb/{kb_id}/files/{file_id}/ask" in paths
