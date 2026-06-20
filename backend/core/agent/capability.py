"""
Capability gate — decides whether a (provider, model) pair can drive the ReAct
loop, or must fall back to the deterministic router.

The ReAct loop asks the model to emit structured JSON actions across several
turns. Capability tracks model *strength*, which has two reliable proxies:

  1. Hosted frontier providers (OpenAI, Anthropic, Groq, Gemini, Cerebras,
     Bedrock) serve strong, instruction-tuned models → capable.
  2. Parameter count encoded in the model id. A large model is capable even on
     a local runner. This matters in practice: gpt-oss-120b on Ollama answers
     "hi" correctly, while the small shiva-chat on the *same* Ollama blindly
     grounds in an irrelevant chunk and confabulates. Provider alone can't tell
     them apart — size can.

Everything else (small or unknown local models, unrecognised providers with no
size signal) falls back to the deterministic router. The gate errs toward the
*safe* path so a new/unknown setup never silently gets an unreliable loop.
"""

from __future__ import annotations

import re

# Hosted providers whose default models follow multi-step structured-output
# instructions reliably. Lower-cased for case-insensitive matching.
_REACT_CAPABLE_PROVIDERS: frozenset[str] = frozenset(
    {"openai", "anthropic", "groq", "gemini", "cerebras", "bedrock"}
)

# Minimum parameter count (in billions) for a model to be trusted with the
# ReAct loop on a non-frontier/local provider. Sub-~30B models are unreliable
# at multi-step JSON tool-calling; ~30B+ (gpt-oss-120b, llama-3.3-70b, qwen-32b,
# mixtral-8x7b ≈ 56B) handle it. Conservative on purpose.
_LOCAL_REACT_MIN_PARAMS_B: float = 30.0

# "8x7b" (mixture-of-experts) → 56;  "70b" / "120b" / "32b" → that number.
_MOE_RE = re.compile(r"(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*b\b", re.IGNORECASE)
_PARAMS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*b\b", re.IGNORECASE)


def _model_params_billions(model: str) -> float | None:
    """Best-effort parameter count parsed from a model id, or None if absent."""
    if not model:
        return None
    moe = _MOE_RE.search(model)
    if moe:
        return float(moe.group(1)) * float(moe.group(2))
    # Largest plain "<n>b" token wins (ids like "llama3.3-70b").
    sizes = [float(m.group(1)) for m in _PARAMS_RE.finditer(model)]
    return max(sizes) if sizes else None


def supports_react(provider: str, model: str) -> bool:
    """
    Return True if (provider, model) should run the ReAct loop.

    Capable when the provider is a known frontier host, OR when the model id
    advertises a large parameter count (≥ 30B) regardless of provider. Unknown
    providers with no size signal degrade to the deterministic router.
    """
    if (provider or "").strip().lower() in _REACT_CAPABLE_PROVIDERS:
        return True
    size = _model_params_billions(model)
    return size is not None and size >= _LOCAL_REACT_MIN_PARAMS_B
