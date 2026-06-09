"""
Multi-engine web search — per-engine settings store + blended search.

Mirrors the multi-provider LLM model: enable several engines, each with its own
key; the search service blends results from every enabled engine.
"""

from __future__ import annotations

import pytest

from backend.adapters.web_search import IWebSearchAdapter, SearchResult
from backend.core.encryption import FernetEncryptor, NullEncryptor
from backend.core.search_service import SearchService
from backend.core.settings_service import SettingsService


class InMemorySettingsStore:
    def __init__(self, initial: dict | None = None) -> None:
        import copy
        self._data: dict = copy.deepcopy(initial) if initial else {}

    def load(self) -> dict:
        import copy
        return copy.deepcopy(self._data)

    def save(self, data: dict) -> None:
        import copy
        self._data = copy.deepcopy(data)

    def raw(self) -> dict:
        return self._data


@pytest.fixture
def service():
    return SettingsService(encryptor=NullEncryptor(), store=InMemorySettingsStore())


# ── Settings: per-engine store ────────────────────────────────────────────────

class TestSearchEngineSettings:
    @pytest.mark.asyncio
    async def test_default_enables_duckduckgo_only(self, service):
        s = await service.get()
        assert s.search_engines["duckduckgo"].enabled is True
        assert s.search_engines["duckduckgo"].configured is True
        assert s.search_engines["serper"].enabled is False

    @pytest.mark.asyncio
    async def test_enabled_list_defaults_to_duckduckgo(self, service):
        engines = await service.enabled_search_engines()
        assert engines == [("duckduckgo", "")]

    @pytest.mark.asyncio
    async def test_free_engine_is_configured_without_key(self, service):
        await service.set_search_engine("wikipedia", {"enabled": True})
        s = await service.get()
        assert s.search_engines["wikipedia"].configured is True
        engines = dict(await service.enabled_search_engines())
        assert "wikipedia" in engines

    @pytest.mark.asyncio
    async def test_paid_engine_needs_key_to_be_usable(self, service):
        # enabled but no key → configured False, excluded from the blend list
        await service.set_search_engine("serper", {"enabled": True})
        s = await service.get()
        assert s.search_engines["serper"].configured is False
        engines = dict(await service.enabled_search_engines())
        assert "serper" not in engines

        # add a key → now usable
        await service.set_search_engine("serper", {"api_key": "serp-key"})
        engines = dict(await service.enabled_search_engines())
        assert engines.get("serper") == "serp-key"

    @pytest.mark.asyncio
    async def test_key_masked_in_response(self, service):
        await service.set_search_engine("brave", {"enabled": True, "api_key": "brave-supersecret"})
        masked = await service.get_masked()
        assert masked.search_engines["brave"].api_key != "brave-supersecret"
        assert "****" in masked.search_engines["brave"].api_key

    @pytest.mark.asyncio
    async def test_key_encrypted_at_rest(self, tmp_path):
        enc = FernetEncryptor(tmp_path / ".knovex.key")
        store = InMemorySettingsStore()
        svc = SettingsService(encryptor=enc, store=store)
        await svc.set_search_engine("serper", {"enabled": True, "api_key": "serp-plain"})
        stored = store.raw()["search_engines"]["serper"]["api_key"]
        assert stored != "serp-plain"
        assert enc.is_encrypted(stored)


# ── Search service: blending ──────────────────────────────────────────────────

class SeqStub(IWebSearchAdapter):
    """Returns a different prepared batch on each successive call."""
    def __init__(self, batches: list[list[SearchResult]]) -> None:
        self.batches = batches
        self.i = 0

    async def search(self, query, num_results=5, api_key="", base_url=""):
        batch = self.batches[min(self.i, len(self.batches) - 1)]
        self.i += 1
        return batch[:num_results]


def _r(title: str, url: str) -> SearchResult:
    return SearchResult(title=title, url=url, snippet=title)


