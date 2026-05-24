"""Ollama Local LLM Provider."""

from __future__ import annotations

import logging
from typing import Any

from backend.adapters.http_client import IHttpClient
from backend.adapters.llm_client import ILLMClient
from backend.core.providers.base import LLMProvider, ProviderCredentials
from backend.core.providers.factory import register_provider
from backend.models.schemas import LLMModelInfo

logger = logging.getLogger("knovex.providers.ollama")

_DEFAULT_BASE_URL = "http://localhost:11434"


@register_provider("ollama")
class OllamaProvider(LLMProvider):
    """
    Ollama local LLM provider.

    DIP: httpx is never imported here — all HTTP calls go through IHttpClient
         (defaults to HttpxAdapter; inject StubHttpClient in tests).
    """

    def __init__(
        self,
        llm_client: ILLMClient | None = None,
        http_client: IHttpClient | None = None,
    ) -> None:
        super().__init__(llm_client)
        if http_client is None:
            from backend.adapters.http_client import HttpxAdapter
            http_client = HttpxAdapter()
        self._http_client = http_client

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def model_catalogue(self) -> list[LLMModelInfo]:
        """
        Static fallback catalogue.
        The real model list is fetched dynamically from the running
        Ollama instance via get_installed_models().
        """
        return [
            LLMModelInfo(
                id="ollama/llama3.2:latest",
                name="Llama 3.2 (Ollama)",
                context_window=128_000,
            ),
        ]

    def _build_completion_kwargs(
        self, model: str, credentials: ProviderCredentials
    ) -> dict[str, Any]:
        base_url = credentials.base_url or _DEFAULT_BASE_URL
        return {
            "model": model,
            "api_base": base_url,
        }

    async def get_installed_models(
        self, base_url: str = _DEFAULT_BASE_URL
    ) -> list[LLMModelInfo]:
        """
        Probe the running Ollama instance and return its installed models.

        Uses IHttpClient (never imports httpx directly).
        Returns an empty list if Ollama is unreachable or returns no models.
        """
        try:
            response = await self._http_client.get(
                f"{base_url}/api/tags",
                timeout=3.0,
            )
            if response.ok:
                data = response.json()
                return [
                    LLMModelInfo(
                        id=f"ollama/{m['name']}",
                        name=m["name"],
                        context_window=0,
                    )
                    for m in data.get("models", [])
                ]
        except (TimeoutError, ConnectionError) as exc:
            logger.debug("Ollama model fetch failed: %s", exc)
        except Exception as exc:
            logger.debug("Ollama model fetch unexpected error: %s", exc)
        return []
