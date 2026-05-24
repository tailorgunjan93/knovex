"""Ollama Local LLM Provider."""
from typing import Any
import httpx
import logging
from backend.core.providers.base import LLMProvider, ProviderCredentials
from backend.core.providers.factory import register_provider
from backend.models.schemas import LLMModelInfo

logger = logging.getLogger("knovex.providers.ollama")

_DEFAULT_BASE_URL = "http://localhost:11434"


@register_provider("ollama")
class OllamaProvider(LLMProvider):
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
            LLMModelInfo(id="ollama/llama3.2:latest", name="Llama 3.2 (Ollama)", context_window=128_000),
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
        Probe the running Ollama instance and return its installed models
        as LLMModelInfo objects.

        Returns an empty list if Ollama is unreachable.
        """
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{base_url}/api/tags")
                if resp.status_code == 200:
                    data = resp.json()
                    return [
                        LLMModelInfo(
                            id=f"ollama/{m['name']}",
                            name=m["name"],
                            context_window=0,
                        )
                        for m in data.get("models", [])
                    ]
        except Exception as exc:
            logger.debug("Ollama model fetch failed: %s", exc)
        return []
