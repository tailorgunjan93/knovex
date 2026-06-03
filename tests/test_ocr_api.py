"""
OCR pack API — integration tests.

Mounts the real /api/ocr router and drives it via httpx + ASGI transport (no
live server). The provisioning service is overridden with a real
OcrProvisionService backed by a fake command runner — so the HTTP contract is
exercised end-to-end without downloading anything.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from backend.api.ocr import router as ocr_router
from backend.core.dependencies import get_ocr_provision_service
from backend.core.ocr_provision_service import OcrProvisionService, env_python


class FakeRunner:
    async def run(self, cmd, on_line):
        on_line(f"step: {cmd[1] if len(cmd) > 1 else cmd[0]}")
        if len(cmd) >= 3 and cmd[1] == "venv":
            py = env_python(__import__("pathlib").Path(cmd[2]))
            py.parent.mkdir(parents=True, exist_ok=True)
            py.write_text("")
        return 0


def _client(tmp_path, monkeypatch):
    monkeypatch.delenv("KNOVEX_OCR_HOME", raising=False)
    svc = OcrProvisionService(
        env_home=tmp_path / "ocr", uv_resolver=lambda: "uv", runner=FakeRunner()
    )
    app = FastAPI()
    app.include_router(ocr_router, prefix="/api")
    app.dependency_overrides[get_ocr_provision_service] = lambda: svc
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), svc


async def test_status_starts_not_installed(tmp_path, monkeypatch):
    client, _ = _client(tmp_path, monkeypatch)
    async with client:
        r = await client.get("/api/ocr/status")
    assert r.status_code == 200
    assert r.json()["state"] == "not_installed"


async def test_install_then_ready(tmp_path, monkeypatch):
    client, svc = _client(tmp_path, monkeypatch)
    async with client:
        r = await client.post("/api/ocr/install")
        assert r.status_code == 200
        # start_install schedules a task; await it so the test is deterministic.
        if svc._task is not None:
            await svc._task
        r2 = await client.get("/api/ocr/status")
    body = r2.json()
    assert body["state"] == "ready"
    assert body["python_path"]


async def test_uninstall(tmp_path, monkeypatch):
    client, svc = _client(tmp_path, monkeypatch)
    await svc.install()
    async with client:
        r = await client.post("/api/ocr/uninstall")
    assert r.status_code == 200
    assert r.json()["state"] == "not_installed"
