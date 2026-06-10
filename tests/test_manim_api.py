"""
Cinematic (Manim) API — integration tests via httpx + ASGI (no live server,
no real render). Services are overridden with fakes.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from backend.api.manim import router as manim_router
from backend.core.dependencies import (
    get_manim_provision_service,
    get_manim_render_service,
    get_settings_service,
)
from backend.core.env_provision import PackState, PackStatus
from backend.core.manim_render_service import ManimRenderService, RenderResult
from backend.core.providers.base import ProviderCredentials


def _mock_settings():
    svc = MagicMock()
    svc.get = AsyncMock(return_value=MagicMock(llm=MagicMock(
        provider="openai", model="gpt-4o-mini", api_key="k", base_url="",
        aws_region="us-east-1", aws_access_key_id="", aws_secret_access_key="",
    )))
    return svc


def _app(*, render_result=None, video_path=None, status_state=PackState.READY):
    provision = MagicMock()
    provision.status.return_value = PackStatus(state=status_state, detail="")
    render = MagicMock()
    render.render = AsyncMock(return_value=render_result)
    render.get_video.return_value = video_path

    app = FastAPI()
    app.include_router(manim_router, prefix="/api")
    app.dependency_overrides[get_manim_provision_service] = lambda: provision
    app.dependency_overrides[get_manim_render_service] = lambda: render
    app.dependency_overrides[get_settings_service] = _mock_settings
    return app


def _client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_status():
    async with _client(_app(status_state=PackState.NOT_INSTALLED)) as c:
        r = await c.get("/api/manim/status")
    assert r.status_code == 200 and r.json()["state"] == "not_installed"


async def test_render_success_returns_video_url():
    rr = RenderResult(ok=True, render_id="abc123", video_path="/x/lesson.mp4", attempts=2)
    async with _client(_app(render_result=rr)) as c:
        r = await c.post("/api/manim/render", json={"topic": "Levers", "difficulty": "beginner"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] and body["video_url"] == "/api/manim/video/abc123" and body["attempts"] == 2


async def test_render_failure_returns_502():
    rr = RenderResult(ok=False, error="render failed after 3", attempts=3)
    async with _client(_app(render_result=rr)) as c:
        r = await c.post("/api/manim/render", json={"topic": "x"})
    assert r.status_code == 502 and r.json()["ok"] is False


async def test_video_404_when_unknown():
    async with _client(_app(video_path=None)) as c:
        r = await c.get("/api/manim/video/doesnotexist")
    assert r.status_code == 404


async def test_video_served_when_present(tmp_path):
    mp4 = tmp_path / "lesson.mp4"
    mp4.write_bytes(b"\x00\x00\x00")
    async with _client(_app(video_path=str(mp4))) as c:
        r = await c.get("/api/manim/video/abc123")
    assert r.status_code == 200 and r.headers["content-type"] == "video/mp4"


# ── Language (the "video only in English" bug) ────────────────────────────────

async def test_render_passes_language_to_service():
    """The /render endpoint must forward the selected language to the renderer."""
    provision = MagicMock()
    provision.status.return_value = PackStatus(state=PackState.READY, detail="")
    render = MagicMock()
    render.render = AsyncMock(return_value=RenderResult(ok=True, render_id="abc", video_path="/x.mp4", attempts=1))

    app = FastAPI()
    app.include_router(manim_router, prefix="/api")
    app.dependency_overrides[get_manim_provision_service] = lambda: provision
    app.dependency_overrides[get_manim_render_service] = lambda: render
    app.dependency_overrides[get_settings_service] = _mock_settings
    async with _client(app) as c:
        await c.post("/api/manim/render", json={"topic": "Levers", "language": "Spanish"})
    assert render.render.call_args.kwargs["language"] == "Spanish"


async def test_generate_code_writes_onscreen_text_in_language(tmp_path):
    """A non-English language adds an instruction to translate the on-screen Text."""
    captured: dict = {}

    async def _complete(*, messages, **kw):
        captured["messages"] = messages
        return "from manim import *\nclass Lesson(Scene):\n    def construct(self):\n        pass"

    llm = MagicMock()
    llm.complete = _complete
    svc = ManimRenderService(provision=MagicMock(), llm_svc=llm, output_dir=Path(tmp_path))
    creds = ProviderCredentials(api_key="k")

    await svc._generate_code("Levers", "beginner", "openai", "gpt-4o-mini", creds, None, None, "Spanish")
    system_es = next(m["content"] for m in captured["messages"] if m["role"] == "system")
    assert "Spanish" in system_es

    await svc._generate_code("Levers", "beginner", "openai", "gpt-4o-mini", creds, None, None, "English")
    system_en = next(m["content"] for m in captured["messages"] if m["role"] == "system")
    assert "Spanish" not in system_en   # default English adds no language clause
