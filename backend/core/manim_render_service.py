"""
Manim Render Service — the "Cinematic" animation pipeline.

Flow: LLM writes a Manim ``Scene`` for the topic → render it to MP4 in the
on-demand Manim env (out-of-process sidecar) → if the render fails, feed the
error back to the LLM to fix the code and retry (LLM-written Manim is fragile,
so the repair loop is essential).

Design:
  * SRP — only orchestrates generate→render→repair; provisioning + the actual
    render live elsewhere (ManimProvisionService, manim_sidecar).
  * DIP — the LLM service and the sidecar runner are injected, so the loop is
    unit-testable without Manim installed or any real render.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import re
import tempfile
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

from backend.core.env_provision import EnvPackProvisionService
from backend.core.llm_service import LLMService
from backend.core.providers.base import ProviderCredentials

logger = logging.getLogger("knovex.cinematic")

# (returncode, stdout) from running the sidecar under the manim env's python.
SidecarRunner = Callable[[str, str, str], Awaitable[tuple[int, str]]]

_SIDECAR = str(Path(__file__).with_name("manim_sidecar.py"))

_SYSTEM_PROMPT = (
    "You are a motion-graphics animator using Manim Community Edition. Write Python "
    "code for a single scene that visually explains '{topic}' for a {difficulty} learner.\n"
    "STRICT RULES:\n"
    "- Define exactly one class: `class Lesson(Scene):` with a `construct(self)` method.\n"
    "- Use ONLY: Text, shapes (Circle, Square, Rectangle, RoundedRectangle, Line, Arrow, "
    "Dot, Polygon), VGroup, and animations (Create, Write, FadeIn, FadeOut, Transform, "
    "ReplacementTransform, GrowArrow, Indicate, self.play, self.wait).\n"
    "- DO NOT use Tex, MathTex, or any LaTeX — there is no LaTeX installed; use Text only.\n"
    "- Keep within the frame; reuse positions; aim for ~15-25 seconds total.\n"
    "- `from manim import *` at the top. No comments needed.\n"
    "Return ONLY the Python code — no markdown fences, no prose."
)

_REPAIR_PROMPT = (
    "The following Manim code failed to render with this error:\n\n{error}\n\n"
    "Here is the code:\n\n{code}\n\n"
    "Fix it. Keep the same rules (single `class Lesson(Scene)`, Text/shapes only, no "
    "LaTeX/Tex/MathTex). Return ONLY the corrected Python code — no fences, no prose."
)


@dataclass
class RenderResult:
    ok: bool
    render_id: str | None = None
    video_path: str | None = None
    error: str | None = None
    attempts: int = 0


def _extract_code(raw: str) -> str:
    """Pull Python out of an LLM reply, tolerating ```python fences / stray prose."""
    fenced = re.search(r"```(?:python)?\s*(.*?)```", raw, re.DOTALL)
    code = fenced.group(1) if fenced else raw
    return code.strip()


class ManimRenderService:
    def __init__(
        self,
        *,
        provision: EnvPackProvisionService,
        llm_svc: LLMService,
        output_dir: Path,
        max_attempts: int = 3,
        runner: SidecarRunner | None = None,
    ) -> None:
        self._provision = provision
        self._llm = llm_svc
        self._out = Path(output_dir)
        self._max = max_attempts
        self._runner = runner or self._default_runner
        self._videos: dict[str, str] = {}   # render_id → mp4 path (for serving)

    def get_video(self, render_id: str) -> str | None:
        """Resolve a finished render's MP4 path by id (for the serve endpoint)."""
        return self._videos.get(render_id)

    async def render(
        self,
        *,
        topic: str,
        difficulty: str,
        provider: str,
        model: str,
        credentials: ProviderCredentials,
    ) -> RenderResult:
        if not self._provision.is_ready():
            return RenderResult(ok=False, error="The Cinematic (Manim) pack is not installed.")

        python_exe = str(self._provision.interpreter())
        self._out.mkdir(parents=True, exist_ok=True)
        render_id = uuid.uuid4().hex[:12]
        out_sub = str(self._out / f"render_{render_id}")
        prev_code: str | None = None
        prev_err: str | None = None

        for attempt in range(1, self._max + 1):
            code = await self._generate_code(topic, difficulty, provider, model, credentials, prev_code, prev_err)
            ok, payload = await self._render_once(python_exe, code, out_sub)
            if ok:
                logger.info("Cinematic render succeeded for %r on attempt %d", topic, attempt)
                self._videos[render_id] = payload
                return RenderResult(ok=True, render_id=render_id, video_path=payload, attempts=attempt)
            logger.info("Cinematic render attempt %d failed for %r", attempt, topic)
            prev_code, prev_err = code, payload

        return RenderResult(ok=False, error=prev_err or "render failed", attempts=self._max)

    # ── Internals ──────────────────────────────────────────────────────────────

    async def _generate_code(
        self, topic, difficulty, provider, model, credentials, prev_code, prev_err,
    ) -> str:
        if prev_code and prev_err:
            user = _REPAIR_PROMPT.format(error=prev_err[-1500:], code=prev_code)
            system = "You fix Manim Community Edition code. Text/shapes only, no LaTeX."
        else:
            system = _SYSTEM_PROMPT.format(topic=topic, difficulty=difficulty)
            user = f"Animate: {topic}"
        raw = await self._llm.complete(
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            provider=provider, model=model, credentials=credentials,
            max_tokens=2000, temperature=0.3,
        )
        return _extract_code(raw)

    async def _render_once(self, python_exe: str, code: str, out_sub: str) -> tuple[bool, str]:
        """Write code to a temp file, run the sidecar, return (ok, video_path|error)."""
        fd, code_file = tempfile.mkstemp(suffix=".py", prefix="knovex_manim_")
        os.close(fd)
        Path(code_file).write_text(code, encoding="utf-8")
        try:
            rc, stdout = await self._runner(python_exe, code_file, out_sub)
        except Exception as exc:  # noqa: BLE001
            return False, f"sidecar launch failed: {exc}"
        finally:
            with contextlib.suppress(OSError):
                os.unlink(code_file)

        data = _last_json(stdout)
        if rc == 0 and data.get("ok"):
            return True, data["video"]
        return False, data.get("error") or stdout[-1500:] or f"render exited {rc}"

    async def _default_runner(self, python_exe: str, code_file: str, out_dir: str) -> tuple[int, str]:
        proc = await asyncio.create_subprocess_exec(
            python_exe, _SIDECAR, code_file, out_dir,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
        out, _ = await proc.communicate()
        return proc.returncode or 0, out.decode("utf-8", errors="replace")


def _last_json(text: str) -> dict:
    """Parse the last JSON object printed on stdout (sidecar may emit log lines)."""
    for line in reversed([ln for ln in text.splitlines() if ln.strip()]):
        try:
            obj = json.loads(line)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            continue
    return {}
