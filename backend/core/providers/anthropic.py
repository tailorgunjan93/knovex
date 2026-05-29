"""Anthropic LLM Provider."""
from __future__ import annotations

import logging
from typing import Any

from backend.adapters.http_client import IHttpClient
from backend.adapters.llm_client import ILLMClient
from backend.core.providers.base import LLMProvider, ProviderCredentials
from backend.core.providers.factory import register_provider
from backend.models.schemas import LLMModelInfo

logger = logging.getLogger("knovex.providers.anthropic")

_MODELS_URL = "https://api.anthropic.com/v1/models"
_ANTHROPIC_VERSION = "2023-06-01"


@register_provider("anthropic")
class AnthropicProvider(LLMProvider):

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
        return "anthropic"

    @property
    def model_catalogue(self) -> list[LLMModelInfo]:
        """Static fallback — used when no API key is available or live fetch fails."""
        return [
            # ── Claude 4 family (2025) ────────────────────────────────────────
            LLMModelInfo(id="claude-opus-4-5",            name="Claude Opus 4.5",     context_window=200_000),
            LLMModelInfo(id="claude-sonnet-4-5",          name="Claude Sonnet 4.5",   context_window=200_000),
            # ── Claude 3.7 ───────────────────────────────────────────────────
            LLMModelInfo(id="claude-3-7-sonnet-20250219", name="Claude 3.7 Sonnet",   context_window=200_000),
            # ── Claude 3.5 family ────────────────────────────────────────────
            LLMModelInfo(id="claude-3-5-sonnet-20241022", name="Claude 3.5 Sonnet",   context_window=200_000),
            LLMModelInfo(id="claude-3-5-haiku-20241022",  name="Claude 3.5 Haiku",    context_window=200_000),
            # ── Claude 3 (legacy) ────────────────────────────────────────────
            LLMModelInfo(id="claude-3-haiku-20240307",    name="Claude 3 Haiku",      context_window=200_000),
        ]

    async def fetch_live_models(
        self, credentials: ProviderCredentials
    ) -> list[LLMModelInfo] | None:
        """
        Fetch the live model list from the Anthropic API.

        Endpoint: GET https://api.anthropic.com/v1/models
        Auth:     x-api-key header + anthropic-version header
        Response: {"data": [{"id": "...", "display_name": "...", "context_window": ...}]}
        """
        if not credentials.api_key:
            return None
        try:
            resp = await self._http_client.get(
                _MODELS_URL,
                headers={
                    "x-api-key": credentials.api_key,
                    "anthropic-version": _ANTHROPIC_VERSION,
                },
                timeout=8.0,
            )
            if resp.ok:
                data = resp.json()
                models = [
                    LLMModelInfo(
                        id=m["id"],
                        name=m.get("display_name") or m["id"],
                        context_window=m.get("context_window", 200_000),
                    )
                    for m in data.get("data", [])
                    if m.get("type") != "embedding"  # exclude any future embedding models
                ]
                logger.debug("Anthropic live models: %s", [m.id for m in models])
                return models
            logger.debug("Anthropic models API returned %s", resp.status_code)
        except Exception as exc:
            logger.debug("Anthropic live model fetch failed: %s", exc)
        return None

    def _build_completion_kwargs(
        self, model: str, credentials: ProviderCredentials
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"model": model}
        if credentials.api_key:
            kwargs["api_key"] = credentials.api_key
        return kwargs
