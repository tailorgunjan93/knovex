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

Usage in routes::

    from backend.core.dependencies import KBServiceDep

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


def get_kb_service(
    backend=Depends(get_sqlite_backend),
):
    """
    Provide KBService wired with SQLite repositories + IngestionService + EventBus.

    Not cached: KBService itself is stateless; the heavy singletons
    (event bus, backend) are cached/shared.

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
    )
    return KBService(
        kb_repo=kb_repo,
        file_repo=file_repo,
        ingestion_svc=ingestion_svc,
        event_bus=event_bus,
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
from backend.core.kb_service import KBService          # noqa: E402

SettingsServiceDep = Annotated[SettingsService, Depends(get_settings_service)]
LLMServiceDep      = Annotated[LLMService,      Depends(get_llm_service)]
KBServiceDep       = Annotated[KBService,        Depends(get_kb_service)]
HttpClientDep      = Annotated[IHttpClient,      Depends(get_http_client)]
