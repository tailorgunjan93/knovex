"""
LLM Provider Package

Imports all concrete providers so their @register_provider decorators
execute and self-register into LLMProviderFactory.

Adding a new provider = create a new module, add the import here.
Nothing else changes.
"""

from backend.core.providers.factory import LLMProviderFactory, register_provider  # noqa: F401
from backend.core.providers import (  # noqa: F401
    openai,
    anthropic,
    groq,
    gemini,
    cerebras,
    bedrock,
    ollama,
)
