"""
Manim render service — LLM → code → render → repair loop.

The real render (manim install + ~30-90s) isn't exercised here; the orchestration
(generate, run sidecar, repair on failure, registry, not-installed) is unit-tested
with an injected sidecar runner + fake LLM, so the loop is verified without Manim.
"""

from __future__ import annotations

import json
from pathlib import Path

from backend.core.manim_render_service import ManimRenderService, _extract_code
from backend.core.providers.base import ProviderCredentials


class FakeProvision:
    def __init__(self, ready: bool = True):
        self._ready = ready

    def is_ready(self) -> bool:
        return self._ready

    def interpreter(self) -> Path:
        return Path("python")


class FakeLLM:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls: list[dict] = []

    async def complete(self, **kwargs):
        self.calls.append(kwargs)
        return self.replies[min(len(self.calls) - 1, len(self.replies) - 1)]


def _ok_stdout(video="C:/x/lesson.mp4"):
    return json.dumps({"ok": True, "video": video})


def _err_stdout(msg="NameError: Tex not defined"):
    return json.dumps({"ok": False, "error": msg})


def _svc(tmp_path, *, llm, runner, ready=True, max_attempts=3):
    return ManimRenderService(
        provision=FakeProvision(ready),
        llm_svc=llm,
        output_dir=tmp_path / "cinematic",
        max_attempts=max_attempts,
        runner=runner,
    )


_CREDS = ProviderCredentials(api_key="k")


class TestExtractCode:
    def test_strips_python_fences(self):
        assert _extract_code("```python\nfrom manim import *\n```") == "from manim import *"

    def test_plain_passthrough(self):
        assert _extract_code("class Lesson(Scene): pass") == "class Lesson(Scene): pass"


class TestRender:
    async def test_not_installed(self, tmp_path):
        svc = _svc(tmp_path, llm=FakeLLM(["code"]), runner=None, ready=False)
        res = await svc.render(topic="t", difficulty="beginner", provider="x", model="m", credentials=_CREDS)
        assert res.ok is False
        assert "not installed" in res.error.lower()

    async def test_success_first_try(self, tmp_path):
        calls = []

        async def runner(py, code_file, out_dir):
            calls.append(Path(code_file).read_text(encoding="utf-8"))
            return 0, _ok_stdout()

        svc = _svc(tmp_path, llm=FakeLLM(["from manim import *\nclass Lesson(Scene): pass"]), runner=runner)
        res = await svc.render(topic="Levers", difficulty="beginner", provider="x", model="m", credentials=_CREDS)
        assert res.ok and res.attempts == 1
        assert res.render_id and svc.get_video(res.render_id) == "C:/x/lesson.mp4"
        assert "class Lesson" in calls[0]

    async def test_repair_loop_recovers(self, tmp_path):
        n = 0

        async def runner(py, code_file, out_dir):
            nonlocal n
            n += 1
            return (1, _err_stdout()) if n < 3 else (0, _ok_stdout())

        llm = FakeLLM(["bad1", "bad2", "good"])
        svc = _svc(tmp_path, llm=llm, runner=runner)
        res = await svc.render(topic="t", difficulty="beginner", provider="x", model="m", credentials=_CREDS)
        assert res.ok and res.attempts == 3
        assert len(llm.calls) == 3   # regenerated each failure (with repair prompt)

    async def test_gives_up_after_max(self, tmp_path):
        async def runner(py, code_file, out_dir):
            return 1, _err_stdout("always broken")

        svc = _svc(tmp_path, llm=FakeLLM(["x"]), runner=runner, max_attempts=2)
        res = await svc.render(topic="t", difficulty="beginner", provider="x", model="m", credentials=_CREDS)
        assert res.ok is False and res.attempts == 2
        assert "always broken" in res.error
