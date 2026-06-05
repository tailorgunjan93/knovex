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
