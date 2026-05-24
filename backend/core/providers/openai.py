"""OpenAI LLM Provider."""
from typing import Any
from backend.core.providers.base import LLMProvider, ProviderCredentials
from backend.core.providers.factory import register_provider
from backend.models.schemas import LLMModelInfo


@register_provider("openai")
class OpenAIProvider(LLMProvider):
    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def model_catalogue(self) -> list[LLMModelInfo]:
        return [
            LLMModelInfo(id="gpt-4o",      name="GPT-4o",       context_window=128_000),
            LLMModelInfo(id="gpt-4o-mini", name="GPT-4o Mini",  context_window=128_000),
            LLMModelInfo(id="gpt-4-turbo", name="GPT-4 Turbo",  context_window=128_000),
        ]

    def _build_completion_kwargs(
        self, model: str, credentials: ProviderCredentials
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"model": model}
        if credentials.api_key:
            kwargs["api_key"] = credentials.api_key
        return kwargs
