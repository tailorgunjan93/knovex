"""
Settings Service

Single responsibility: orchestrate settings read/write.
  - Merging with defaults
  - Encrypting / decrypting sensitive fields before/after persistence
  - Converting raw dicts to typed Pydantic models

All other concerns are delegated:
  - File I/O → ISettingsStore (injected)
  - Encryption → IEncryptor (injected)

DIP: depends on abstractions (IEncryptor, ISettingsStore), not concretions.
This lets tests inject NullEncryptor + InMemorySettingsStore to run without
any filesystem access or cryptographic overhead.

Usage::

    # Production wiring (see core/dependencies.py)
    service = SettingsService(
        encryptor=FernetEncryptor(key_file),
        store=JsonSettingsStore(config_file),
    )

    # Testing wiring
    service = SettingsService(
        encryptor=NullEncryptor(),
        store=InMemorySettingsStore(),
    )
"""

from __future__ import annotations

import copy
import logging
from typing import Any

from backend.core.encryption import IEncryptor
from backend.core.settings_store import ISettingsStore
from backend.models.schemas import (
    AppSettingsResponse,
    EmbeddingSettings,
    LLMSettings,
    SearchSettings,
)

logger = logging.getLogger("knovex.settings")

# Fields whose values must be encrypted at rest.
# Key format: "<top_level_key>.<sub_key>"
# OCP: add new sensitive fields here only — no other code changes needed.
SENSITIVE_FIELDS: frozenset[str] = frozenset({
    "llm.api_key",
    "llm.aws_access_key_id",
    "llm.aws_secret_access_key",
    "search.api_key",
    "embedding.api_key",
})


def _mask(value: str) -> str:
    """Return a display-safe masked version of a secret value."""
    if not value:
        return ""
    return value[:4] + "..." + "****" if len(value) > 8 else "****"


def _default_settings() -> dict[str, Any]:
    """Factory function for default settings dict. Avoids mutable class-level state."""
    from backend.core.config import settings as app_config
    return {
        "llm": {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "api_key": "",
            "base_url": "",
            "aws_region": "us-east-1",
            "aws_access_key_id": "",
            "aws_secret_access_key": "",
        },
        "search": {
            "engine": "duckduckgo",
            "api_key": "",
        },
        "embedding": {
            "provider": "local",
            "model": "text-embedding-3-small",
            "api_key": "",
        },
        "theme": "dark",
        "kb_storage_path": str(app_config.data_dir),
        "backend_port": app_config.backend_port,
    }


class SettingsService:
    """
    Application settings service.

    Injected with an encryptor and a store. Responsible only for:
      1. Merging loaded data with defaults (forward-compatibility)
      2. Decrypt on load / encrypt on save
      3. Converting to Pydantic models for consumers

    Thread-safety: uses a simple in-process cache invalidated on every write.
    Async-safe: no blocking I/O (file ops are sync but fast for small JSON).
    """

    def __init__(self, *, encryptor: IEncryptor, store: ISettingsStore) -> None:
        self._encryptor = encryptor
        self._store = store
        self._cache: dict[str, Any] | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get(self) -> AppSettingsResponse:
        """Return current settings with plaintext API keys (internal/service use)."""
        raw = self._load()
        return self._to_model(raw, masked=False)

    async def get_masked(self) -> AppSettingsResponse:
        """Return current settings with all API keys masked (for API responses)."""
        raw = self._load()
        return self._to_model(raw, masked=True)

    async def update(self, patch: dict[str, Any]) -> AppSettingsResponse:
        """
        Deep-merge *patch* into current settings and persist.

        Nested dicts are merged (not replaced), so you can update a single
        LLM field without resending the entire LLM object.
        """
        raw = self._load()

        for key, value in patch.items():
            if isinstance(value, dict) and isinstance(raw.get(key), dict):
                raw[key] = {**raw[key], **value}
            elif value is not None:
                raw[key] = value

        self._save(raw)
        return self._to_model(raw, masked=True)

    async def reset(self) -> AppSettingsResponse:
        """Reset all settings to factory defaults."""
        raw = _default_settings()
        self._save(raw)
        logger.info("Settings reset to defaults")
        return self._to_model(raw, masked=True)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load(self) -> dict[str, Any]:
        """Load, decrypt, and merge-with-defaults. Uses in-process cache."""
        if self._cache is not None:
            return self._cache

        raw = self._store.load()
        if not raw:
            raw = _default_settings()
            self._save(raw)
            self._cache = raw
            return raw

        # Forward-compatibility: fill in any keys added in newer versions
        raw = self._merge_defaults(raw)

        # Decrypt sensitive fields
        for field_path in SENSITIVE_FIELDS:
            top, _, sub = field_path.partition(".")
            value = raw.get(top, {}).get(sub, "")
            if self._encryptor.is_encrypted(value):
                raw[top][sub] = self._encryptor.decrypt(value)

        self._cache = raw
        return raw

    def _save(self, raw: dict[str, Any]) -> None:
        """Encrypt sensitive fields and delegate persistence to the store."""
        to_write = copy.deepcopy(raw)

        for field_path in SENSITIVE_FIELDS:
            top, _, sub = field_path.partition(".")
            plaintext = to_write.get(top, {}).get(sub, "")
            if plaintext and not self._encryptor.is_encrypted(plaintext):
                to_write[top][sub] = self._encryptor.encrypt(plaintext)

        self._store.save(to_write)
        self._cache = None  # invalidate cache

    @staticmethod
    def _merge_defaults(raw: dict[str, Any]) -> dict[str, Any]:
        """
        Merge factory defaults into *raw* for any missing top-level or
        nested keys. Ensures forward-compatibility when new settings are added.
        """
        defaults = _default_settings()
        result = copy.deepcopy(raw)

        for top_key, default_val in defaults.items():
            if top_key not in result:
                result[top_key] = copy.deepcopy(default_val)
            elif isinstance(default_val, dict):
                for sub_key, sub_default in default_val.items():
                    result[top_key].setdefault(sub_key, sub_default)

        return result

    @staticmethod
    def _to_model(raw: dict[str, Any], *, masked: bool) -> AppSettingsResponse:
        """Convert raw dict to typed AppSettingsResponse."""
        llm_raw = raw.get("llm", {})
        search_raw = raw.get("search", {})
        embedding_raw = raw.get("embedding", {})

        if masked:
            llm_display = {
                **llm_raw,
                "api_key": _mask(llm_raw.get("api_key", "")),
                "aws_access_key_id": _mask(llm_raw.get("aws_access_key_id", "")),
                "aws_secret_access_key": _mask(llm_raw.get("aws_secret_access_key", "")),
            }
            search_display = {**search_raw, "api_key": _mask(search_raw.get("api_key", ""))}
            embedding_display = {**embedding_raw, "api_key": _mask(embedding_raw.get("api_key", ""))}
        else:
            llm_display = llm_raw
            search_display = search_raw
            embedding_display = embedding_raw

        return AppSettingsResponse(
            llm=LLMSettings(**llm_display),
            search=SearchSettings(**search_display),
            embedding=EmbeddingSettings(**embedding_display),
            theme=raw.get("theme", "dark"),
            kb_storage_path=raw.get("kb_storage_path", ""),
            backend_port=raw.get("backend_port", 8765),
        )
