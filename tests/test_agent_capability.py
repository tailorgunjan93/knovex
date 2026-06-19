"""
Capability gate for the ReAct agent.

The agent runs a multi-step Thought→Action→Observation loop that depends on the
model reliably emitting structured JSON actions. Capability tracks model
*strength*, not where it runs:

  • Hosted frontier providers (OpenAI, Anthropic, Groq, …) → capable.
  • A large model is capable even on a local runner — observed: gpt-oss-120b on
    Ollama correctly answers "hi" with a greeting, while the small shiva-chat on
    the same Ollama blindly grounds in an irrelevant chunk and confabulates.
  • Small / unknown local models → deterministic fallback.

These tests pin the routing decision so the gate can't silently drift.
"""

from __future__ import annotations

import pytest

from backend.core.agent.capability import supports_react


class TestSupportsReact:
    @pytest.mark.parametrize(
        "provider",
        ["openai", "anthropic", "groq", "gemini", "cerebras", "bedrock"],
    )
    def test_cloud_providers_are_capable(self, provider):
        assert supports_react(provider, "any-reasonable-model") is True

    def test_small_local_model_is_not_capable(self):
        # The screenshot bug: a small local model blindly over-grounds.
        assert supports_react("ollama", "shiva-chat:latest") is False

    def test_large_local_model_is_capable(self):
        # The user's own observation: gpt-oss-120b behaves correctly even though
        # it's a local model — its size makes it ReAct-capable.
        assert supports_react("ollama", "gpt-oss-120b") is True

    @pytest.mark.parametrize(
        "model,expected",
        [
            ("gpt-oss-120b", True),
            ("llama3.3-70b", True),
            ("qwen2.5-32b", True),
            ("mixtral-8x7b", True),   # MoE: 8*7 = 56B total
            ("llama3.1-8b", False),
            ("qwen2.5-14b", False),
            ("llama3.2:3b", False),
            ("phi-3", False),
            ("shiva-chat:latest", False),
        ],
    )
    def test_local_capability_tracks_model_size(self, model, expected):
        assert supports_react("ollama", model) is expected

    def test_unknown_provider_small_model_defaults_to_not_capable(self):
        # Fail safe: unrecognised provider + no size signal → deterministic path.
        assert supports_react("some-new-provider", "x") is False

    def test_unknown_provider_large_model_is_capable(self):
        # A clearly large model is trustworthy regardless of who serves it.
        assert supports_react("vllm", "llama-3.3-70b") is True

    def test_provider_match_is_case_insensitive(self):
        assert supports_react("OpenAI", "gpt-4o-mini") is True
        assert supports_react("Ollama", "shiva-chat") is False

    def test_blank_provider_small_model_is_not_capable(self):
        assert supports_react("", "x") is False
