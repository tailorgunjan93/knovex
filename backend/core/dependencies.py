"""
FastAPI Dependency Injection Wiring

All service instances are constructed here and injected into route
handlers via FastAPI's Depends() mechanism.

DIP compliance: API route handlers depend on service abstractions, never
on FernetEncryptor / LiteLLM / SQLite directly.

Benefits:
  - Testing: replace any Depends() with a mock via app.dependency_overrides
  - Swappability: change wiring here without touching any route handler
  - Lifetime control: lru_cache gives per-process singletons for services
    that are stateless or manage their own connection pool

Sprint 2 additions:
  - get_event_bus()       — singleton EventBus
  - get_sqlite_backend()  — per-request SQLiteBackend (not cached: cheap)
  - get_kb_service()      — KBService with all dependencies wired
  - get_watcher_service() — WatcherService singleton (started in lifespan)

Sprint 3 additions:
  - get_reader_service()  — ReaderService with file rendering + inline Q&A

Sprint 4 additions:
  - get_search_service()     — SearchService (web search facade)
  - get_chat_service()       — ChatService with FTS5 retrieval + SSE streaming
  - get_summariser_service() — SummariserService for file / KB summaries

Sprint 6 additions:
  - get_learn_service()      — LearnService for all 8 learn formats + gamification

Usage in routes::

    from backend.core.dependencies import KBServiceDep, ReaderServiceDep

    @router.get("/kb")
    async def list_kbs(svc: KBServiceDep) -> KBListResponse:
        return await svc.list_kbs()
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from backend.core.config import settings as app_config
from backend.core.encryption import FernetEncryptor, IEncryptor
from backend.core.llm_service import LLMService
from backend.core.settings_service import SettingsService
from backend.core.settings_store import ISettingsStore, JsonSettingsStore

# ---------------------------------------------------------------------------
# Infrastructure providers — produced once per process
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def get_encryptor() -> IEncryptor:
    """
    Provide the Fernet encryptor backed by the app's key file.
    Cached: key file is read once per process.
    """
    return FernetEncryptor(app_config.encryption_key_file)


@lru_cache(maxsize=1)
def get_settings_store() -> ISettingsStore:
    """Provide the JSON settings store backed by the app's config file."""
    return JsonSettingsStore(app_config.config_file)


@lru_cache(maxsize=1)
def get_event_bus():
    """
    Provide the singleton EventBus.

    The module-level ``bus`` singleton from events/bus.py is returned so
    all emitters and subscribers share the same instance.
    """
    from backend.events.bus import bus
    return bus


def get_sqlite_backend():
    """
    Provide a SQLiteBackend for the current request.

    Not cached (not lru_cache): SQLiteBackend is stateless (per-method
    connections) so creating a new instance per request is free.
    """
    from backend.storage.sqlite_backend import SQLiteBackend
    return SQLiteBackend(app_config.db_path)


@lru_cache(maxsize=1)
def get_http_client():
    """
    Provide the HttpxAdapter singleton.

    Cached: the adapter itself is stateless; it creates a fresh httpx client
    per request. Caching avoids re-importing httpx on every call.

    DIP: callers receive IHttpClient (abstraction); swap to StubHttpClient
    in tests via app.dependency_overrides[get_http_client] = lambda: stub.
    """
    from backend.adapters.http_client import HttpxAdapter
    return HttpxAdapter()


# ---------------------------------------------------------------------------
# Service providers
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def get_settings_service() -> SettingsService:
    """
    Provide the application SettingsService singleton.

    Wired with FernetEncryptor + JsonSettingsStore. Override in tests via:
        app.dependency_overrides[get_settings_service] = lambda: SettingsService(
            encryptor=NullEncryptor(),
            store=InMemorySettingsStore({"theme": "dark"}),
        )
    """
    return SettingsService(
        encryptor=get_encryptor(),
        store=get_settings_store(),
    )


@lru_cache(maxsize=1)
def get_llm_service() -> LLMService:
    """
    Provide the LLMService singleton.

    LLMProviderFactory is imported here (triggering provider self-registration
    via backend.core.providers/__init__.py).
    """
    # Import triggers provider self-registration
    from backend.core.providers import LLMProviderFactory  # noqa: F401
    return LLMService()


def get_reader_service(
    backend=Depends(get_sqlite_backend),
):
    """
    Provide ReaderService wired with file repository, SQLite backend, LLMService,
    and SearchService (for optional web search in inline Q&A).

    Not cached: ReaderService is stateless; the expensive singletons
    (LLMService, pdf/para adapters) are cheap to construct (no I/O).

    DIP: ReaderService receives IFileRepository + ILLMClient adapters,
         not concrete implementations.
    """
    from backend.core.reader_service import ReaderService
    from backend.storage.repositories.file_repository import SQLiteFileRepository

    file_repo = SQLiteFileRepository(backend)
    return ReaderService(
        file_repo=file_repo,
        backend=backend,
        llm_svc=get_llm_service(),
        search_svc=get_search_service(),
    )


async def get_embedder():
    """
    Provide the best available IEmbedder based on current settings.

    Returns NullEmbedder when dense search is disabled or misconfigured.
    Async so it can await the settings service read.
    """
    from backend.adapters.embedder import NullEmbedder, build_embedder

    try:
        svc = get_settings_service()
        current = await svc.get()
        emb = current.embedding

        if not emb.enabled:
            return NullEmbedder()

        return build_embedder(
            embedding_api_key=emb.api_key,
            embedding_provider=emb.provider,
            embedding_model=emb.model,
        )
    except Exception as exc:
        logger = __import__("logging").getLogger("knovex.deps")
        logger.warning("get_embedder failed, using NullEmbedder: %s", exc)
        from backend.adapters.embedder import NullEmbedder
        return NullEmbedder()


