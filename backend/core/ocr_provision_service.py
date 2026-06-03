"""
OCR Provisioning Service

OCR lives in docnest, which (with its docling/torch dependency) is far too
large to bundle in the PyInstaller exe — so the packaged app ships *without* it
and provisions an OCR environment **on demand**, into the user's app-data dir.

This service bootstraps that environment using ``uv`` (a single self-contained
binary that downloads its own Python and installs packages fast):

    uv venv <data_dir>/ocr --python 3.11
    uv pip install --python <env-python> docnest-ai
    <env-python> -c "import docnest"        # verify

Once ready, ``KNOVEX_OCR_HOME`` is exported so ``docnest_adapter`` routes OCR to
that env's interpreter via the out-of-process sidecar. The work is long-running
(multi-GB download) so it runs as a background task; the UI polls ``status()``.

Design:
  * SRP — only provisions/locates the OCR env; parsing/OCR is the sidecar's job.
  * DIP — the ``uv`` locator and the command runner are injected, so tests drive
    the full state machine without downloading anything.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Awaitable, Callable, Protocol

logger = logging.getLogger("knovex.ocr")

OCR_HOME_ENV = "KNOVEX_OCR_HOME"
UV_PATH_ENV = "KNOVEX_UV_PATH"
_LOG_TAIL = 60


class OcrState(str, Enum):
    NOT_INSTALLED = "not_installed"
    INSTALLING = "installing"
    READY = "ready"
    ERROR = "error"
    UNAVAILABLE = "unavailable"   # no uv available to provision with


@dataclass
class OcrStatus:
    state: OcrState
    detail: str = ""
    python_path: str | None = None
    log_tail: list[str] = field(default_factory=list)


# Streams a command's output line-by-line; returns the process exit code.
LineSink = Callable[[str], None]


class CommandRunner(Protocol):
    async def run(self, cmd: list[str], on_line: LineSink) -> int: ...


class AsyncSubprocessRunner:
    """Default runner: streams a subprocess's combined output as it arrives."""

    async def run(self, cmd: list[str], on_line: LineSink) -> int:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        assert proc.stdout is not None
        async for raw in proc.stdout:
            line = raw.decode("utf-8", errors="replace").rstrip()
            if line:
                on_line(line)
        return await proc.wait()


def default_uv_resolver() -> str | None:
    """Locate the ``uv`` binary: explicit env var (set by desktop from the
    bundled binary) first, then PATH (dev)."""
    explicit = os.environ.get(UV_PATH_ENV)
    if explicit and Path(explicit).exists():
        return explicit
    return shutil.which("uv")


def env_python(home: Path) -> Path:
    """Path to the provisioned env's interpreter for this platform."""
    return home / "Scripts" / "python.exe" if os.name == "nt" else home / "bin" / "python"


class OcrProvisionService:
    def __init__(
        self,
        *,
        env_home: Path,
        uv_resolver: Callable[[], str | None] = default_uv_resolver,
        runner: CommandRunner | None = None,
        package: str = "docnest-ai",
        python_version: str = "3.11",
    ) -> None:
        self._home = Path(env_home)
        self._uv_resolver = uv_resolver
        self._runner = runner or AsyncSubprocessRunner()
        self._package = package
        self._python_version = python_version

        self._state = OcrState.NOT_INSTALLED
        self._detail = ""
        self._log: deque[str] = deque(maxlen=_LOG_TAIL)
        self._lock = asyncio.Lock()
        self._task: asyncio.Task | None = None

        # Adopt an env that a previous run already provisioned.
        if self._env_ready():
            self._state = OcrState.READY
            self._export_home()

    # ── Public API ────────────────────────────────────────────────────────────

    def status(self) -> OcrStatus:
        py = env_python(self._home)
        return OcrStatus(
            state=self._state,
            detail=self._detail,
            python_path=str(py) if py.exists() else None,
            log_tail=list(self._log),
        )

    def start_install(self) -> OcrStatus:
        """Kick off provisioning in the background (idempotent while running)."""
        if self._state == OcrState.INSTALLING:
            return self.status()
        if self._env_ready():
            self._state = OcrState.READY
            self._export_home()
            return self.status()
        self._task = asyncio.create_task(self.install())
        return self.status()

    async def install(self) -> OcrStatus:
        """Provision the OCR env. Safe to await directly (used by tests)."""
        async with self._lock:
            uv = self._uv_resolver()
            if not uv:
                return self._fail(
                    OcrState.UNAVAILABLE,
                    "No 'uv' binary available to install the OCR pack.",
                )

            self._state = OcrState.INSTALLING
            self._detail = "Creating OCR environment…"
            self._log.clear()
            py = env_python(self._home)

            steps: list[tuple[str, list[str]]] = [
                ("Creating OCR environment…",
                 [uv, "venv", str(self._home), "--python", self._python_version]),
                (f"Downloading and installing {self._package} (this can take a while)…",
                 [uv, "pip", "install", "--python", str(py), self._package]),
                ("Verifying OCR engine…",
                 [str(py), "-c", "import docnest"]),
            ]

            for detail, cmd in steps:
                self._detail = detail
                self._log.append(f"$ {' '.join(cmd)}")
                try:
                    rc = await self._runner.run(cmd, self._log.append)
                except Exception as exc:  # noqa: BLE001
                    return self._fail(OcrState.ERROR, f"{detail.rstrip('…')} failed: {exc}")
                if rc != 0:
                    return self._fail(OcrState.ERROR, f"{detail.rstrip('…')} failed (exit {rc}).")

            if not self._env_ready():
                return self._fail(OcrState.ERROR, "Install finished but OCR engine is not importable.")

            self._state = OcrState.READY
            self._detail = "OCR pack installed."
            self._export_home()
            logger.info("OCR pack provisioned at %s", self._home)
            return self.status()

    def uninstall(self) -> OcrStatus:
        """Remove the OCR env and clear its env var."""
        shutil.rmtree(self._home, ignore_errors=True)
        os.environ.pop(OCR_HOME_ENV, None)
        self._state = OcrState.NOT_INSTALLED
        self._detail = "OCR pack removed."
        self._log.clear()
        return self.status()

    # ── Internals ──────────────────────────────────────────────────────────────

    def _env_ready(self) -> bool:
        return env_python(self._home).exists()

    def _export_home(self) -> None:
        os.environ[OCR_HOME_ENV] = str(self._home)

    def _fail(self, state: OcrState, detail: str) -> OcrStatus:
        self._state = state
        self._detail = detail
        logger.warning("OCR provisioning: %s — %s", state.value, detail)
        return self.status()