class TestBlendedSearch:
    @pytest.mark.asyncio
    async def test_interleaves_engines(self):
        stub = SeqStub([[_r("a", "u/a"), _r("b", "u/b")], [_r("c", "u/c"), _r("d", "u/d")]])
        svc = SearchService(adapter=stub)
        resp = await svc.search_blended("q", engines=[("duckduckgo", ""), ("wikipedia", "")], num_results=10)
        urls = [r.url for r in resp.results]
        assert urls == ["u/a", "u/c", "u/b", "u/d"]   # round-robin
        assert resp.engine == "duckduckgo+wikipedia"

    @pytest.mark.asyncio
    async def test_dedupes_by_url(self):
        stub = SeqStub([[_r("a", "u/a"), _r("b", "u/b")], [_r("a", "u/a"), _r("c", "u/c")]])
        svc = SearchService(adapter=stub)
        resp = await svc.search_blended("q", engines=[("duckduckgo", ""), ("wikipedia", "")], num_results=10)
        urls = [r.url for r in resp.results]
        assert urls == ["u/a", "u/b", "u/c"]   # duplicate u/a dropped

    @pytest.mark.asyncio
    async def test_caps_num_results(self):
        stub = SeqStub([[_r("a", "u/a"), _r("b", "u/b")], [_r("c", "u/c"), _r("d", "u/d")]])
        svc = SearchService(adapter=stub)
        resp = await svc.search_blended("q", engines=[("duckduckgo", ""), ("wikipedia", "")], num_results=2)
        assert len(resp.results) == 2

    @pytest.mark.asyncio
    async def test_empty_engines_falls_back_to_single(self):
        stub = SeqStub([[_r("a", "u/a")]])
        svc = SearchService(adapter=stub)
        resp = await svc.search_blended("q", engines=[], num_results=5)
        assert [r.url for r in resp.results] == ["u/a"]


# ─────────────────────────────────────────────────────────────────────────────
# Adapter contract guards (Serper request shape; Wikipedia User-Agent → 403 fix)
# ─────────────────────────────────────────────────────────────────────────────

class _FakeResp:
    def __init__(self, status: int, data: dict) -> None:
        self.status_code = status
        self._d = data
        self.text = ""

    def json(self) -> dict:
        return self._d

    def raise_for_status(self) -> None:
        pass


def _fake_httpx(capture: dict, status: int = 200, data: dict | None = None):
    """Return a fake httpx.AsyncClient class that records the outgoing request."""
    class _Client:
        def __init__(self, *a, **k) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json=None, headers=None):
            capture.update(method="POST", url=url, json=json, headers=headers or {})
            return _FakeResp(status, data or {})

        async def get(self, url, params=None, headers=None):
            capture.update(method="GET", url=url, params=params, headers=headers or {})
            return _FakeResp(status, data or {})

    return _Client


