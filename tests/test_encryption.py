"""
Encryption Tests — Sprint 6

End-to-end proof that API keys are stored encrypted at rest.

Coverage:
  - FernetEncryptor: encrypt / decrypt roundtrip
  - NullEncryptor: passthrough behaviour
  - is_encrypted() detection
  - SettingsService: sensitive fields encrypted on _save(), decrypted on _load()
  - SettingsService: get_masked() returns "**** " for sensitive fields
  - Key persistence: same Fernet key loaded from file on restart
  - Double-encrypt guard: already-encrypted values not re-encrypted
"""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.core.encryption import FernetEncryptor, NullEncryptor

# ---------------------------------------------------------------------------
# FernetEncryptor unit tests
# ---------------------------------------------------------------------------

class TestFernetEncryptor:
    """Tests for symmetric Fernet encryption."""

    @pytest.fixture
    def key_file(self, tmp_path: Path) -> Path:
        """Return a fresh (non-existent) key file path for each test."""
        return tmp_path / ".knovex.key"

    @pytest.fixture
    def enc(self, key_file: Path) -> FernetEncryptor:
        """Return a FernetEncryptor backed by a temp key file."""
        return FernetEncryptor(key_file)

    def test_encrypt_returns_non_empty(self, enc: FernetEncryptor):
        ct = enc.encrypt("sk-supersecretapikey")
        assert ct
        assert len(ct) > 10

    def test_decrypt_roundtrip(self, enc: FernetEncryptor):
        secret = "sk-abcdef1234567890"
        ct = enc.encrypt(secret)
        assert enc.decrypt(ct) == secret

    def test_encrypted_value_differs_from_plaintext(self, enc: FernetEncryptor):
        plaintext = "my-secret-key"
        ct = enc.encrypt(plaintext)
        assert ct != plaintext

    def test_is_encrypted_returns_true_for_fernet_token(self, enc: FernetEncryptor):
        ct = enc.encrypt("sk-test")
        assert enc.is_encrypted(ct) is True

    def test_is_encrypted_returns_false_for_plaintext(self, enc: FernetEncryptor):
        assert enc.is_encrypted("sk-plaintext-api-key") is False
        assert enc.is_encrypted("") is False
        assert enc.is_encrypted("some-random-value") is False

    def test_fernet_token_has_expected_prefix(self, enc: FernetEncryptor):
        """Fernet tokens always start with gAAAAA (standard base64-encoded header)."""
        ct = enc.encrypt("test-value")
        assert ct.startswith("gAAAAA")

    def test_encrypt_empty_string_returns_empty(self, enc: FernetEncryptor):
        assert enc.encrypt("") == ""

    def test_decrypt_empty_string_returns_empty(self, enc: FernetEncryptor):
        assert enc.decrypt("") == ""

    def test_decrypt_invalid_token_returns_empty(self, enc: FernetEncryptor):
        """Decryption failure should return '' not raise."""
        result = enc.decrypt("gAAAAA-this-is-not-a-valid-fernet-token")
        assert result == ""

    def test_decrypt_garbled_data_returns_empty(self, enc: FernetEncryptor):
        result = enc.decrypt("totally-random-garbage!!!@@@")
        assert result == ""

    def test_key_file_created_on_first_run(self, key_file: Path):
        assert not key_file.exists()
        FernetEncryptor(key_file)
        assert key_file.exists()

    def test_key_file_survives_restart(self, key_file: Path, tmp_path: Path):
        """Two encryptors from the same key file must produce compatible tokens."""
        enc1 = FernetEncryptor(key_file)
        secret = "persistent-secret"
        ct = enc1.encrypt(secret)

        # Simulate restart — create a new encryptor from the *same* key file
        enc2 = FernetEncryptor(key_file)
        assert enc2.decrypt(ct) == secret

    def test_different_key_files_produce_incompatible_tokens(self, tmp_path: Path):
        """Two separate key files produce distinct Fernet instances."""
        enc_a = FernetEncryptor(tmp_path / "key_a.key")
        enc_b = FernetEncryptor(tmp_path / "key_b.key")

        ct = enc_a.encrypt("shared-secret")
        # enc_b cannot decrypt enc_a's tokens
        assert enc_b.decrypt(ct) == ""

    def test_each_encrypt_call_produces_unique_ciphertext(self, enc: FernetEncryptor):
        """Fernet uses a random IV so the same plaintext → different ciphertexts."""
        ct1 = enc.encrypt("same-value")
        ct2 = enc.encrypt("same-value")
        assert ct1 != ct2
        # But both decrypt to the same value
        assert enc.decrypt(ct1) == enc.decrypt(ct2) == "same-value"


# ---------------------------------------------------------------------------
# NullEncryptor unit tests
# ---------------------------------------------------------------------------

class TestNullEncryptor:
    """Tests for the no-op NullEncryptor (used in tests/dev mode)."""

    @pytest.fixture
    def enc(self) -> NullEncryptor:
        return NullEncryptor()

    def test_encrypt_returns_plaintext(self, enc: NullEncryptor):
        assert enc.encrypt("my-key") == "my-key"

    def test_decrypt_returns_plaintext(self, enc: NullEncryptor):
        assert enc.decrypt("my-key") == "my-key"

    def test_is_encrypted_always_false(self, enc: NullEncryptor):
        assert enc.is_encrypted("anything") is False
        assert enc.is_encrypted("gAAAAA-something") is False


