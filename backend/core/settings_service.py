"""
Settings Service

Manages user-facing application settings (LLM provider, API keys, theme, etc.).
Settings are persisted as JSON in the user's config directory.
API keys are encrypted at rest using Fernet symmetric encryption.

The Fernet key is generated once and stored in a separate `.knovex.key` file.
All other settings are plain JSON so the file is human-readable/debuggable
except for the encrypted key values.

Usage::

    from backend.core.settings_service import settings_service

    current = await settings_service.get()
    await settings_service.update({"theme": "light"})
    masked = settings_service.mask(current)
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from backend.core.config import settings
from backend.models.schemas import (
    AppSettingsResponse,
    LLMSettings,
    SearchSettings,
)

logger = logging.getLogger("knovex.settings")

# Fields that contain sensitive data and must be encrypted on disk
SENSITIVE_FIELDS = {
    "llm.api_key",
    "llm.aws_access_key_id",
    "llm.aws_secret_access_key",
    "search.api_key",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_or_create_fernet_key(key_path: Path) -> Fernet:
    """Load the Fernet key from disk, creating it on first run."""
    if key_path.exists():
        raw = key_path.read_bytes().strip()
        return Fernet(raw)

    # First run — generate and save
    key = Fernet.generate_key()
    key_path.write_bytes(key)
    # Restrict permissions on Unix (ignored on Windows)
    try:
        os.chmod(key_path, 0o600)
    except OSError:
        pass
    logger.info("Generated new Fernet encryption key at %s", key_path)
    return Fernet(key)


def _encrypt(fernet: Fernet, value: str) -> str:
    """Encrypt a string value; returns a base64-encoded token string."""
    return fernet.encrypt(value.encode()).decode()


def _decrypt(fernet: Fernet, token: str) -> str:
    """Decrypt a Fernet token string; returns plaintext. Returns '' on failure."""
    try:
        return fernet.decrypt(token.encode()).decode()
    except (InvalidToken, Exception) as exc:
        logger.warning("Failed to decrypt value: %s", exc)
        return ""


def _mask_key(key: str) -> str:
    """Return a masked version of an API key for display (sk-...****)."""
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return key[:4] + "..." + "****"


# ---------------------------------------------------------------------------
# Default settings
# ---------------------------------------------------------------------------

def _default_settings() -> dict[str, Any]:
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
        "theme": "dark",
        "kb_storage_path": str(settings.data_dir),
        "backend_port": settings.backend_port,
    }


# ---------------------------------------------------------------------------
# SettingsService
# ---------------------------------------------------------------------------

class SettingsService:
    """
    Singleton service for reading and writing user app settings.

    - Settings are stored as JSON in ``settings.config_file``.
    - Sensitive fields (API keys) are Fernet-encrypted before writing.
    - Public ``get()`` returns plaintext (for internal use by LLM service).
    - Public ``get_masked()`` returns display-safe version for the API.
    """

    def __init__(self) -> None:
        self._fernet: Fernet = _load_or_create_fernet_key(settings.encryption_key_file)
        self._cache: dict[str, Any] | None = None

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get(self) -> AppSettingsResponse:
        """Return current settings with plaintext API keys (internal use)."""
        raw = self._load_raw()
        return self._raw_to_model(raw, masked=False)

    async def get_masked(self) -> AppSettingsResponse:
        """Return current settings with API keys masked (for API responses)."""
        raw = self._load_raw()
        return self._raw_to_model(raw, masked=True)

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    async def update(self, patch: dict[str, Any]) -> AppSettingsResponse:
        """
        Merge *patch* into current settings and persist.

        *patch* should match the AppSettingsUpdate shape — top-level keys
        are ``llm``, ``search``, ``theme``, ``kb_storage_path``.
        Nested dicts are merged (not replaced), so you can update a single
        LLM field without sending the full object.
        """
        raw = self._load_raw()

        for key, value in patch.items():
            if isinstance(value, dict) and isinstance(raw.get(key), dict):
                raw[key].update(value)
            elif value is not None:
                raw[key] = value

        self._save_raw(raw)
        self._cache = raw
        return self._raw_to_model(raw, masked=True)

    async def reset(self) -> AppSettingsResponse:
        """Reset all settings to factory defaults."""
        raw = _default_settings()
        self._save_raw(raw)
        self._cache = raw
        logger.info("Settings reset to defaults")
        return self._raw_to_model(raw, masked=True)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_raw(self) -> dict[str, Any]:
        """Load raw settings from disk, decrypting sensitive fields."""
        if self._cache is not None:
            return self._cache

        config_file = settings.config_file
        if not config_file.exists():
            raw = _default_settings()
            self._save_raw(raw)
            self._cache = raw
            return raw

        try:
            raw = json.loads(config_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.error("Failed to load settings file: %s — using defaults", exc)
            raw = _default_settings()

        # Merge defaults for any missing keys (graceful forward-compat)
        defaults = _default_settings()
        for top_key, default_val in defaults.items():
            if top_key not in raw:
                raw[top_key] = default_val
            elif isinstance(default_val, dict):
                for sub_key, sub_default in default_val.items():
                    raw[top_key].setdefault(sub_key, sub_default)

        # Decrypt sensitive fields
        for field_path in SENSITIVE_FIELDS:
            top, _, sub = field_path.partition(".")
            encrypted_val = raw.get(top, {}).get(sub, "")
            if encrypted_val.startswith("gAAAAA"):  # Fernet token prefix
                raw[top][sub] = _decrypt(self._fernet, encrypted_val)

        self._cache = raw
        return raw

    def _save_raw(self, raw: dict[str, Any]) -> None:
        """Encrypt sensitive fields and write settings JSON to disk."""
        import copy
        to_write = copy.deepcopy(raw)

        for field_path in SENSITIVE_FIELDS:
            top, _, sub = field_path.partition(".")
            plaintext = to_write.get(top, {}).get(sub, "")
            if plaintext:
                to_write[top][sub] = _encrypt(self._fernet, plaintext)

        settings.config_file.parent.mkdir(parents=True, exist_ok=True)
        settings.config_file.write_text(
            json.dumps(to_write, indent=2), encoding="utf-8"
        )
        logger.debug("Settings saved to %s", settings.config_file)
        # Invalidate cache
        self._cache = None

    def _raw_to_model(
        self, raw: dict[str, Any], masked: bool
    ) -> AppSettingsResponse:
        """Convert raw dict to AppSettingsResponse Pydantic model."""
        llm_raw = raw.get("llm", {})
        search_raw = raw.get("search", {})

        if masked:
            llm_display = {
                **llm_raw,
                "api_key": _mask_key(llm_raw.get("api_key", "")),
                "aws_access_key_id": _mask_key(llm_raw.get("aws_access_key_id", "")),
                "aws_secret_access_key": _mask_key(
                    llm_raw.get("aws_secret_access_key", "")
                ),
            }
            search_display = {
                **search_raw,
                "api_key": _mask_key(search_raw.get("api_key", "")),
            }
        else:
            llm_display = llm_raw
            search_display = search_raw

        return AppSettingsResponse(
            llm=LLMSettings(**llm_display),
            search=SearchSettings(**search_display),
            theme=raw.get("theme", "dark"),
            kb_storage_path=raw.get("kb_storage_path", str(settings.data_dir)),
            backend_port=raw.get("backend_port", settings.backend_port),
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------
settings_service = SettingsService()
