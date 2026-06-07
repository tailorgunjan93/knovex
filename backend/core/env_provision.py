"""
On-demand environment provisioning — shared engine.

Some capabilities are too large to bundle in the PyInstaller exe (OCR via
docnest/torch; Manim via ffmpeg/cairo). Instead the packaged app provisions a
dedicated Python environment **on demand**, into the user's app-data dir, using
``uv`` (a single self-contained binary that fetches its own Python + installs
packages fast):

    uv venv <home> --python <ver>
    uv pip install --python <env-python> <packages...>
    <env-python> -c "<verify import>"

``EnvPackProvisionService`` holds the state machine (idempotent install as a
background task, uninstall, status with a log tail) and is reused by both the OCR
and Manim packs — they differ only in name, packages, verify-import, and the
env-var exported once ready.

Design:
  * SRP — only provisions/locates an env; the capability's work lives elsewhere.
  * DIP — the ``uv`` locator and command runner are injected, so tests drive the
    full state machine without downloading anything.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Protocol

logger = logging.getLogger("knovex.provision")

UV_PATH_ENV = "KNOVEX_UV_PATH"
_LOG_TAIL = 60


class PackState(StrEnum):
    NOT_INSTALLED = "not_installed"
    INSTALLING = "installing"
    READY = "ready"
    ERROR = "error"
    UNAVAILABLE = "unavailable"   # no uv available to provision with


@dataclass
class PackStatus:
    state: PackState
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


class EnvPackProvisionService:
    """Generic on-demand uv env provisioner. Configure per capability."""

    def __init__(
        self,
        *,
        name: str,                       # human label, e.g. "OCR" / "Cinematic"
        env_home: Path,
        packages: list[str],
        verify_import: str,              # e.g. "import docnest, easyocr"
        home_env_var: str | None = None,  # exported on ready (so adapters find the env)
        uv_resolver: Callable[[], str | None] = default_uv_resolver,
        runner: CommandRunner | None = None,
        python_version: str = "3.11",
    ) -> None:
        self._name = name
        self._home = Path(env_home)
        self._packages = packages
        self._verify_import = verify_import
        self._home_env_var = home_env_var
        self._uv_resolver = uv_resolver
        self._runner = runner or AsyncSubprocessRunner()
        self._python_version = python_version

        self._state = PackState.NOT_INSTALLED
        self._detail = ""
        self._log: deque[str] = deque(maxlen=_LOG_TAIL)
        self._lock = asyncio.Lock()
        self._task: asyncio.Task | None = None

        # Adopt an env that a previous run already provisioned.
        if self._env_ready():
            self._state = PackState.READY
            self._export_home()

    # ── Public API ────────────────────────────────────────────────────────────

    @property
    def home(self) -> Path:
        return self._home

    def interpreter(self) -> Path:
        """Path to the provisioned env's Python interpreter."""
        return env_python(self._home)

    def is_ready(self) -> bool:
        return self._env_ready()

    def status(self) -> PackStatus:
        py = env_python(self._home)
        return PackStatus(
            state=self._state,
            detail=self._detail,
            python_path=str(py) if py.exists() else None,
            log_tail=list(self._log),
        )

    def start_install(self) -> PackStatus:
        """Kick off provisioning in the background (idempotent while running)."""
        if self._state == PackState.INSTALLING:
            return self.status()
        if self._env_ready():
            self._state = PackState.READY
            self._export_home()
            return self.status()
        self._task = asyncio.create_task(self.install())
        return self.status()

    async def install(self) -> PackStatus:
        """Provision the env. Safe to await directly (used by tests)."""
        async with self._lock:
            uv = self._uv_resolver()
            if not uv:
                return self._fail(
                    PackState.UNAVAILABLE,
                    f"No 'uv' binary available to install the {self._name} pack.",
                )

            self._state = PackState.INSTALLING
            self._detail = f"Creating {self._name} environment…"
            self._log.clear()
            py = env_python(self._home)

            steps: list[tuple[str, list[str]]] = [
                (f"Creating {self._name} environment…",
                 [uv, "venv", str(self._home), "--python", self._python_version]),
                (f"Downloading and installing the {self._name} engine (this can take a while)…",
                 [uv, "pip", "install", "--python", str(py), *self._packages]),
                (f"Verifying {self._name} engine…",
                 [str(py), "-c", self._verify_import]),
            ]

            for detail, cmd in steps:
                self._detail = detail
                self._log.append(f"$ {' '.join(cmd)}")
                try:
                    rc = await self._runner.run(cmd, self._log.append)
                except Exception as exc:  # noqa: BLE001
                    return self._fail(PackState.ERROR, f"{detail.rstrip('…')} failed: {exc}")
                if rc != 0:
                    return self._fail(PackState.ERROR, f"{detail.rstrip('…')} failed (exit {rc}).")

            if not self._env_ready():
                return self._fail(PackState.ERROR, f"Install finished but the {self._name} engine is not importable.")

            self._state = PackState.READY
            self._detail = f"{self._name} pack installed."
            self._export_home()
            logger.info("%s pack provisioned at %s", self._name, self._home)
            return self.status()

    def uninstall(self) -> PackStatus:
        """Remove the env and clear its env var."""
        shutil.rmtree(self._home, ignore_errors=True)
        if self._home_env_var:
            os.environ.pop(self._home_env_var, None)
        self._state = PackState.NOT_INSTALLED
        self._detail = f"{self._name} pack removed."
        self._log.clear()
        return self.status()

    # ── Internals ──────────────────────────────────────────────────────────────

    def _env_ready(self) -> bool:
        return env_python(self._home).exists()

    def _export_home(self) -> None:
        if self._home_env_var:
            os.environ[self._home_env_var] = str(self._home)

    def _fail(self, state: PackState, detail: str) -> PackStatus:
        self._state = state
        self._detail = detail
        logger.warning("%s provisioning: %s — %s", self._name, state.value, detail)
        return self.status()
