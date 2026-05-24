"""
LLM Service

Thin wrapper around LiteLLM that handles:
  - Provider / model / key configuration
  - Streaming completions (yields token strings)
  - Non-streaming completions
  - Connection ping test (used by Settings page "Test" button)
  - Model catalogue per provider

All provider differences (key names, base_url, etc.) are handled here
so callers just call `llm_service.stream(messages)` and get tokens.

Supported providers
-------------------
openai      → GPT-4o, GPT-4o-mini, GPT-4-turbo
anthropic   → claude-3-5-sonnet-20241022, claude-3-haiku-20240307
groq        → llama3-70b-8192, mixtral-8x7b, gemma-7b-it
gemini      → gemini/gemini-1.5-pro, gemini/gemini-1.5-flash
cerebras    → cerebras/llama3.1-70b
bedrock     → bedrock/... (requires AWS credentials)
ollama      → ollama/... (requires Ollama running on localhost:11434)
"""

from __future__ import annotations

import logging
import time
from typing import Any, AsyncIterator

import httpx
import litellm
from litellm import acompletion

from backend.models.schemas import (
    LLMModelInfo,
    LLMModelsResponse,
    TestLLMResponse,
)

logger = logging.getLogger("knovex.llm")

# Suppress LiteLLM's verbose logging
litellm.suppress_debug_info = True
litellm.set_verbose = False

# ---------------------------------------------------------------------------
# Model catalogue
# ---------------------------------------------------------------------------

MODEL_CATALOGUE: dict[str, list[LLMModelInfo]] = {
    "openai": [
        LLMModelInfo(id="gpt-4o",           name="GPT-4o",           context_window=128_000),
        LLMModelInfo(id="gpt-4o-mini",      name="GPT-4o Mini",      context_window=128_000),
        LLMModelInfo(id="gpt-4-turbo",      name="GPT-4 Turbo",      context_window=128_000),
    ],
    "anthropic": [
        LLMModelInfo(id="claude-3-5-sonnet-20241022", name="Claude 3.5 Sonnet", context_window=200_000),
        LLMModelInfo(id="claude-3-haiku-20240307",    name="Claude 3 Haiku",    context_window=200_000),
    ],
    "groq": [
        LLMModelInfo(id="groq/llama3-70b-8192",   name="Llama 3 70B",   context_window=8_192),
        LLMModelInfo(id="groq/mixtral-8x7b-32768", name="Mixtral 8x7B", context_window=32_768),
        LLMModelInfo(id="groq/gemma-7b-it",        name="Gemma 7B",      context_window=8_192),
    ],
    "gemini": [
        LLMModelInfo(id="gemini/gemini-1.5-pro",   name="Gemini 1.5 Pro",   context_window=2_000_000),
        LLMModelInfo(id="gemini/gemini-1.5-flash",  name="Gemini 1.5 Flash", context_window=1_000_000),
    ],
    "cerebras": [
        LLMModelInfo(id="cerebras/llama3.1-70b",  name="Llama 3.1 70B",  context_window=128_000),
        LLMModelInfo(id="cerebras/llama3.1-8b",   name="Llama 3.1 8B",   context_window=128_000),
    ],
    "bedrock": [
        LLMModelInfo(id="bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0", name="Claude 3.5 Sonnet (Bedrock)", context_window=200_000),
        LLMModelInfo(id="bedrock/meta.llama3-70b-instruct-v1:0",             name="Llama 3 70B (Bedrock)",       context_window=8_192),
        LLMModelInfo(id="bedrock/amazon.titan-text-express-v1",              name="Titan Text Express",          context_window=8_192),
    ],
    "ollama": [
        # Populated dynamically from Ollama /api/tags at runtime
        LLMModelInfo(id="ollama/llama3.2:latest", name="Llama 3.2 (Ollama)", context_window=128_000),
    ],
}


# ---------------------------------------------------------------------------
# LLMService
# ---------------------------------------------------------------------------

