"""Google Gemini LLM Provider."""
from typing import Any

from backend.core.providers.base import LLMProvider, ProviderCredentials
from backend.core.providers.factory import register_provider
from backend.models.schemas import LLMModelInfo


@register_provider("gemini")
class GeminiProvider(LLMProvider):
    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_catalogue(self) -> list[LLMModelInfo]:
        return [
            # ── Gemini 2.5 family (2025) ──────────────────────────────────────
            LLMModelInfo(id="gemini/gemini-2.5-pro",       name="Gemini 2.5 Pro",       context_window=1_048_576),
            LLMModelInfo(id="gemini/gemini-2.5-flash",     name="Gemini 2.5 Flash",     context_window=1_048_576),
            LLMModelInfo(id="gemini/gemini-2.5-flash-lite",name="Gemini 2.5 Flash Lite",context_window=1_048_576),
            # ── Gemini 2.0 family ────────────────────────────────────────────
            LLMModelInfo(id="gemini/gemini-2.0-flash",     name="Gemini 2.0 Flash",     context_window=1_048_576),
            LLMModelInfo(id="gemini/gemini-2.0-flash-lite",name="Gemini 2.0 Flash Lite",context_window=1_048_576),
            # ── Gemini 1.5 (legacy) ──────────────────────────────────────────
            LLMModelInfo(id="gemini/gemini-1.5-pro",       name="Gemini 1.5 Pro",       context_window=2_000_000),
            LLMModelInfo(id="gemini/gemini-1.5-flash",     name="Gemini 1.5 Flash",     context_window=1_000_000),
        ]

    def _build_completion_kwargs(
        self, model: str, credentials: ProviderCredentials
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"model": model}
        if credentials.api_key:
            kwargs["api_key"] = credentials.api_key
        return kwargs
