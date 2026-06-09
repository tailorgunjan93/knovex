"""
Search Settings API — Integration Tests (Test-search-engine button).

Mounts the real settings router over httpx + ASGITransport (no live server, no
network) and drives POST /api/settings/search/engines/{id}/test. This is the
per-engine verification the user asked for — the on-demand counterpart to the
blended-search per-engine logging (lesson #17: a silently-failing engine in a
blend looks like "the whole feature is broken"; this makes each engine probeable).
"""

from __future__ import annotations

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from backend.adapters.web_search import SearchResult, StubWebSearchAdapter
from backend.api.settings import router as settings_router
from backend.core.dependencies import get_search_service, get_settings_service
from backend.core.encryption import NullEncryptor
from backend.core.search_service import SearchService
from backend.core.settings_service import SettingsService
from tests.test_search_multiengine import InMemorySettingsStore

# pyproject asyncio_mode=auto → bare `async def test_*` runs directly.


def _make_app(*, settings_svc: SettingsService, search_svc: SearchService) -> FastAPI:
    app = FastAPI()
    app.include_router(settings_router, prefix="/api")
    app.dependency_overrides[get_settings_service] = lambda: settings_svc
    app.dependency_overrides[get_search_service] = lambda: search_svc
    return app


def _settings() -> SettingsService:
    return SettingsService(encryptor=NullEncryptor(), store=InMemorySettingsStore())


async def _post(app: FastAPI, path: str) -> tuple[int, dict]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post(path)
    return r.status_code, (r.json() if r.headers.get("content-type", "").startswith("application/json") else {})


async def test_test_engine_success_returns_count_and_sample():
    search = SearchService(adapter=StubWebSearchAdapter(results=[
        SearchResult(title="Result A", url="https://a", snippet="s"),
        SearchResult(title="Result B", url="https://b", snippet="s"),
    ]))
    app = _make_app(settings_svc=_settings(), search_svc=search)
    status, body = await _post(app, "/api/settings/search/engines/duckduckgo/test")
    assert status == 200
    assert body["success"] is True
    assert body["engine"] == "duckduckgo"
    assert body["result_count"] == 2
    assert body["sample_title"] == "Result A"
    assert body["latency_ms"] is not None
    assert body["error"] is None


async def test_test_engine_paid_without_key_reports_no_key():
    settings = _settings()
    # Serper enabled but no key → configured False → must NOT call the network.
    await settings.set_search_engine("serper", {"enabled": True})
    search = SearchService(adapter=StubWebSearchAdapter(results=[]))
    app = _make_app(settings_svc=settings, search_svc=search)
    status, body = await _post(app, "/api/settings/search/engines/serper/test")
    assert status == 200
    assert body["success"] is False
    assert "key" in (body["error"] or "").lower()


async def test_test_engine_reachable_but_zero_results_is_not_success():
    # An engine that returns [] (e.g. the old Wikipedia 403) is reachable but
    # contributes nothing — surfaced as a clear, attributable non-success.
    search = SearchService(adapter=StubWebSearchAdapter(results=[]))
    app = _make_app(settings_svc=_settings(), search_svc=search)
    status, body = await _post(app, "/api/settings/search/engines/duckduckgo/test")
    assert status == 200
    assert body["success"] is False
    assert body["result_count"] == 0
    assert body["error"]   # explains the zero-result outcome


async def test_test_engine_unknown_returns_404():
    search = SearchService(adapter=StubWebSearchAdapter(results=[]))
    app = _make_app(settings_svc=_settings(), search_svc=search)
    status, _ = await _post(app, "/api/settings/search/engines/bogus/test")
    assert status == 404


async def test_test_engine_uses_saved_key_for_paid_engine(monkeypatch):
    # A paid engine WITH a saved key must reach the adapter with that key.
    settings = _settings()
    await settings.set_search_engine("serper", {"enabled": True, "api_key": "serp-123"})

    seen: dict = {}

    class _CapturingAdapter(StubWebSearchAdapter):
        async def search(self, query, num_results=5, api_key="", base_url=""):
            seen["api_key"] = api_key
            return [SearchResult(title="Hit", url="https://h", snippet="s")]

    search = SearchService(adapter=_CapturingAdapter())
    app = _make_app(settings_svc=settings, search_svc=search)
    status, body = await _post(app, "/api/settings/search/engines/serper/test")
    assert status == 200
    assert body["success"] is True
    assert seen["api_key"] == "serp-123"
