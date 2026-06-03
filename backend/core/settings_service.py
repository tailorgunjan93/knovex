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
    LLMProviderConfig,
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


# Secret sub-keys encrypted within each per-provider config.
_PROVIDER_SECRET_SUBKEYS = ("api_key", "aws_access_key_id", "aws_secret_access_key")
# Config fields copied between `llm` and a provider entry.
_PROVIDER_FIELDS = (
    "model", "api_key", "base_url", "aws_region", "aws_access_key_id", "aws_secret_access_key",
)


def _provider_configured(provider_id: str, cfg: dict[str, Any]) -> bool:
    """True if a provider has usable credentials (plaintext cfg)."""
    if cfg.get("api_key"):
        return True
    if provider_id == "ollama" and cfg.get("base_url"):
        return True
    if provider_id == "bedrock" and cfg.get("aws_access_key_id") and cfg.get("aws_secret_access_key"):
        return True
    return False


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
        # Per-provider saved configs (multi-provider). The active provider's
        # config is mirrored here from `llm` so keys persist when switching.
        "llm_providers": {},
        "search": {
            "engine": "duckduckgo",
            "api_key": "",
        },
        "embedding": {
            "enabled": False,
            "provider": "local",
            "model": "text-embedding-3-small",
            "api_key": "",
        },
        "theme": "dark",
        "kb_storage_path": str(app_config.data_dir),
        "backend_port": app_config.backend_port,
        "display_name": "",
        "onboarded": False,
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
    # Multi-provider operations
    # ------------------------------------------------------------------

    async def set_provider(self, provider_id: str, patch: dict[str, Any]) -> AppSettingsResponse:
        """
        Save one provider's config (model / key / base_url / aws_*). Only the
        provided (non-None) fields change. If it's the active provider, the
        change is mirrored into ``llm`` too.
        """
        raw = self._load()
        providers = raw.setdefault("llm_providers", {})
        cfg = dict(providers.get(provider_id, {}))
        for key, value in patch.items():
            if value is not None:
                cfg[key] = value
        providers[provider_id] = cfg

        if raw.get("llm", {}).get("provider") == provider_id:
            llm = raw.setdefault("llm", {})
            for key, value in patch.items():
                if value is not None:
                    llm[key] = value

        self._save(raw)
        logger.info("Saved provider config: %s", provider_id)
        return self._to_model(self._load(), masked=True)

    async def activate_provider(self, provider_id: str) -> AppSettingsResponse:
        """
        Make *provider_id* the active provider — copies its saved config into
        ``llm`` so chat / reader / learn use it immediately.
        """
        raw = self._load()
        cfg = (raw.get("llm_providers") or {}).get(provider_id, {})
        llm = raw.setdefault("llm", {})
        llm["provider"] = provider_id
        for field in _PROVIDER_FIELDS:
            if field in cfg:
                llm[field] = cfg[field]
        self._save(raw)
        logger.info("Activated provider: %s", provider_id)
        return self._to_model(self._load(), masked=True)

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

        # Decrypt per-provider secrets (llm_providers.<id>.<secret>)
        for cfg in (raw.get("llm_providers") or {}).values():
            if not isinstance(cfg, dict):
                continue
            for sub in _PROVIDER_SECRET_SUBKEYS:
                value = cfg.get(sub, "")
                if self._encryptor.is_encrypted(value):
                    cfg[sub] = self._encryptor.decrypt(value)

        self._cache = raw
        return raw

    def _save(self, raw: dict[str, Any]) -> None:
        """Encrypt sensitive fields and delegate persistence to the store."""
        to_write = copy.deepcopy(raw)

        # Mirror the active provider's config into the per-provider store so its
        # key persists when the user switches providers (llm is the source of truth).
        llm = to_write.get("llm", {})
        active = llm.get("provider")
        if active:
            providers = to_write.setdefault("llm_providers", {})
            providers[active] = {f: llm.get(f, "") for f in _PROVIDER_FIELDS}

        for field_path in SENSITIVE_FIELDS:
            top, _, sub = field_path.partition(".")
            plaintext = to_write.get(top, {}).get(sub, "")
            if plaintext and not self._encryptor.is_encrypted(plaintext):
                to_write[top][sub] = self._encryptor.encrypt(plaintext)

        # Encrypt per-provider secrets.
        for cfg in (to_write.get("llm_providers") or {}).values():
            if not isinstance(cfg, dict):
                continue
            for sub in _PROVIDER_SECRET_SUBKEYS:
                plaintext = cfg.get(sub, "")
                if plaintext and not self._encryptor.is_encrypted(plaintext):
                    cfg[sub] = self._encryptor.encrypt(plaintext)

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

        # ── Per-provider grid configs ────────────────────────────────────────
        # Start from the stored providers, then force the active provider to
        # mirror `llm` (so it always appears configured even on legacy data).
        providers_src: dict[str, dict[str, Any]] = dict(raw.get("llm_providers") or {})
        active = llm_raw.get("provider")
        if active:
            providers_src[active] = {f: llm_raw.get(f, "") for f in _PROVIDER_FIELDS}

        providers_out: dict[str, LLMProviderConfig] = {}
        for pid, cfg in providers_src.items():
            if not isinstance(cfg, dict):
                continue
            configured = _provider_configured(pid, cfg)  # plaintext check, pre-mask
            fields = {k: v for k, v in cfg.items() if k in LLMProviderConfig.model_fields}
            if masked:
                for sub in _PROVIDER_SECRET_SUBKEYS:
                    if sub in fields:
                        fields[sub] = _mask(fields.get(sub, ""))
            fields["configured"] = configured
            providers_out[pid] = LLMProviderConfig(**fields)

        return AppSettingsResponse(
            llm=LLMSettings(**llm_display),
            llm_providers=providers_out,
            search=SearchSettings(**search_display),
            embedding=EmbeddingSettings(**embedding_display),
            theme=raw.get("theme", "dark"),
            kb_storage_path=raw.get("kb_storage_path", ""),
            backend_port=raw.get("backend_port", 8765),
            display_name=raw.get("display_name", ""),
            onboarded=raw.get("onboarded", False),
        )
