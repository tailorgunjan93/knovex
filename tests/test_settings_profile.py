"""
Settings Profile Tests — display_name + onboarded (first-run name prompt)

Root fix for the "fresh download is called Gunjan" bug: the name is NOT
hardcoded — it lives in settings as `display_name`.

  - Fresh install defaults to display_name="" and onboarded=False
    (so the welcome screen shows once and the sidebar shows "You").
  - display_name/onboarded persist through update() and round-trip via get().
  - Forward-compat: an OLD settings.json (no profile keys) loads with the safe
    defaults rather than KeyError — existing users aren't broken.
  - display_name is NOT a sensitive field (stored plaintext, never masked).
"""

from __future__ import annotations

import pytest

from backend.core.settings_service import SettingsService


class InMemorySettingsStore:
    """Minimal ISettingsStore that holds data in a dict (no filesystem I/O)."""

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
    from backend.core.encryption import NullEncryptor
    return SettingsService(encryptor=NullEncryptor(), store=InMemorySettingsStore())


class TestProfileDefaults:
    @pytest.mark.asyncio
    async def test_fresh_install_has_empty_display_name(self, service):
        current = await service.get()
        assert current.display_name == ""

    @pytest.mark.asyncio
    async def test_fresh_install_is_not_onboarded(self, service):
        current = await service.get()
        assert current.onboarded is False

    @pytest.mark.asyncio
    async def test_no_hardcoded_name(self, service):
        """Regression guard for the 'fresh download is called Gunjan' bug."""
        current = await service.get()
        assert "gunjan" not in current.display_name.lower()


class TestProfilePersistence:
    @pytest.mark.asyncio
    async def test_display_name_round_trip(self, service):
        await service.update({"display_name": "Ada"})
        current = await service.get()
        assert current.display_name == "Ada"

    @pytest.mark.asyncio
    async def test_setting_name_and_onboarded(self, service):
        await service.update({"display_name": "Ada", "onboarded": True})
        current = await service.get()
        assert current.display_name == "Ada"
        assert current.onboarded is True

    @pytest.mark.asyncio
    async def test_display_name_not_masked(self, service):
        """display_name is not a secret — get_masked must show it verbatim."""
        await service.update({"display_name": "Ada Lovelace"})
        masked = await service.get_masked()
        assert masked.display_name == "Ada Lovelace"

    @pytest.mark.asyncio
    async def test_display_name_stored_plaintext(self, service):
        await service.update({"display_name": "Ada"})
        raw = service._store.raw()  # type: ignore[attr-defined]
        assert raw.get("display_name") == "Ada"


class TestForwardCompat:
    @pytest.mark.asyncio
    async def test_old_settings_file_without_profile_keys_loads(self):
        """An existing user's settings.json (pre-profile) must not break."""
        from backend.core.encryption import NullEncryptor
        legacy = {
            "llm": {"provider": "openai", "model": "gpt-4o-mini", "api_key": ""},
            "theme": "dark",
        }
        svc = SettingsService(encryptor=NullEncryptor(), store=InMemorySettingsStore(legacy))
        current = await svc.get()
        assert current.display_name == ""
        assert current.onboarded is False
        assert current.theme == "dark"