async def get_kb_service(
    backend=Depends(get_sqlite_backend),
    embedder=Depends(get_embedder),
):
    """
    Provide KBService wired with SQLite repositories + IngestionService + EventBus.

    DIP: KBService receives IKBRepository + IFileRepository (interfaces),
         not the concrete SQLite classes.
    """
    from backend.core.ingestion_service import IngestionService
    from backend.core.kb_service import KBService
    from backend.storage.repositories.file_repository import SQLiteFileRepository
    from backend.storage.repositories.kb_repository import SQLiteKBRepository

    event_bus = get_event_bus()
    kb_repo = SQLiteKBRepository(backend)
    file_repo = SQLiteFileRepository(backend)
    ingestion_svc = IngestionService(
        file_repo=file_repo,
        backend=backend,
        event_bus=event_bus,
        embedder=embedder,
    )
    return KBService(
        kb_repo=kb_repo,
        file_repo=file_repo,
        ingestion_svc=ingestion_svc,
        event_bus=event_bus,
    )


@lru_cache(maxsize=1)
def get_search_service():
    """
    Provide the SearchService singleton.

    No adapter is injected — SearchService resolves the engine adapter at
    call-time from the engine name passed by the caller (from Settings).
    """
    from backend.core.search_service import SearchService
    return SearchService()


async def get_chat_service(
    backend=Depends(get_sqlite_backend),
    embedder=Depends(get_embedder),
):
    """
    Provide ChatService wired with chat repository, file repository,
    SQLiteBackend (for FTS5 + optional dense queries), LLMService, SearchService,
    and IEmbedder (NullEmbedder when dense search is disabled).
    """
    from backend.core.chat_service import ChatService
    from backend.storage.repositories.chat_repository import SQLiteChatRepository
    from backend.storage.repositories.file_repository import SQLiteFileRepository

    return ChatService(
        chat_repo=SQLiteChatRepository(backend),
        file_repo=SQLiteFileRepository(backend),
        backend=backend,
        llm_svc=get_llm_service(),
        search_svc=get_search_service(),
        embedder=embedder,
    )


def get_summariser_service(
    backend=Depends(get_sqlite_backend),
):
    """
    Provide SummariserService wired with file repository + LLMService.
    """
    from backend.core.summarizer_service import SummariserService
    from backend.storage.repositories.file_repository import SQLiteFileRepository

    return SummariserService(
        file_repo=SQLiteFileRepository(backend),
        backend=backend,
        llm_svc=get_llm_service(),
    )


def get_learn_service(
    backend=Depends(get_sqlite_backend),
):
    """
    Provide LearnService wired with learn repository + LLMService.

    Not cached: LearnService is stateless; the expensive singletons
    (LLMService) are cached/shared.

    DIP: LearnService receives ILearnRepository + LLMService (abstractions).
    """
    from backend.core.learn_service import LearnService
    from backend.storage.repositories.learn_repository import SQLiteLearnRepository

    return LearnService(
        learn_repo=SQLiteLearnRepository(backend),
        llm_svc=get_llm_service(),
    )


@lru_cache(maxsize=1)
def get_watcher_service():
    """
    Provide the WatcherService singleton.

    Started and stopped by the FastAPI lifespan context in main.py.
    Uses a fresh SQLiteBackend + the shared EventBus.
    """
    from backend.core.watcher_service import WatcherService
    from backend.storage.repositories.file_repository import SQLiteFileRepository
    from backend.storage.sqlite_backend import SQLiteBackend

    backend = SQLiteBackend(app_config.db_path)
    file_repo = SQLiteFileRepository(backend)
    return WatcherService(
        file_repo=file_repo,
        event_bus=get_event_bus(),
    )


# ---------------------------------------------------------------------------
# Annotated shorthands (reduces boilerplate in route signatures)
# ---------------------------------------------------------------------------

from backend.adapters.http_client import IHttpClient  # noqa: E402
from backend.core.chat_service import ChatService  # noqa: E402
from backend.core.kb_service import KBService  # noqa: E402
from backend.core.learn_service import LearnService  # noqa: E402
from backend.core.reader_service import ReaderService  # noqa: E402
from backend.core.search_service import SearchService  # noqa: E402
from backend.core.summarizer_service import SummariserService  # noqa: E402

SettingsServiceDep   = Annotated[SettingsService,   Depends(get_settings_service)]
LLMServiceDep        = Annotated[LLMService,         Depends(get_llm_service)]
KBServiceDep         = Annotated[KBService,           Depends(get_kb_service)]
ReaderServiceDep     = Annotated[ReaderService,       Depends(get_reader_service)]
ChatServiceDep       = Annotated[ChatService,         Depends(get_chat_service)]
SummariserServiceDep = Annotated[SummariserService,   Depends(get_summariser_service)]
SearchServiceDep     = Annotated[SearchService,       Depends(get_search_service)]
LearnServiceDep      = Annotated[LearnService,        Depends(get_learn_service)]
HttpClientDep        = Annotated[IHttpClient,         Depends(get_http_client)]
