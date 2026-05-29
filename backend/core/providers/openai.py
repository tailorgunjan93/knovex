"""OpenAI LLM Provider."""
from __future__ import annotations

import logging
from typing import Any

from backend.adapters.http_client import IHttpClient
from backend.adapters.llm_client import ILLMClient
from backend.core.providers.base import LLMProvider, ProviderCredentials
from backend.core.providers.factory import register_provider
from backend.models.schemas import LLMModelInfo

logger = logging.getLogger("knovex.providers.openai")

_MODELS_URL = "https://api.openai.com/v1/models"

# Model ID prefixes that indicate a chat-completion-capable model.
# OpenAI's /v1/models returns embeddings, whisper, TTS, DALL-E, fine-tunes, etc.
# We keep only the ones that work with /v1/chat/completions.
_CHAT_PREFIXES = ("gpt-", "o1", "o3", "o4", "chatgpt-")
_CHAT_EXCLUDES = ("instruct", "embedding", "whisper", "tts", "dall-e",
                  "babbage", "davinci", "moderation", "ada")


@register_provider("openai")
class OpenAIProvider(LLMProvider):

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
        return "openai"

    @property
    def model_catalogue(self) -> list[LLMModelInfo]:
        """Static fallback — used when no API key is available or live fetch fails."""
        return [
            # ── GPT-4o family ─────────────────────────────────────────────────
            LLMModelInfo(id="gpt-4o",          name="GPT-4o",           context_window=128_000),
            LLMModelInfo(id="gpt-4o-mini",     name="GPT-4o Mini",      context_window=128_000),
            # ── GPT-4.1 family (2025) ────────────────────────────────────────
            LLMModelInfo(id="gpt-4.1",         name="GPT-4.1",          context_window=1_047_576),
            LLMModelInfo(id="gpt-4.1-mini",    name="GPT-4.1 Mini",     context_window=1_047_576),
            LLMModelInfo(id="gpt-4.1-nano",    name="GPT-4.1 Nano",     context_window=1_047_576),
            # ── Reasoning models ──────────────────────────────────────────────
            LLMModelInfo(id="o1",              name="o1",               context_window=200_000),
            LLMModelInfo(id="o1-mini",         name="o1-mini",          context_window=128_000),
            LLMModelInfo(id="o3",              name="o3",               context_window=200_000),
            LLMModelInfo(id="o3-mini",         name="o3-mini",          context_window=200_000),
            LLMModelInfo(id="o4-mini",         name="o4-mini",          context_window=200_000),
        ]

    async def fetch_live_models(
        self, credentials: ProviderCredentials
    ) -> list[LLMModelInfo] | None:
        """Fetch the live model list from the OpenAI API."""
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
                models: list[LLMModelInfo] = []
                for m in data.get("data", []):
                    mid: str = m.get("id", "")
                    # Keep only chat-capable models
                    if not any(mid.startswith(p) for p in _CHAT_PREFIXES):
                        continue
                    if any(exc in mid for exc in _CHAT_EXCLUDES):
                        continue
                    # Skip fine-tuned models (contain "ft:")
                    if "ft:" in mid or ":" in mid:
                        continue
                    models.append(LLMModelInfo(id=mid, name=mid, context_window=0))
                # Sort: newest / most capable first (o4, o3, gpt-4.1, gpt-4o, o1, ...)
                models.sort(key=lambda m: m.id, reverse=True)
                logger.debug("OpenAI live models: %d fetched", len(models))
                return models
            logger.debug("OpenAI models API returned %s", resp.status_code)
        except Exception as exc:
            logger.debug("OpenAI live model fetch failed: %s", exc)
        return None

    def _build_completion_kwargs(
        self, model: str, credentials: ProviderCredentials
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"model": model}
        if credentials.api_key:
            kwargs["api_key"] = credentials.api_key
        return kwargs