# ---------------------------------------------------------------------------
# SettingsService integration — keys are encrypted at rest
# ---------------------------------------------------------------------------

class InMemorySettingsStore:
    """Minimal ISettingsStore that holds data in a dict (no filesystem I/O)."""

    def __init__(self, initial: dict | None = None) -> None:
        self._data: dict = initial or {}

    def load(self) -> dict:
        import copy
        return copy.deepcopy(self._data)

    def save(self, data: dict) -> None:
        import copy
        self._data = copy.deepcopy(data)

    def raw(self) -> dict:
        """Return the raw stored dict (for assertions about encrypted values)."""
        return self._data


class TestSettingsServiceEncryption:
    """
    Integration tests proving that SettingsService encrypts sensitive fields
    before writing to the store and decrypts them on read.
    """

    @pytest.fixture
    def key_file(self, tmp_path: Path) -> Path:
        return tmp_path / ".knovex.key"

    @pytest.fixture
    def fernet_enc(self, key_file: Path) -> FernetEncryptor:
        return FernetEncryptor(key_file)

    @pytest.fixture
    def store(self) -> InMemorySettingsStore:
        return InMemorySettingsStore()

    @pytest.fixture
    def service(self, fernet_enc, store):
        from backend.core.settings_service import SettingsService
        return SettingsService(encryptor=fernet_enc, store=store)

    @pytest.mark.asyncio
    async def test_api_key_stored_encrypted(self, service, store, fernet_enc):
        """llm.api_key must be Fernet-encrypted in the raw store data."""
        await service.update({"llm": {"api_key": "sk-supersecret"}})

        raw = store.raw()
        stored_key = raw.get("llm", {}).get("api_key", "")
        # Must NOT be the plaintext
        assert stored_key != "sk-supersecret"
        # Must look like a Fernet token
        assert fernet_enc.is_encrypted(stored_key), (
            f"Expected Fernet-encrypted value, got: {stored_key[:30]!r}..."
        )

    @pytest.mark.asyncio
    async def test_search_api_key_stored_encrypted(self, service, store, fernet_enc):
        """search.api_key must also be stored encrypted."""
        await service.update({"search": {"api_key": "serper-key-abc123"}})

        raw = store.raw()
        stored_key = raw.get("search", {}).get("api_key", "")
        assert stored_key != "serper-key-abc123"
        assert fernet_enc.is_encrypted(stored_key)

    @pytest.mark.asyncio
    async def test_api_key_roundtrip(self, service):
        """get() must return the original plaintext after update()."""
        await service.update({"llm": {"api_key": "sk-roundtrip-test"}})
        current = await service.get()
        assert current.llm.api_key == "sk-roundtrip-test"

    @pytest.mark.asyncio
    async def test_get_masked_hides_api_key(self, service):
        """get_masked() must never expose the real key value."""
        await service.update({"llm": {"api_key": "sk-plaintext-key-1234"}})
        masked = await service.get_masked()
        assert masked.llm.api_key != "sk-plaintext-key-1234"
        assert "****" in masked.llm.api_key

    @pytest.mark.asyncio
    async def test_aws_keys_stored_encrypted(self, service, store, fernet_enc):
        """Both AWS keys must be encrypted at rest."""
        await service.update({
            "llm": {
                "aws_access_key_id": "AKIAIOSFODNN7EXAMPLE",
                "aws_secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            }
        })
        raw = store.raw().get("llm", {})
        for field in ("aws_access_key_id", "aws_secret_access_key"):
            assert fernet_enc.is_encrypted(raw.get(field, "")), (
                f"Expected {field} to be encrypted"
            )

    @pytest.mark.asyncio
    async def test_non_sensitive_fields_stored_plaintext(self, service, store):
        """provider, model, theme must NOT be encrypted — plaintext in store."""
        await service.update({
            "llm": {"provider": "openai", "model": "gpt-4o-mini"},
            "theme": "dark",
        })
        raw = store.raw()
        assert raw.get("llm", {}).get("provider") == "openai"
        assert raw.get("llm", {}).get("model") == "gpt-4o-mini"
        assert raw.get("theme") == "dark"

    @pytest.mark.asyncio
    async def test_no_double_encrypt(self, service, store, fernet_enc):
        """Saving the same settings twice must not double-encrypt."""
        await service.update({"llm": {"api_key": "sk-stable-key"}})
        first_encrypted = store.raw().get("llm", {}).get("api_key", "")

        # Save again (e.g. user opens settings and saves without changing key)
        await service.update({"llm": {"api_key": "sk-stable-key"}})
        second_encrypted = store.raw().get("llm", {}).get("api_key", "")

        # Both must decrypt to the same plaintext
        assert fernet_enc.decrypt(first_encrypted) == fernet_enc.decrypt(second_encrypted) == "sk-stable-key"

    @pytest.mark.asyncio
    async def test_empty_api_key_not_encrypted(self, service, store, fernet_enc):
        """Empty keys must be stored as empty string, not as encrypted empty."""
        await service.update({"llm": {"api_key": ""}})
        raw_key = store.raw().get("llm", {}).get("api_key", "")
        assert raw_key == ""
        assert not fernet_enc.is_encrypted(raw_key)
