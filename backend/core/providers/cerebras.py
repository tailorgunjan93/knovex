"""Cerebras LLM Provider."""
from __future__ import annotations

import logging
from typing import Any

from backend.adapters.http_client import IHttpClient
from backend.adapters.llm_client import ILLMClient
from backend.core.providers.base import LLMProvider, ProviderCredentials
from backend.core.providers.factory import register_provider
from backend.models.schemas import LLMModelInfo

logger = logging.getLogger("knovex.providers.cerebras")

_MODELS_URL = "https://api.cerebras.ai/v1/models"


@register_provider("cerebras")
class CerebrasProvider(LLMProvider):

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
        return "cerebras"

    @property
    def model_catalogue(self) -> list[LLMModelInfo]:
        """Static fallback — used when no API key is available or live fetch fails."""
        return [
            LLMModelInfo(id="cerebras/llama-3.3-70b",                    name="Llama 3.3 70B",       context_window=128_000),
            LLMModelInfo(id="cerebras/llama-3.1-8b",                     name="Llama 3.1 8B",        context_window=128_000),
            LLMModelInfo(id="cerebras/qwen-3-32b",                       name="Qwen 3 32B",          context_window=32_768),
            LLMModelInfo(id="cerebras/deepseek-r1-distill-llama-70b",    name="DeepSeek R1 70B",     context_window=128_000),
        ]

    async def fetch_live_models(
        self, credentials: ProviderCredentials
    ) -> list[LLMModelInfo] | None:
        """Fetch the live model list from the Cerebras API."""
        if not credentials.api_key:
            return None
        try:
            resp = await self._http_client.get(
                _MODELS_URL,
                headers={"Authorization": f"Bearer {credentials.api_key}"},
                timeout=8.0,
            )
            if resp.ok:
                data = resp.json()
                models = [
                    LLMModelInfo(
                        id=f"cerebras/{m['id']}",
                        name=m["id"],
                        context_window=m.get("context_window", 0),
                    )
                    for m in data.get("data", [])
                ]
                logger.debug("Cerebras live models: %s", [m.id for m in models])
                return models
            logger.debug("Cerebras models API returned %s", resp.status_code)
        except Exception as exc:
            logger.debug("Cerebras live model fetch failed: %s", exc)
        return None

    def _build_completion_kwargs(
        self, model: str, credentials: ProviderCredentials
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"model": model}
        if credentials.api_key:
            kwargs["api_key"] = credentials.api_key
        return kwargs
