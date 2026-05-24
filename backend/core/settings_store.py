"""
Settings Store Abstractions

SRP: separates the persistence concern from SettingsService.
OCP: swap JSON file for SQLite, cloud KV store, or Registry
     by implementing ISettingsStore. SettingsService never changes.

Concrete implementations:
  - JsonSettingsStore  — JSON file in the user's config directory (Phase 1)
  - InMemorySettingsStore — for unit testing
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

logger = logging.getLogger("knovex.settings_store")


# ---------------------------------------------------------------------------
# Interface
# ---------------------------------------------------------------------------

class ISettingsStore(ABC):
    """
    Narrow persistence interface for app settings.
    Only responsible for raw dict I/O — no encryption, no validation.
    """

    @abstractmethod
    def load(self) -> dict[str, Any]:
        """
        Load and return the raw settings dict.
        Returns an empty dict if nothing is stored yet.
        """
        ...

    @abstractmethod
    def save(self, data: dict[str, Any]) -> None:
        """Persist *data*, overwriting any previously saved settings."""
        ...

    @abstractmethod
    def exists(self) -> bool:
        """Return True if a settings record has been persisted."""
        ...


# ---------------------------------------------------------------------------
# JSON file store
# ---------------------------------------------------------------------------

class JsonSettingsStore(ISettingsStore):
    """
    Persists settings as indented JSON in a file.

    The file is written atomically (write to .tmp, rename) on platforms
    that support it, so a crash mid-write does not corrupt the settings.
    """

    def __init__(self, file_path: Path) -> None:
        self._path = file_path

    def load(self) -> dict[str, Any]:
        if not self._path.exists():
            return {}
        try:
            return json.loads(self._path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.error("Failed to load settings from %s: %s", self._path, exc)
            return {}

    def save(self, data: dict[str, Any]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self._path.with_suffix(".tmp")
        try:
            tmp_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            tmp_path.replace(self._path)  # atomic rename on most platforms
        except OSError as exc:
            logger.error("Failed to save settings to %s: %s", self._path, exc)
            raise
        logger.debug("Settings saved to %s", self._path)

    def exists(self) -> bool:
        return self._path.exists()


# ---------------------------------------------------------------------------
# In-memory store — for unit tests
# ---------------------------------------------------------------------------

class InMemorySettingsStore(ISettingsStore):
    """
    Volatile in-memory settings store.

    State is lost when the process exits. Use this in unit tests to avoid
    touching the filesystem and to ensure test isolation.
    """

    def __init__(self, initial: dict[str, Any] | None = None) -> None:
        self._data: dict[str, Any] = dict(initial or {})

    def load(self) -> dict[str, Any]:
        import copy
        return copy.deepcopy(self._data)

    def save(self, data: dict[str, Any]) -> None:
        import copy
        self._data = copy.deepcopy(data)

    def exists(self) -> bool:
        return bool(self._data)
