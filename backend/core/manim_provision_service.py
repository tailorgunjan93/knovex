"""
Manim Provisioning Service

The "Cinematic" animation mode renders true 3Blue1Brown-style videos with Manim,
which (with ffmpeg + cairo/pango) is too large to bundle — so it's provisioned
**on demand** via the shared ``EnvPackProvisionService`` engine.

Packages: ``manim`` (engine) + ``imageio-ffmpeg`` (a bundled ffmpeg binary, so we
don't depend on a system ffmpeg). LaTeX is intentionally NOT installed — generated
scenes are restricted to ``Text``/shapes (no ``Tex``/``MathTex``), keeping the pack
to a few hundred MB instead of multiple GB.

Once ready, ``KNOVEX_MANIM_HOME`` is exported so the render service finds the env's
interpreter and runs the out-of-process render sidecar there.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from backend.core.env_provision import (
    CommandRunner,
    EnvPackProvisionService,
    default_uv_resolver,
)

MANIM_HOME_ENV = "KNOVEX_MANIM_HOME"


class ManimProvisionService(EnvPackProvisionService):
    """On-demand Manim env for the Cinematic animation pack."""

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
            name="Cinematic",
            env_home=env_home,
            packages=packages or ["manim", "imageio-ffmpeg"],
            verify_import="import manim, imageio_ffmpeg",
            home_env_var=MANIM_HOME_ENV,
            uv_resolver=uv_resolver,
            runner=runner,
            python_version=python_version,
        )