class TestAdapterContracts:
    @pytest.mark.asyncio
    async def test_serper_evergreen_query_uses_search_endpoint(self, monkeypatch):
        import httpx

        from backend.adapters import web_search as ws
        cap: dict = {}
        monkeypatch.setattr(httpx, "AsyncClient", _fake_httpx(cap, 200, {"organic": [
            {"title": "T1", "link": "https://a.com", "snippet": "s1"},
            {"title": "T2", "link": "https://b.com", "snippet": "s2"},
        ]}))
        results = await ws.SerperAdapter().search("python decorators tutorial", num_results=5, api_key="KEY123")
        assert cap["url"] == "https://google.serper.dev/search"
        assert cap["headers"].get("X-API-KEY") == "KEY123"
        assert [r.url for r in results] == ["https://a.com", "https://b.com"]

    @pytest.mark.asyncio
    async def test_serper_news_query_routes_to_news_endpoint_and_enriches_snippet(self, monkeypatch):
        # RCA 2026-06-08: news queries must hit /news (real dated articles), not
        # /search (homepage headers + word-matched junk).
        import httpx

        from backend.adapters import web_search as ws
        cap: dict = {}
        monkeypatch.setattr(httpx, "AsyncClient", _fake_httpx(cap, 200, {"news": [
            {"title": "Quake hits", "link": "https://npr.org/x", "snippet": "A 7.8 quake…",
             "source": "NPR", "date": "2 hours ago"},
        ]}))
        results = await ws.SerperAdapter().search("today's top news", num_results=5, api_key="K")
        assert cap["url"] == "https://google.serper.dev/news"
        assert results[0].url == "https://npr.org/x"
        # source + date folded into the snippet for the model to ground on.
        assert "NPR" in results[0].snippet and "2 hours ago" in results[0].snippet

    def test_is_news_query_heuristic(self):
        from backend.adapters.web_search import is_news_query
        for yes in ["today's news", "latest headlines", "what happened today", "breaking news"]:
            assert is_news_query(yes), yes
        for no in ["python decorators", "history of rome", "how photosynthesis works"]:
            assert not is_news_query(no), no

    @pytest.mark.asyncio
    async def test_serper_without_key_returns_empty(self):
        from backend.adapters import web_search as ws
        assert await ws.SerperAdapter().search("q", api_key="") == []

    def test_wikipedia_user_agent_includes_contact_url(self):
        # Wikimedia 403s a bare product UA; it MUST carry a contact URL.
        from backend.adapters.web_search import _WIKIPEDIA_UA
        assert "http" in _WIKIPEDIA_UA.lower(), _WIKIPEDIA_UA

    @pytest.mark.asyncio
    async def test_wikipedia_sends_compliant_user_agent(self, monkeypatch):
        import httpx

        from backend.adapters import web_search as ws
        cap: dict = {}
        monkeypatch.setattr(httpx, "AsyncClient", _fake_httpx(cap, 200, {"query": {"search": []}}))
        await ws.WikipediaAdapter().search("circular motion", num_results=3)
        assert "http" in cap["headers"].get("User-Agent", "").lower()


@pytest.mark.slow
class TestWikipediaLive:
    @pytest.mark.asyncio
    async def test_real_wikipedia_search_returns_results(self):
        """
        Live guard for the 403 fix: the real MediaWiki API must accept our UA.
        Skips (not fails) if the runner can't reach Wikipedia, so a transient
        network / IP rate-limit never flakes CI — the deterministic UA unit test
        (test_wikipedia_sends_compliant_user_agent) is the real gate.
        """
        from backend.adapters.web_search import WikipediaAdapter
        try:
            results = await WikipediaAdapter().search("circular motion", num_results=3)
        except Exception as exc:  # noqa: BLE001
            pytest.skip(f"Wikipedia API unreachable from this runner: {exc}")
        if not results:
            pytest.skip("Wikipedia returned no results from this runner (network/IP)")
        assert len(results) >= 1


# ─────────────────────────────────────────────────────────────────────────────
# News-intent routing for the FREE engines (parity with Serper /news).
# "today's news" via the generic path returns news-site HOMEPAGES + word-matched
# junk; news-intent queries must hit each engine's news-appropriate source.
# ─────────────────────────────────────────────────────────────────────────────

class _FakeDDGS:
    """Context-manager fake of the ddgs.DDGS client, recording which method ran."""

    last_method: str = ""

    def __init__(self, *a, **k) -> None:
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def text(self, query, max_results=5):
        _FakeDDGS.last_method = "text"
        return [{"title": "Decorators", "href": "https://x/doc", "body": "evergreen"}][:max_results]

    def news(self, query, max_results=5):
        _FakeDDGS.last_method = "news"
        return [{"title": "Quake hits", "url": "https://x/quake", "body": "a 7.8 quake",
                 "source": "NPR", "date": "2026-06-09T10:00:00"}][:max_results]


def _install_fake_ddgs(monkeypatch):
    import sys
    import types
    _FakeDDGS.last_method = ""
    mod = types.ModuleType("ddgs")
    mod.DDGS = _FakeDDGS  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "ddgs", mod)


