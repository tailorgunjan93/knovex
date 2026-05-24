"""
LLM Provider — Base Interface (Strategy Pattern + Template Method)

Design:
  - LLMProvider is an ABC that defines the Strategy interface.
  - Concrete providers (OpenAIProvider, AnthropicProvider, …) are Strategies.
  - They implement only _build_completion_kwargs() — the one thing that
    differs per provider (credential format, model string prefix, etc.).
  - complete(), stream(), and test_connection() are Template Methods defined
    once here, reused by all providers.

OCP: adding a new provider = new file, zero changes to existing code.
SRP: each provider file knows only its own credential format.
LSP: all providers are interchangeable — callers never care which one is live.
"""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator

import litellm
from litellm import acompletion

from backend.models.schemas import LLMModelInfo, TestLLMResponse

logger = logging.getLogger("knovex.providers")

# Suppress LiteLLM verbose output at module level
litellm.suppress_debug_info = True
litellm.set_verbose = False


# ---------------------------------------------------------------------------
# Value object: credentials passed to every provider call
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ProviderCredentials:
    """
    Immutable value object carrying all possible credential fields.

    Callers populate only the fields relevant to their provider;
    providers read only what they need. This avoids a separate
    credentials class per provider while keeping the interface consistent.
    """
    api_key: str = ""
    base_url: str = ""
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    @classmethod
    def empty(cls) -> "ProviderCredentials":
        return cls()


# ---------------------------------------------------------------------------
# Abstract base — Strategy interface + Template Method implementation
# ---------------------------------------------------------------------------

class LLMProvider(ABC):
    """
    Abstract LLM provider.

    Each concrete subclass implements only _build_completion_kwargs()
    to translate a ProviderCredentials into a LiteLLM kwargs dict.
    All LLM mechanics (calling, streaming, error handling) live here.
    """

    # ------------------------------------------------------------------
    # Abstract interface (Strategy variation points)
    # ------------------------------------------------------------------

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Canonical provider identifier (e.g. 'openai', 'anthropic')."""
        ...

    @property
    @abstractmethod
    def model_catalogue(self) -> list[LLMModelInfo]:
        """
        Static list of models this provider supports.
        Returned by GET /api/settings/llm/models.
        """
        ...

    @abstractmethod
    def _build_completion_kwargs(
        self,
        model: str,
        credentials: ProviderCredentials,
    ) -> dict[str, Any]:
        """
        Build LiteLLM kwargs from provider-specific credentials.

        Returns a dict that is passed directly to litellm.acompletion().
        Must include at minimum: {"model": model}.
        """
        ...

    # ------------------------------------------------------------------
    # Template Methods — shared algorithm, implemented once
    # ------------------------------------------------------------------

    async def complete(
        self,
        messages: list[dict[str, str]],
        model: str,
        credentials: ProviderCredentials,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> str:
        """
        Non-streaming completion. Returns the full response string.
        """
        kwargs = self._build_completion_kwargs(model, credentials)
        kwargs.update(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=False,
        )
        response = await acompletion(**kwargs)
        return response.choices[0].message.content or ""

    async def stream(
        self,
        messages: list[dict[str, str]],
        model: str,
        credentials: ProviderCredentials,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """
        Async generator that yields token strings as they arrive.

        Usage::

            async for token in provider.stream(messages, model, creds):
                print(token, end="", flush=True)
        """
        kwargs = self._build_completion_kwargs(model, credentials)
        kwargs.update(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        response = await acompletion(**kwargs)
        async for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def test_connection(
        self,
        model: str,
        credentials: ProviderCredentials,
    ) -> TestLLMResponse:
        """
        Send a minimal one-token request and measure round-trip latency.
        Returns success=True + latency, or success=False + error message.
        """
        start = time.monotonic()
        try:
            await self.complete(
                messages=[{"role": "user", "content": "Hi"}],
                model=model,
                credentials=credentials,
                max_tokens=5,
                temperature=0.0,
            )
            latency_ms = round((time.monotonic() - start) * 1000, 1)
            return TestLLMResponse(success=True, latency_ms=latency_ms, model=model)
        except Exception as exc:
            logger.warning("[%s] connection test failed: %s", self.provider_name, exc)
            return TestLLMResponse(success=False, model=model, error=str(exc))
