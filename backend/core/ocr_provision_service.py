"""
OCR Provisioning Service

OCR lives in docnest (docling/torch) — far too large to bundle in the exe, so the
packaged app provisions an OCR environment **on demand** via the shared
``EnvPackProvisionService`` engine (uv venv + pip install + verify import).

Once ready, ``KNOVEX_OCR_HOME`` is exported so ``docnest_adapter`` routes OCR to
that env's interpreter via the out-of-process sidecar.

This module is a thin OCR-specific configuration of the generic engine; the state
machine + uv logic live in ``env_provision``.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from backend.core.env_provision import (
    AsyncSubprocessRunner,  # noqa: F401 — re-exported for tests/back-compat
    CommandRunner,
    EnvPackProvisionService,
    PackState,
    PackStatus,
    default_uv_resolver,
    env_python,  # noqa: F401 — re-exported (used by tests + the adapter)
)

OCR_HOME_ENV = "KNOVEX_OCR_HOME"

# Back-compat aliases (OCR's public names map onto the generic ones).
OcrState = PackState
OcrStatus = PackStatus


class OcrProvisionService(EnvPackProvisionService):
    """On-demand OCR env: docnest-ai (OCR engine/lang + full-page OCR text) +
    EasyOCR (Devanagari/Hindi and other non-Latin scripts)."""

    def __init__(
        self,
        *,
        env_home: Path,
        uv_resolver: Callable[[], str | None] = default_uv_resolver,
        runner: CommandRunner | None = None,
        packages: list[str] | None = None,
        python_version: str = "3.11",
    ) -> None:
        super().__init__(
            name="OCR",
            env_home=env_home,
            packages=packages or ["docnest-ai>=0.7.0", "easyocr"],
            verify_import="import docnest, easyocr",
            home_env_var=OCR_HOME_ENV,
            uv_resolver=uv_resolver,
            runner=runner,
            python_version=python_version,
        )
