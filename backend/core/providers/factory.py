"""
LLM Provider Factory (Self-Registering Plugin Pattern)

OCP compliance: the factory never needs to change when a new provider
is added. Providers register themselves via the @register_provider
decorator in their own module.

Usage::

    from backend.core.providers.factory import LLMProviderFactory

    # After provider modules are imported (done in providers/__init__.py):
    provider = LLMProviderFactory.create("openai")
    result = await provider.complete(messages, model, credentials)

    # List all registered names:
    names = LLMProviderFactory.registered_providers()
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.adapters.llm_client import ILLMClient
    from backend.core.providers.base import LLMProvider

logger = logging.getLogger("knovex.providers.factory")


class LLMProviderFactory:
    """
    Factory for LLMProvider instances.

    Providers self-register by calling LLMProviderFactory.register()
    (typically via the @register_provider decorator) at import time.
    The factory simply looks them up by name.
    """

    _registry: dict[str, type[LLMProvider]] = {}

    @classmethod
    def register(cls, name: str, provider_class: type[LLMProvider]) -> None:
        """Register a provider class under *name*."""
        cls._registry[name.lower()] = provider_class
        logger.debug("Registered LLM provider: %s → %s", name, provider_class.__name__)

    @classmethod
    def create(
        cls,
        provider_name: str,
        llm_client: ILLMClient | None = None,
    ) -> LLMProvider:
        """
        Instantiate and return the provider for *provider_name*.

        Args:
            provider_name: Provider identifier (e.g. "openai", "ollama").
            llm_client:    Optional ILLMClient to inject (defaults to
                           LiteLLMAdapter inside LLMProvider.__init__).
                           Pass a StubLLMClient in tests for offline runs.

        Raises ValueError for unknown providers so the caller gets a
        clear, actionable error message.
        """
        key = provider_name.lower()
        provider_class = cls._registry.get(key)
        if provider_class is None:
            available = ", ".join(sorted(cls._registry))
            raise ValueError(
                f"Unknown LLM provider '{provider_name}'. "
                f"Available: {available or '(none registered yet)'}"
            )
        return provider_class(llm_client=llm_client)

    @classmethod
    def registered_providers(cls) -> list[str]:
        """Return sorted list of all registered provider names."""
        return sorted(cls._registry.keys())

    @classmethod
    def is_registered(cls, name: str) -> bool:
        return name.lower() in cls._registry


def register_provider(name: str):
    """
    Class decorator that self-registers a provider with LLMProviderFactory.

    Example::

        @register_provider("openai")
        class OpenAIProvider(LLMProvider):
            ...
    """
    def decorator(cls: type[LLMProvider]) -> type[LLMProvider]:
        LLMProviderFactory.register(name, cls)
        return cls
    return decorator
