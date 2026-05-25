"""
Knovex Application Configuration

Loads app-level settings from environment variables (KNOVEX_ prefix)
and sensible defaults. Does NOT store user-facing settings (LLM keys,
themes, etc.) — those live in settings_service.py / app_settings SQLite table.

Usage:
    from backend.core.config import settings
    print(settings.db_path)
"""

import logging
from functools import lru_cache
from pathlib import Path

from platformdirs import user_config_dir, user_data_dir, user_log_dir
from pydantic import Field, computed_field
from pydantic_settings import BaseSettings

APP_NAME = "Knovex"
APP_AUTHOR = "Knovex"

logger = logging.getLogger("knovex.config")


class AppConfig(BaseSettings):
    """
    Immutable application configuration.

    All values can be overridden via environment variables
    prefixed with KNOVEX_ (e.g. KNOVEX_LOG_LEVEL=DEBUG).
    """

    # -------------------------------------------------------------------------
    # Identity
    # -------------------------------------------------------------------------
    version: str = "0.7.2"
    app_name: str = APP_NAME
    backend_port: int = 8765

    # -------------------------------------------------------------------------
    # Logging
    # -------------------------------------------------------------------------
    log_level: str = "INFO"

    # -------------------------------------------------------------------------
    # Directories — default to OS-standard locations via platformdirs
    # -------------------------------------------------------------------------
    data_dir: Path = Field(
        default_factory=lambda: Path(user_data_dir(APP_NAME, APP_AUTHOR))
    )
    config_dir: Path = Field(
        default_factory=lambda: Path(user_config_dir(APP_NAME, APP_AUTHOR))
    )
    log_dir: Path = Field(
        default_factory=lambda: Path(user_log_dir(APP_NAME, APP_AUTHOR))
    )

    # -------------------------------------------------------------------------
    # Computed paths (derived from dirs above)
    # -------------------------------------------------------------------------
    @computed_field  # type: ignore[misc]
    @property
    def db_path(self) -> Path:
        """Absolute path to the SQLite database file."""
        return self.data_dir / "knovex.db"

    @computed_field  # type: ignore[misc]
    @property
    def config_file(self) -> Path:
        """Path to the user settings JSON file (stores LLM keys, theme, etc.)."""
        return self.config_dir / "settings.json"

    @computed_field  # type: ignore[misc]
    @property
    def encryption_key_file(self) -> Path:
        """Path to the Fernet symmetric key used to encrypt API keys."""
        return self.config_dir / ".knovex.key"

    @computed_field  # type: ignore[misc]
    @property
    def log_file(self) -> Path:
        """Path to the application log file."""
        return self.log_dir / "knovex.log"

    # -------------------------------------------------------------------------
    # Dev / test helpers
    # -------------------------------------------------------------------------
    debug: bool = False
    testing: bool = False

    model_config = {
        "env_prefix": "KNOVEX_",
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache(maxsize=1)
def _get_settings() -> AppConfig:
    """Return the singleton AppConfig, creating required directories."""
    cfg = AppConfig()

    # Ensure all required directories exist on first access
    for directory in (cfg.data_dir, cfg.config_dir, cfg.log_dir):
        directory.mkdir(parents=True, exist_ok=True)

    return cfg


# Module-level singleton — import this everywhere
settings: AppConfig = _get_settings()
