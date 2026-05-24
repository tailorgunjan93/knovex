"""
FastAPI Dependency Injection Wiring

All service instances are constructed here and injected into route
handlers via FastAPI's Depends() mechanism.

DIP compliance: API route handlers depend on SettingsService /
LLMService (abstractions), never on FernetEncryptor / LiteLLM /
SQLite directly.

Benefits:
  - Testing: replace any Depends() with a mock via app.dependency_overrides
  - Swappability: change wiring here without touching any route handler
  - Lifetime control: lru_cache gives per-process singletons for services
    that are stateless or manage their own connection pool

Usage in routes::

    from fastapi import Depends
    from backend.core.dependencies import get_settings_service, get_llm_service

    @router.get("/settings")
    async def get_settings(
        svc: SettingsService = Depends(get_settings_service),
    ) -> AppSettingsResponse:
        return await svc.get_masked()
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


# ---------------------------------------------------------------------------
# Annotated shorthands (reduces boilerplate in route signatures)
# ---------------------------------------------------------------------------

SettingsServiceDep = Annotated[SettingsService, Depends(get_settings_service)]
LLMServiceDep = Annotated[LLMService, Depends(get_llm_service)]
