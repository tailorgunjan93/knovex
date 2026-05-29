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

    def _build_completion_kwargs(
        self, model: str, credentials: ProviderCredentials
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"model": model}
        if credentials.api_key:
            kwargs["api_key"] = credentials.api_key
        return kwargs
