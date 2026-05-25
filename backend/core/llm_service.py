"""
LLM Service — Facade Pattern

Provides a single, stable entry point for all LLM operations.
Delegates to the correct concrete provider (Strategy) via LLMProviderFactory.

Callers (API routes, chat service, learn service) always call LLMService —
they never touch individual providers. This decouples callers from the
Strategy hierarchy.

DIP: LLMService depends on LLMProviderFactory (abstraction), not on any
     concrete provider class.
SRP: LLMService only coordinates — it does not know how any provider works.
OCP: Adding a new provider never touches this file.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING

from backend.core.providers.base import ProviderCredentials
from backend.core.providers.factory import LLMProviderFactory
from backend.models.schemas import LLMModelsResponse, TestLLMResponse

if TYPE_CHECKING:
    from backend.core.providers.base import LLMProvider

logger = logging.getLogger("knovex.llm")


class LLMService:
    """
    Facade over the LLM provider strategy hierarchy.

    All public methods accept a *provider* name string and *credentials*
    object so callers remain agnostic to provider internals.
    The service resolves the correct strategy via LLMProviderFactory
    on every call (providers are stateless, so instantiation is cheap).
    """

    def __init__(self, factory: LLMProviderFactory | None = None) -> None:
        # Accept an injected factory (for testing) or use the global singleton
        self._factory = factory or LLMProviderFactory

    # ------------------------------------------------------------------
    # Completion
    # ------------------------------------------------------------------

    async def complete(
        self,
        messages: list[dict[str, str]],
        provider: str,
        model: str,
        credentials: ProviderCredentials,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> str:
        """Non-streaming completion. Returns the full response string."""
        llm_provider = self._get_provider(provider)
        return await llm_provider.complete(
            messages=messages,
            model=model,
            credentials=credentials,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    # ------------------------------------------------------------------
    # Streaming
    # ------------------------------------------------------------------

    async def stream(
        self,
        messages: list[dict[str, str]],
        provider: str,
        model: str,
        credentials: ProviderCredentials,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """
        Async generator that yields token strings as they arrive from the LLM.

        Usage::

            async for token in llm_service.stream(messages, "openai", "gpt-4o", creds):
                sse_response.send(token)
        """
        llm_provider = self._get_provider(provider)
        async for token in llm_provider.stream(
            messages=messages,
            model=model,
            credentials=credentials,
            max_tokens=max_tokens,
            temperature=temperature,
        ):
            yield token

    # ------------------------------------------------------------------
    # Connection test
    # ------------------------------------------------------------------

    async def test_connection(
        self,
        provider: str,
        model: str,
        credentials: ProviderCredentials,
    ) -> TestLLMResponse:
        """Ping the provider with a minimal request and return latency/status."""
        llm_provider = self._get_provider(provider)
        return await llm_provider.test_connection(model=model, credentials=credentials)

    # ------------------------------------------------------------------
    # Model catalogue
    # ------------------------------------------------------------------

    async def get_models(
        self, provider: str, base_url: str = ""
    ) -> LLMModelsResponse:
        """
        Return the model catalogue for *provider*.

        For Ollama, also probes the running instance to get installed models.
        """
        llm_provider = self._get_provider(provider)
        models = llm_provider.model_catalogue

        # Ollama: enrich with live-fetched installed models
        if provider.lower() == "ollama":
            from backend.core.providers.ollama import OllamaProvider
            if isinstance(llm_provider, OllamaProvider):
                live = await llm_provider.get_installed_models(
                    base_url or "http://localhost:11434"
                )
                if live:
                    models = live

        return LLMModelsResponse(provider=provider, models=models)

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    def registered_providers(self) -> list[str]:
        """Return names of all registered LLM providers."""
        return self._factory.registered_providers()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_provider(self, provider_name: str) -> LLMProvider:
        try:
            return self._factory.create(provider_name)
        except ValueError as exc:
            logger.error("Provider resolution failed: %s", exc)
            raise
