"""Anthropic LLM Provider."""
from typing import Any

from backend.core.providers.base import LLMProvider, ProviderCredentials
from backend.core.providers.factory import register_provider
from backend.models.schemas import LLMModelInfo


@register_provider("anthropic")
class AnthropicProvider(LLMProvider):
    @property
    def provider_name(self) -> str:
        return "anthropic"

    @property
    def model_catalogue(self) -> list[LLMModelInfo]:
        return [
            LLMModelInfo(id="claude-3-5-sonnet-20241022", name="Claude 3.5 Sonnet", context_window=200_000),
            LLMModelInfo(id="claude-3-haiku-20240307",    name="Claude 3 Haiku",    context_window=200_000),
        ]

    def _build_completion_kwargs(
        self, model: str, credentials: ProviderCredentials
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"model": model}
        if credentials.api_key:
            kwargs["api_key"] = credentials.api_key
        return kwargs
