"""
Encryption Abstractions

ISP: IEncryptor is a narrow, focused interface — encrypt + decrypt only.
OCP: swap Fernet for AES-GCM, AWS KMS, or HashiCorp Vault by creating a
     new class that implements IEncryptor. SettingsService never changes.

Concrete implementations:
  - FernetEncryptor  — symmetric key, stored as a file (Phase 1 default)
  - NullEncryptor    — no-op, for testing or when encryption is disabled
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger("knovex.encryption")


# ---------------------------------------------------------------------------
# Interface
# ---------------------------------------------------------------------------

class IEncryptor(ABC):
    """
    Narrow encryption interface — single responsibility: encrypt and decrypt strings.

    Implementations must be deterministic in decrypt(encrypt(x)) == x
    and should return "" (not raise) for any decryption failure.
    """

    @abstractmethod
    def encrypt(self, plaintext: str) -> str:
        """Encrypt *plaintext* and return an opaque token string."""
        ...

    @abstractmethod
    def decrypt(self, ciphertext: str) -> str:
        """
        Decrypt *ciphertext* and return the original plaintext.
        Returns "" if decryption fails (invalid token, key mismatch, etc.)
        rather than raising an exception.
        """
        ...

    @abstractmethod
    def is_encrypted(self, value: str) -> bool:
        """
        Return True if *value* looks like an encrypted token produced
        by this encryptor. Used to avoid double-encrypting already-stored values.
        """
        ...


# ---------------------------------------------------------------------------
# Fernet (symmetric key file) implementation
# ---------------------------------------------------------------------------

class FernetEncryptor(IEncryptor):
    """
    Fernet symmetric encryption backed by a key stored in a local file.

    On first use the key is generated and saved. All subsequent calls
    load the same key, so encrypted values survive restarts.

    The key file should be kept private (mode 0600 on Unix).
    """

    def __init__(self, key_file: Path) -> None:
        self._fernet = self._load_or_create(key_file)

    # ------------------------------------------------------------------
    # IEncryptor implementation
    # ------------------------------------------------------------------

    def encrypt(self, plaintext: str) -> str:
        if not plaintext:
            return ""
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        if not ciphertext:
            return ""
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except (InvalidToken, Exception) as exc:
            logger.warning("Fernet decryption failed: %s", exc)
            return ""

    def is_encrypted(self, value: str) -> bool:
        # Fernet tokens always start with "gAAAAA" (base64-encoded prefix)
        return value.startswith("gAAAAA")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _load_or_create(key_file: Path) -> Fernet:
        if key_file.exists():
            return Fernet(key_file.read_bytes().strip())

        # First run — generate a new key
        key = Fernet.generate_key()
        key_file.parent.mkdir(parents=True, exist_ok=True)
        key_file.write_bytes(key)
        try:
            os.chmod(key_file, 0o600)
        except OSError:
            pass  # chmod not supported on Windows
        logger.info("Generated new Fernet key at %s", key_file)
        return Fernet(key)


# ---------------------------------------------------------------------------
# Null (no-op) implementation — for testing or plaintext mode
# ---------------------------------------------------------------------------

class NullEncryptor(IEncryptor):
    """
    No-op encryptor that stores values in plain text.

    Useful in unit tests so assertions don't have to decrypt values,
    and for development environments where key management is unnecessary.
    """

    def encrypt(self, plaintext: str) -> str:
        return plaintext

    def decrypt(self, ciphertext: str) -> str:
        return ciphertext

    def is_encrypted(self, value: str) -> bool:
        return False
