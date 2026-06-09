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
    "You are a senior motion-graphics artist creating a 3Blue1Brown-quality explainer "
    "with Manim Community Edition. Write Python for ONE scene that THOROUGHLY explains "
    "'{topic}' for a {difficulty} learner — a complete lesson, not a quick clip.\n\n"
    "STORYBOARD — cover the topic in clear SECTIONS (aim for 5+), each a self-contained beat:\n"
    "  1. TITLE — the topic name, animated in.\n"
    "  2. INTUITION — the core idea in plain visual terms (an analogy or simple picture).\n"
    "  3. BUILD — introduce the mechanism step by step, revealing ONE element at a time.\n"
    "  4. EXAMPLE — a concrete worked example the learner can follow visually.\n"
    "  5. RECAP — the 2-3 key takeaways shown together.\n"
    "Between sections, FadeOut the previous mobjects so the stage is clean (never overlap).\n\n"
    "PACING (make it feel deliberate — aim ~45-90s total):\n"
    "  - Animate ONE idea per self.play; self.wait(0.6-1.2) after each so it lands.\n"
    "  - run_time=1.5-2.5 for important transforms; ~0.8 for simple reveals.\n"
    "  - Reveal groups gracefully with LaggedStart(*[...], lag_ratio=0.15).\n\n"
    "TECHNIQUE (quality):\n"
    "  - Write for text; Create for shapes/lines; GrowArrow for arrows.\n"
    "  - ReplacementTransform (NOT Transform) when one thing BECOMES another (no ghosts).\n"
    "  - Indicate or a color change to spotlight the CURRENT focal element (staging).\n"
    "  - Layout: assemble a VGroup and .arrange(DOWN/RIGHT, buff=...) or use .next_to / "
    ".to_edge / .move_to; .scale(...) to fit. NEVER let elements overlap or leave the frame.\n"
    "  - Color with intent: a small palette; a bold color = the element in focus, muted "
    "grey = supporting context. Give the title a distinct accent.\n\n"
    "STRICT CONSTRAINTS:\n"
    "  - `from manim import *` at the top. Exactly ONE class: `class Lesson(Scene):` with `construct(self)`.\n"
    "  - Use ONLY: Text, shapes (Circle, Square, Rectangle, RoundedRectangle, Line, Arrow, "
    "Dot, Polygon, Triangle, Ellipse), VGroup, and animations (Create, Write, FadeIn, FadeOut, "
    "Transform, ReplacementTransform, GrowArrow, GrowFromCenter, Indicate, LaggedStart, "
    "self.play, self.wait).\n"
    "  - NO Tex / MathTex / LaTeX (none is installed) — write math and symbols with plain "
    'Text only, e.g. Text("a² + b² = c²").\n'
    "  - The frame is ~14 wide x 8 tall (center is ORIGIN); keep everything inside it.\n"
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
            # Headroom for a multi-section storyboard (the old 2000 cap truncated
            # richer scenes → short, incomplete videos).
            max_tokens=4000, temperature=0.3,
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