class TestDuckDuckGoNewsRouting:
    @pytest.mark.asyncio
    async def test_news_query_uses_news_method_and_enriches_snippet(self, monkeypatch):
        _install_fake_ddgs(monkeypatch)
        from backend.adapters.web_search import DuckDuckGoAdapter
        results = await DuckDuckGoAdapter().search("today's top news", num_results=5)
        assert _FakeDDGS.last_method == "news"
        assert results[0].url == "https://x/quake"
        # source + date folded into the snippet so the model can ground on it.
        assert "NPR" in results[0].snippet

    @pytest.mark.asyncio
    async def test_evergreen_query_uses_text_method(self, monkeypatch):
        _install_fake_ddgs(monkeypatch)
        from backend.adapters.web_search import DuckDuckGoAdapter
        results = await DuckDuckGoAdapter().search("python decorators", num_results=5)
        assert _FakeDDGS.last_method == "text"
        assert results[0].url == "https://x/doc"


def _fake_httpx_seq(calls: list[dict], responses: list[tuple[int, dict]]):
    """
    Fake httpx.AsyncClient that records every request in *calls* and returns
    (status, data) from *responses* in order (the last entry repeats). Lets a
    test drive a two-hop path (feed fails → fallback search succeeds).
    """
    class _Client:
        def __init__(self, *a, **k) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        def _next(self) -> tuple[int, dict]:
            return responses[min(len(calls) - 1, len(responses) - 1)]

        async def get(self, url, params=None, headers=None):
            calls.append({"method": "GET", "url": url, "params": params, "headers": headers or {}})
            return _FakeResp(*self._next())

        async def post(self, url, json=None, headers=None):
            calls.append({"method": "POST", "url": url, "json": json, "headers": headers or {}})
            return _FakeResp(*self._next())

    return _Client


class TestWikipediaNewsRouting:
    @pytest.mark.asyncio
    async def test_news_query_hits_featured_feed_with_compliant_ua(self, monkeypatch):
        import httpx

        from backend.adapters import web_search as ws
        calls: list[dict] = []
        feed = {"news": [
            {"story": "<p>A massive <a href='#'>quake</a> struck the coast</p>",
             "links": [{"titles": {"normalized": "2026 Coastal Quake"},
                        "content_urls": {"desktop": {"page": "https://en.wikipedia.org/wiki/2026_Coastal_Quake"}}}]},
        ]}
        monkeypatch.setattr(httpx, "AsyncClient", _fake_httpx_seq(calls, [(200, feed)]))
        results = await ws.WikipediaAdapter().search("today's news", num_results=5)
        assert "/feed/featured/" in calls[0]["url"]
        assert "http" in calls[0]["headers"].get("User-Agent", "").lower()
        assert results[0].url == "https://en.wikipedia.org/wiki/2026_Coastal_Quake"
        assert "quake struck" in results[0].snippet.lower()   # HTML stripped

    @pytest.mark.asyncio
    async def test_news_feed_failure_falls_back_to_encyclopedic_search(self, monkeypatch):
        import httpx

        from backend.adapters import web_search as ws
        calls: list[dict] = []
        search = {"query": {"search": [{"title": "News", "snippet": "about <b>news</b>"}]}}
        # 1st hop (featured feed) → 500; 2nd hop (w/api.php search) → 200.
        monkeypatch.setattr(httpx, "AsyncClient", _fake_httpx_seq(calls, [(500, {}), (200, search)]))
        results = await ws.WikipediaAdapter().search("latest news", num_results=3)
        assert "/feed/featured/" in calls[0]["url"]
        assert calls[1]["url"].endswith("/w/api.php")
        assert results[0].title == "News"

    @pytest.mark.asyncio
    async def test_evergreen_query_uses_search_api(self, monkeypatch):
        import httpx

        from backend.adapters import web_search as ws
        calls: list[dict] = []
        search = {"query": {"search": [{"title": "Circular motion", "snippet": "physics"}]}}
        monkeypatch.setattr(httpx, "AsyncClient", _fake_httpx_seq(calls, [(200, search)]))
        results = await ws.WikipediaAdapter().search("circular motion", num_results=3)
        assert calls[0]["url"].endswith("/w/api.php")
        assert results[0].title == "Circular motion"