class LLMService:
    """
    Wrapper around LiteLLM providing a consistent async interface
    for all supported providers.
    """

    # ------------------------------------------------------------------
    # Completion (non-streaming)
    # ------------------------------------------------------------------

    async def complete(
        self,
        messages: list[dict[str, str]],
        provider: str,
        model: str,
        api_key: str = "",
        base_url: str = "",
        aws_region: str = "us-east-1",
        aws_access_key_id: str = "",
        aws_secret_access_key: str = "",
        max_tokens: int = 2048,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> str:
        """
        Send *messages* to the specified LLM and return the full response string.
        """
        litellm_kwargs = self._build_kwargs(
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
            aws_region=aws_region,
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=False,
            **kwargs,
        )
        response = await acompletion(messages=messages, **litellm_kwargs)
        return response.choices[0].message.content or ""

    # ------------------------------------------------------------------
    # Streaming
    # ------------------------------------------------------------------

    async def stream(
        self,
        messages: list[dict[str, str]],
        provider: str,
        model: str,
        api_key: str = "",
        base_url: str = "",
        aws_region: str = "us-east-1",
        aws_access_key_id: str = "",
        aws_secret_access_key: str = "",
        max_tokens: int = 2048,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """
        Async generator that yields token strings as they arrive from the LLM.
        """
        litellm_kwargs = self._build_kwargs(
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
            aws_region=aws_region,
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
            **kwargs,
        )
        response = await acompletion(messages=messages, **litellm_kwargs)
        async for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    # ------------------------------------------------------------------
    # Ping / test
    # ------------------------------------------------------------------

    async def test_connection(
        self,
        provider: str,
        model: str,
        api_key: str = "",
        base_url: str = "",
        aws_region: str = "us-east-1",
        aws_access_key_id: str = "",
        aws_secret_access_key: str = "",
    ) -> TestLLMResponse:
        """
        Send a minimal test message and measure round-trip latency.
        Returns TestLLMResponse indicating success or failure.
        """
        start = time.monotonic()
        try:
            result = await self.complete(
                messages=[{"role": "user", "content": "Hi"}],
                provider=provider,
                model=model,
                api_key=api_key,
                base_url=base_url,
                aws_region=aws_region,
                aws_access_key_id=aws_access_key_id,
                aws_secret_access_key=aws_secret_access_key,
                max_tokens=5,
                temperature=0.0,
            )
            latency_ms = (time.monotonic() - start) * 1000
            return TestLLMResponse(
                success=True,
                latency_ms=round(latency_ms, 1),
                model=model,
            )
        except Exception as exc:
            logger.warning("LLM connection test failed: %s", exc)
            return TestLLMResponse(
                success=False,
                model=model,
                error=str(exc),
            )

    # ------------------------------------------------------------------
    # Model catalogue
    # ------------------------------------------------------------------

    def get_models(self, provider: str) -> LLMModelsResponse:
        """Return the static model catalogue for *provider*."""
        models = MODEL_CATALOGUE.get(provider.lower(), [])
        return LLMModelsResponse(provider=provider, models=models)

    async def get_ollama_models(
        self, base_url: str = "http://localhost:11434"
    ) -> list[str]:
        """
        Fetch available model names from a running Ollama instance.
        Returns an empty list if Ollama is not reachable.
        """
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{base_url}/api/tags")
                if resp.status_code == 200:
                    data = resp.json()
                    return [m["name"] for m in data.get("models", [])]
        except Exception as exc:
            logger.debug("Ollama model fetch failed: %s", exc)
        return []

    # ------------------------------------------------------------------
    # Internal: build LiteLLM kwargs
    # ------------------------------------------------------------------

    @staticmethod
    def _build_kwargs(
        provider: str,
        model: str,
        api_key: str,
        base_url: str,
        aws_region: str,
        aws_access_key_id: str,
        aws_secret_access_key: str,
        **extra: Any,
    ) -> dict[str, Any]:
        """
        Build the keyword arguments dict for a LiteLLM ``acompletion`` call.

        LiteLLM uses the ``model`` string to determine the provider, but we
        also set explicit credentials so they don't need to be in env vars.
        """
        kwargs: dict[str, Any] = {"model": model, **extra}

        match provider.lower():
            case "openai":
                if api_key:
                    kwargs["api_key"] = api_key

            case "anthropic":
                if api_key:
                    kwargs["api_key"] = api_key

            case "groq":
                if api_key:
                    kwargs["api_key"] = api_key

            case "gemini":
                if api_key:
                    kwargs["api_key"] = api_key

            case "cerebras":
                if api_key:
                    kwargs["api_key"] = api_key

            case "bedrock":
                if aws_access_key_id:
                    kwargs["aws_access_key_id"] = aws_access_key_id
                if aws_secret_access_key:
                    kwargs["aws_secret_access_key"] = aws_secret_access_key
                if aws_region:
                    kwargs["aws_region_name"] = aws_region

            case "ollama":
                kwargs["api_base"] = base_url or "http://localhost:11434"

            case _:
                logger.warning("Unknown provider '%s' — passing through as-is", provider)
                if api_key:
                    kwargs["api_key"] = api_key
                if base_url:
                    kwargs["api_base"] = base_url

        return kwargs


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------
llm_service = LLMService()
