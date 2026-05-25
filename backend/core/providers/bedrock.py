"""AWS Bedrock LLM Provider."""
from typing import Any

from backend.core.providers.base import LLMProvider, ProviderCredentials
from backend.core.providers.factory import register_provider
from backend.models.schemas import LLMModelInfo


@register_provider("bedrock")
class BedrockProvider(LLMProvider):
    @property
    def provider_name(self) -> str:
        return "bedrock"

    @property
    def model_catalogue(self) -> list[LLMModelInfo]:
        return [
            LLMModelInfo(
                id="bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0",
                name="Claude 3.5 Sonnet (Bedrock)",
                context_window=200_000,
            ),
            LLMModelInfo(
                id="bedrock/meta.llama3-70b-instruct-v1:0",
                name="Llama 3 70B (Bedrock)",
                context_window=8_192,
            ),
            LLMModelInfo(
                id="bedrock/amazon.titan-text-express-v1",
                name="Titan Text Express",
                context_window=8_192,
            ),
        ]

    def _build_completion_kwargs(
        self, model: str, credentials: ProviderCredentials
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"model": model}
        if credentials.aws_access_key_id:
            kwargs["aws_access_key_id"] = credentials.aws_access_key_id
        if credentials.aws_secret_access_key:
            kwargs["aws_secret_access_key"] = credentials.aws_secret_access_key
        if credentials.aws_region:
            kwargs["aws_region_name"] = credentials.aws_region
        return kwargs
