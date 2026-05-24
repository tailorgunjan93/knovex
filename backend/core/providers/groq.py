"""Groq LLM Provider."""
from typing import Any
from backend.core.providers.base import LLMProvider, ProviderCredentials
from backend.core.providers.factory import register_provider
from backend.models.schemas import LLMModelInfo


@register_provider("groq")
class GroqProvider(LLMProvider):
    @property
    def provider_name(self) -> str:
        return "groq"

    @property
    def model_catalogue(self) -> list[LLMModelInfo]:
        return [
            LLMModelInfo(id="groq/llama3-70b-8192",    name="Llama 3 70B",   context_window=8_192),
            LLMModelInfo(id="groq/mixtral-8x7b-32768", name="Mixtral 8x7B",  context_window=32_768),
            LLMModelInfo(id="groq/gemma-7b-it",         name="Gemma 7B",      context_window=8_192),
        ]

    def _build_completion_kwargs(
        self, model: str, credentials: ProviderCredentials
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"model": model}
        if credentials.api_key:
            kwargs["api_key"] = credentials.api_key
        return kwargs
