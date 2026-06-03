"""
Multi-provider LLM settings — per-provider key store + active switching.

The backend keeps `llm` as the *active* provider's config (consumers read it),
plus an additive `llm_providers` store so each provider's key persists when you
switch. These tests guard that model, the active-mirror, and encryption-at-rest.
"""

from __future__ import annotations

import pytest

from backend.core.encryption import FernetEncryptor, NullEncryptor
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


class TestActiveMirror:
    @pytest.mark.asyncio
    async def test_active_provider_always_present_in_grid(self, service):
        # Fresh install: openai is the default active provider → appears in the grid.
        s = await service.get()
        assert "openai" in s.llm_providers
        assert s.llm.provider == "openai"

    @pytest.mark.asyncio
    async def test_active_with_key_is_configured(self, service):
        await service.update({"llm": {"provider": "openai", "api_key": "sk-abc12345"}})
        s = await service.get()
        assert s.llm_providers["openai"].configured is True


class TestSetProvider:
    @pytest.mark.asyncio
    async def test_set_inactive_provider_does_not_change_active(self, service):
        # active is openai; configure anthropic without activating it
        await service.set_provider("anthropic", {"api_key": "sk-ant-999", "model": "claude-haiku-4-5"})
        s = await service.get()
        assert s.llm.provider == "openai"               # active unchanged
        assert s.llm_providers["anthropic"].configured is True
        assert s.llm_providers["anthropic"].model == "claude-haiku-4-5"

    @pytest.mark.asyncio
    async def test_set_active_provider_updates_llm(self, service):
        await service.set_provider("openai", {"api_key": "sk-new-key", "model": "gpt-4o"})
        s = await service.get()
        assert s.llm.model == "gpt-4o"
        assert s.llm.api_key == "sk-new-key"            # get() returns plaintext

    @pytest.mark.asyncio
    async def test_partial_update_keeps_other_fields(self, service):
        await service.set_provider("anthropic", {"api_key": "sk-ant-1", "model": "claude-x"})
        await service.set_provider("anthropic", {"model": "claude-y"})   # key omitted
        s = await service.get()
        assert s.llm_providers["anthropic"].model == "claude-y"
        # key preserved (configured still true)
        assert s.llm_providers["anthropic"].configured is True


class TestActivateProvider:
    @pytest.mark.asyncio
    async def test_activate_copies_saved_config_into_llm(self, service):
        await service.set_provider("anthropic", {"api_key": "sk-ant-key", "model": "claude-haiku-4-5"})
        s = await service.activate_provider("anthropic")
        assert s.llm.provider == "anthropic"
        assert s.llm.model == "claude-haiku-4-5"
        plain = await service.get()
        assert plain.llm.api_key == "sk-ant-key"

    @pytest.mark.asyncio
    async def test_switch_away_and_back_preserves_keys(self, service):
        # This is the whole point of the per-provider store.
        await service.set_provider("openai", {"api_key": "sk-openai", "model": "gpt-4o"})
        await service.set_provider("anthropic", {"api_key": "sk-anthropic", "model": "claude-haiku-4-5"})
        await service.activate_provider("anthropic")
        await service.activate_provider("openai")
        s = await service.get()
        assert s.llm.provider == "openai"
        assert s.llm.api_key == "sk-openai"
        # anthropic's key survived the round-trip
        assert s.llm_providers["anthropic"].configured is True


class TestConfiguredHeuristics:
    @pytest.mark.asyncio
    async def test_ollama_configured_by_base_url(self, service):
        await service.set_provider("ollama", {"base_url": "http://localhost:11434"})
        s = await service.get()
        assert s.llm_providers["ollama"].configured is True

    @pytest.mark.asyncio
    async def test_bedrock_configured_by_aws_keys(self, service):
        await service.set_provider("bedrock", {"aws_access_key_id": "AKIA", "aws_secret_access_key": "secret"})
        s = await service.get()
        assert s.llm_providers["bedrock"].configured is True

    @pytest.mark.asyncio
    async def test_unconfigured_provider_is_false(self, service):
        await service.set_provider("groq", {"model": "llama3.3-70b"})  # no key
        s = await service.get()
        assert s.llm_providers["groq"].configured is False


class TestMasking:
    @pytest.mark.asyncio
    async def test_provider_keys_masked_in_response(self, service):
        await service.set_provider("anthropic", {"api_key": "sk-ant-supersecret"})
        masked = await service.get_masked()
        assert masked.llm_providers["anthropic"].api_key != "sk-ant-supersecret"
        assert "****" in masked.llm_providers["anthropic"].api_key


class TestEncryptionAtRest:
    @pytest.mark.asyncio
    async def test_provider_keys_encrypted_in_store(self, tmp_path):
        enc = FernetEncryptor(tmp_path / ".knovex.key")
        store = InMemorySettingsStore()
        svc = SettingsService(encryptor=enc, store=store)
        await svc.set_provider("anthropic", {"api_key": "sk-ant-plaintext"})
        stored = store.raw()["llm_providers"]["anthropic"]["api_key"]
        assert stored != "sk-ant-plaintext"
        assert enc.is_encrypted(stored)
        # round-trips back to plaintext on read
        s = await svc.get()
        assert s.llm_providers["anthropic"].api_key == "sk-ant-plaintext"


class TestForwardCompat:
    @pytest.mark.asyncio
    async def test_legacy_settings_without_providers_surfaces_active(self):
        legacy = {
            "llm": {"provider": "openai", "model": "gpt-4o-mini", "api_key": "sk-legacy"},
            "theme": "dark",
        }
        svc = SettingsService(encryptor=NullEncryptor(), store=InMemorySettingsStore(legacy))
        s = await svc.get()
        assert "openai" in s.llm_providers
        assert s.llm_providers["openai"].configured is True
