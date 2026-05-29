"""
Import smoke tests — Sprint 1–6

Every module must import cleanly without network access, DB connections,
or missing optional dependencies raising errors.

Strategy:
  - Import each public module
  - Create the FastAPI app
  - Verify expected routes are registered
  - Verify adapter interfaces are respected
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Core / Config
# ---------------------------------------------------------------------------

def test_config_imports():
    from backend.core.config import settings  # noqa: F401
    assert settings.version == "0.9.7"
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
    import uuid

    from backend.core.domain.kb import KB  # noqa: F401
    kb = KB(id=str(uuid.uuid4()), name="test", color="#ff0000", icon="📚")
    assert kb.name == "test"


def test_domain_file_record_import():
    from backend.core.domain.file_record import SUPPORTED_FORMATS, FileRecord  # noqa: F401
    assert "pdf" in SUPPORTED_FORMATS
    assert "docx" in SUPPORTED_FORMATS


# ---------------------------------------------------------------------------
# Adapters
# ---------------------------------------------------------------------------

def test_llm_adapter_imports():
    from backend.adapters.llm_client import ILLMClient, LiteLLMAdapter, StubLLMClient  # noqa: F401


def test_http_adapter_imports():
    from backend.adapters.http_client import (  # noqa: F401
        HttpResponse,
        HttpxAdapter,
        IHttpClient,
        StubHttpClient,
    )
    r = HttpResponse(status_code=200, text='{"ok": true}')
    assert r.ok is True
    assert r.json() == {"ok": True}


def test_document_parser_imports():
    from backend.adapters.document_parsers import (  # noqa: F401
        IParagraphAdapter,
        IPDFAdapter,
        PageContent,
        ParagraphContent,
        PyMuPDFAdapter,
        PythonDocxAdapter,
        StubParagraphAdapter,
        StubPDFAdapter,
    )


# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------

def test_ingestion_service_imports():
    from backend.core.ingestion_service import (  # noqa: F401
        CSVParser,
        DOCXParser,
        IFileParser,
        IngestionService,
        PDFParser,
        PlainTextParser,
        get_parser,
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


def test_chat_service_imports():
    from backend.core.chat_service import ChatService  # noqa: F401


def test_summariser_service_imports():
    from backend.core.summarizer_service import SummariserService  # noqa: F401


def test_search_service_imports():
    from backend.core.search_service import SearchService  # noqa: F401


def test_chat_domain_imports():
    import uuid

    from backend.core.domain.chat import ChatMessage, ChatSession  # noqa: F401
    session = ChatSession(id=str(uuid.uuid4()), title="Test")
    assert session.title == "Test"
    msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=session.id,
        role="user",
        content="Hello",
    )
    assert msg.role == "user"


def test_web_search_adapter_imports():
    from backend.adapters.web_search import (  # noqa: F401
        BraveAdapter,
        DuckDuckGoAdapter,
        IWebSearchAdapter,
        SearchResult,
        SerperAdapter,
        StubWebSearchAdapter,
        get_search_adapter,
    )
    stub = StubWebSearchAdapter()
    assert stub is not None
    ddg = get_search_adapter("duckduckgo")
    assert ddg is not None


def test_chat_repository_imports():
    from backend.storage.repositories.chat_repository import (  # noqa: F401
        IChatRepository,
        SQLiteChatRepository,
    )


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


def test_chat_routes_registered():
    """Verify the chat router exposes session + stream endpoints."""
    from backend.main import create_app
    app = create_app()
    paths = [r.path for r in app.routes]  # type: ignore[attr-defined]
    assert any("/sessions" in p for p in paths), "chat sessions route missing"
    assert any("/stream" in p for p in paths), "chat stream route missing"
    assert any("/export" in p for p in paths), "chat export route missing"


def test_summarizer_routes_registered():
    """Verify the summarizer router is wired up."""
    from backend.main import create_app
    app = create_app()
    paths = [r.path for r in app.routes]  # type: ignore[attr-defined]
    assert any("/summarize" in p for p in paths), "summarize route missing"


def test_search_routes_registered():
    """Verify the search router is wired up."""
    from backend.main import create_app
    app = create_app()
    paths = [r.path for r in app.routes]  # type: ignore[attr-defined]
    assert any("/search" in p for p in paths), "search route missing"


# ---------------------------------------------------------------------------
# Sprint 6 — Learn Mode
# ---------------------------------------------------------------------------

def test_learn_domain_imports():
    """Learn domain entities must import and work correctly."""
    from backend.core.domain.learn import (  # noqa: F401
        VALID_DIFFICULTIES,
        VALID_FORMATS,
        XP_FLASHCARD_DECK,
        XP_QUIZ_CORRECT,
        XP_SESSION_COMPLETE,
        XP_STREAK_BONUS,
        LearnSession,
        UserStats,
        xp_for_next_level,
        xp_to_level,
    )
    assert "quiz" in VALID_FORMATS
    assert "flashcard" in VALID_FORMATS
    assert "mindmap" in VALID_FORMATS
    assert "timeline" in VALID_FORMATS
    assert "story" in VALID_FORMATS
    assert "eli5" in VALID_FORMATS
    assert "speedlearn" in VALID_FORMATS
    assert "brainstorm" in VALID_FORMATS
    assert "beginner" in VALID_DIFFICULTIES
    assert xp_to_level(0) == 1
    assert xp_to_level(100) == 2


def test_learn_service_imports():
    """LearnService must import without errors."""
    from backend.core.learn_service import LearnService  # noqa: F401


def test_learn_repository_imports():
    """Learn repository must import cleanly."""
    from backend.storage.repositories.learn_repository import (  # noqa: F401
        ILearnRepository,
        SQLiteLearnRepository,
    )


def test_encryption_imports():
    """Encryption module must expose FernetEncryptor and NullEncryptor."""
    from backend.core.encryption import (  # noqa: F401
        FernetEncryptor,
        IEncryptor,
        NullEncryptor,
    )
    enc = NullEncryptor()
    assert enc.encrypt("test") == "test"
    assert enc.decrypt("test") == "test"
    assert enc.is_encrypted("test") is False


def test_learn_routes_registered():
    """Verify the learn router is wired up with all endpoints."""
    from backend.main import create_app
    app = create_app()
    paths = [r.path for r in app.routes]  # type: ignore[attr-defined]
    assert "/api/learn/sessions/stream" in paths, "learn stream route missing"
    assert "/api/learn/sessions" in paths, "learn list sessions route missing"
    assert "/api/learn/stats" in paths, "learn stats route missing"
    assert any("/quiz/answer" in p for p in paths), "quiz answer route missing"
    assert any("/flashcard/review" in p for p in paths), "flashcard review route missing"


def test_learn_schemas_imports():
    """Learn schemas must import cleanly and validate."""
    from backend.models.schemas import (  # noqa: F401
        LearnSessionCreate,
        LearnSessionResponse,
        QuizAnswerRequest,
        QuizAnswerResponse,
        UserStatsResponse,
    )
    req = LearnSessionCreate(topic="Black Holes", format="quiz", source_type="topic")
    assert req.difficulty == "intermediate"
    assert req.format == "quiz"
