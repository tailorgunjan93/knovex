"""Cerebras LLM Provider."""
from typing import Any

from backend.core.providers.base import LLMProvider, ProviderCredentials
from backend.core.providers.factory import register_provider
from backend.models.schemas import LLMModelInfo


@register_provider("cerebras")
class CerebrasProvider(LLMProvider):
    @property
    def provider_name(self) -> str:
        return "cerebras"

    @property
    def model_catalogue(self) -> list[LLMModelInfo]:
        return [
            LLMModelInfo(id="cerebras/llama3.1-70b", name="Llama 3.1 70B", context_window=128_000),
            LLMModelInfo(id="cerebras/llama3.1-8b",  name="Llama 3.1 8B",  context_window=128_000),
        ]

    def _build_completion_kwargs(
        self, model: str, credentials: ProviderCredentials
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"model": model}
        if credentials.api_key:
            kwargs["api_key"] = credentials.api_key
        return kwargs
