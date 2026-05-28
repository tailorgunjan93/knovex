"""
LLM Provider — Base Interface (Strategy Pattern + Template Method)

Design:
  - LLMProvider is an ABC that defines the Strategy interface.
  - Concrete providers (OpenAIProvider, AnthropicProvider, …) are Strategies.
  - They implement only _build_completion_kwargs() — the one thing that
    differs per provider (credential format, model string prefix, etc.).
  - complete(), stream(), and test_connection() are Template Methods defined
    once here, reused by all providers.
  - All LLM calls are delegated to an ILLMClient (Adapter) so that the
    litellm import is entirely confined to adapters/llm_client.py.

DIP: providers depend on ILLMClient (abstraction), not litellm directly.
OCP: adding a new provider = new file, zero changes to existing code.
SRP: each provider file knows only its own credential format.
LSP: all providers are interchangeable — callers never care which one is live.
"""

from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

from backend.adapters.llm_client import ILLMClient
from backend.models.schemas import LLMModelInfo, TestLLMResponse

logger = logging.getLogger("knovex.providers")


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
    def empty(cls) -> ProviderCredentials:
        return cls()


# ---------------------------------------------------------------------------
# Abstract base — Strategy interface + Template Method implementation
# ---------------------------------------------------------------------------

class LLMProvider(ABC):
    """
    Abstract LLM provider.

    Each concrete subclass implements only _build_completion_kwargs()
    to translate a ProviderCredentials into a kwargs dict that the
    ILLMClient (currently LiteLLM) understands.

    All LLM mechanics (calling, streaming, error handling) live here.
    litellm is never imported in this file or in any provider file.
    """

    def __init__(self, llm_client: ILLMClient | None = None) -> None:
        """
        Args:
            llm_client: Optional ILLMClient to use for all completions.
                        Defaults to LiteLLMAdapter (production default).
                        Pass a StubLLMClient in tests for offline / fast tests.
        """
        if llm_client is None:
            from backend.adapters.llm_client import LiteLLMAdapter
            llm_client = LiteLLMAdapter()
        self._llm_client = llm_client

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
        Build the kwargs dict for ILLMClient.complete() / ILLMClient.stream().

        Must include at minimum: {"model": model}.
        Include credentials (api_key, api_base, …) as required by the provider.
        The returned dict is forwarded verbatim as **provider_kwargs to the adapter.
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
        Non-streaming completion.

        Builds provider-specific kwargs, then delegates to ILLMClient.
        Returns the full response text.
        """
        kwargs = self._build_completion_kwargs(model, credentials)
        return await self._llm_client.complete(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            **kwargs,
        )

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
        async for token in self._llm_client.stream(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            **kwargs,
        ):
            yield token

    async def fetch_live_models(
        self, credentials: ProviderCredentials
    ) -> list[LLMModelInfo] | None:
        """
        Optionally fetch the live model list from the provider's API.

        Returns None  — provider does not support live discovery (use catalogue).
        Returns list  — live models fetched; may be empty if the call failed.

        Override in providers that expose a /v1/models (OpenAI-compatible) endpoint.
        DIP: implementations must use IHttpClient, never import httpx directly.
        """
        return None

    async def test_connection(
        self,
        model: str,
        credentials: ProviderCredentials,
        timeout: float = 12.0,
    ) -> TestLLMResponse:
        """
        Send a minimal one-token request and measure round-trip latency.
        Returns success=True + latency, or success=False + error message.
        Hard-capped at `timeout` seconds so the UI never hangs.
        """
        start = time.monotonic()
        try:
            await asyncio.wait_for(
                self.complete(
                    messages=[{"role": "user", "content": "Hi"}],
                    model=model,
                    credentials=credentials,
                    max_tokens=5,
                    temperature=0.0,
                ),
                timeout=timeout,
            )
            latency_ms = round((time.monotonic() - start) * 1000, 1)
            return TestLLMResponse(success=True, latency_ms=latency_ms, model=model)
        except asyncio.TimeoutError:
            logger.warning("[%s] connection test timed out after %.0fs", self.provider_name, timeout)
            return TestLLMResponse(success=False, model=model,
                                   error=f"Connection timed out after {timeout:.0f}s")
        except Exception as exc:
            logger.warning("[%s] connection test failed: %s", self.provider_name, exc)
            return TestLLMResponse(success=False, model=model, error=str(exc))
