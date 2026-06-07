"""
Cinematic (Manim) API — integration tests via httpx + ASGI (no live server,
no real render). Services are overridden with fakes.
"""

from __future__ import annotations

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
from backend.core.manim_render_service import RenderResult


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
