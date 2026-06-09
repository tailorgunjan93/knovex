"""
LLM Client Adapter — wraps LiteLLM

Only this file is allowed to import litellm.
All LLM providers depend on ILLMClient (the interface), never on litellm directly.

Interfaces:
    ILLMClient  — complete() + stream()

Implementations:
    LiteLLMAdapter  — delegates to litellm.acompletion
    StubLLMClient   — deterministic stub for tests (no network, no token)

Pattern: Adapter (GoF) + DIP
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from typing import Any

logger = logging.getLogger("knovex.adapters.llm")


# ---------------------------------------------------------------------------
# Interface
# ---------------------------------------------------------------------------

class ILLMClient(ABC):
    """
    Thin async interface over any LLM completion backend.

    Callers (LLMProvider subclasses) build their provider-specific kwargs
    via ``_build_completion_kwargs()`` and pass them through **provider_kwargs.
    The adapter never inspects those kwargs — it forwards them verbatim to
    the underlying library.

    Design note: ``stream()`` is a sync method that returns an
    ``AsyncGenerator[str, None]``.  Implementations should be written as
    ``async def stream(…): … yield delta``, which is an async generator
    function whose return type is ``AsyncGenerator[str, None]``.
    """

    @abstractmethod
    async def complete(
        self,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float,
        **provider_kwargs: Any,
    ) -> str:
        """
        Non-streaming completion.

        ``provider_kwargs`` must include at minimum ``model`` and any
        credentials the provider requires.

        Returns the full response text.
        """
        ...

    @abstractmethod
    def stream(
        self,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float,
        **provider_kwargs: Any,
    ) -> AsyncGenerator[str, None]:
        """
        Streaming completion — returns an async generator that yields
        token strings as they arrive.

        Usage::

            async for token in llm_client.stream(messages, 2048, 0.7, model="gpt-4o"):
                print(token, end="", flush=True)
        """
        ...


# ---------------------------------------------------------------------------
# LiteLLM implementation
# ---------------------------------------------------------------------------

class LiteLLMAdapter(ILLMClient):
    """
    Adapter that delegates completions to ``litellm.acompletion``.

    ``litellm`` is imported lazily inside each method so that importing this
    module does not load litellm (which is slow) until the first call.
    Module-level litellm configuration is applied on first call via
    ``_configure_once()``.
    """

    _configured: bool = False

    def _configure_once(self) -> None:
        """Apply litellm module-level settings exactly once per process."""
        if not self.__class__._configured:
            import litellm
            litellm.suppress_debug_info = True
            litellm.set_verbose = False
            self.__class__._configured = True
            logger.debug("LiteLLM configured (suppress_debug_info=True)")

    async def complete(
        self,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float,
        **provider_kwargs: Any,
    ) -> str:
        """
        Call litellm.acompletion (non-streaming) and return the text.

        ``provider_kwargs`` is forwarded verbatim and must contain at least
        ``model`` plus any provider credentials.
        """
        self._configure_once()
        from litellm import acompletion  # only import site

        response = await acompletion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=False,
            **provider_kwargs,
        )
        return response.choices[0].message.content or ""

    async def stream(
        self,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float,
        **provider_kwargs: Any,
    ) -> AsyncGenerator[str, None]:
        """
        Call litellm.acompletion (streaming) and yield token strings.

        This is an async generator function.  Call it without ``await``:

            async for token in adapter.stream(messages, 2048, 0.7, model="…"):
                yield token
        """
        self._configure_once()
        from litellm import acompletion  # only import site

        response = await acompletion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
            **provider_kwargs,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


# ---------------------------------------------------------------------------
# Stub for tests / offline mode
# ---------------------------------------------------------------------------

class StubLLMClient(ILLMClient):
    """
    Deterministic stub that never hits the network.

    Useful in unit tests and offline development.
    Replies to any request with a configurable fixed string.
    """

    def __init__(self, reply: str = "stub-response") -> None:
        self._reply = reply

    async def complete(
        self,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float,
        **provider_kwargs: Any,
    ) -> str:
        logger.debug("StubLLMClient.complete called (offline mode)")
        return self._reply

    async def stream(
        self,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float,
        **provider_kwargs: Any,
    ) -> AsyncGenerator[str, None]:
        logger.debug("StubLLMClient.stream called (offline mode)")
        for word in self._reply.split():
            yield word + " "


# ---------------------------------------------------------------------------
# Fake client for END-TO-END tests against the REAL backend (no secrets)
# ---------------------------------------------------------------------------

# Valid canned payloads per Learn format. `complete()` returns the one matching
# the format detected in the prompt, so the real /learn streaming path produces
# parseable content end-to-end without any LLM key.
_CANNED_BY_FORMAT: dict[str, dict] = {
    "animated": {
        "topic": "Test topic",
        "title": "Test Animation",
        "scenes": [
            {
                "narration": "A deterministic scene for end-to-end testing.",
                "duration": 5,
                "elements": [
                    {"type": "text", "text": "E2E animated scene", "x": 50, "y": 18, "size": "title", "color": "accent", "enter": "rise"},
                    {"type": "circle", "label": "core", "x": 50, "y": 56, "r": 16, "color": "accent", "enter": "pop"},
                    {"type": "arrow", "x1": 72, "y1": 56, "x2": 60, "y2": 56, "enter": "draw"},
                ],
            },
            {
                "narration": "The mechanism, built one piece at a time.",
                "duration": 5,
                "elements": [
                    {"type": "text", "text": "How it connects", "x": 50, "y": 16, "size": "heading", "color": "primary", "enter": "fade"},
                    {"type": "node", "label": "Input", "x": 24, "y": 52, "w": 22, "h": 14, "color": "blue", "enter": "rise"},
                    {"type": "node", "label": "Process", "x": 50, "y": 52, "w": 22, "h": 14, "color": "accent", "enter": "pop"},
                    {"type": "node", "label": "Output", "x": 76, "y": 52, "w": 22, "h": 14, "color": "green", "enter": "rise"},
                    {"type": "arrow", "x1": 35, "y1": 52, "x2": 39, "y2": 52, "enter": "draw"},
                    {"type": "arrow", "x1": 61, "y1": 52, "x2": 65, "y2": 52, "enter": "draw"},
                ],
            },
            {
                "narration": "Recap: the three key takeaways.",
                "duration": 5,
                "elements": [
                    {"type": "text", "text": "Recap", "x": 50, "y": 18, "size": "title", "color": "accent", "enter": "pop"},
                    {"type": "text", "text": "1 · input feeds the core", "x": 50, "y": 42, "size": "body", "color": "muted", "enter": "rise"},
                    {"type": "text", "text": "2 · the core transforms it", "x": 50, "y": 56, "size": "body", "color": "muted", "enter": "rise"},
                    {"type": "text", "text": "3 · output is the result", "x": 50, "y": 70, "size": "body", "color": "muted", "enter": "rise"},
                ],
            },
        ],
    },
    "guided": {
        "topic": "Test topic",
        "intro": "A deterministic guided lesson for end-to-end testing.",
        "total_steps": 1,
        "steps": [
            {
                "step": 1,
                "title": "Step one",
                "explanation": "Explanation text.",
                "example": "An example.",
                "analogy": "Like a test fixture.",
                "key_insight": "The key insight.",
                "check_in": "Did this make sense?",
                "quiz_check": None,
            }
        ],
    },
    "quiz": {
        "questions": [
            {"q": "2 + 2 = ?", "options": ["3", "4", "5", "6"], "correct": 1,
             "explanation": "Basic arithmetic."}
        ]
    },
    "flashcard": {"cards": [{"front": "Q?", "back": "A.", "hint": "hint"}]},
    "mindmap": {"root": "Root", "branches": [{"label": "Branch", "children": []}]},
    "timeline": {"events": [{"year": "2026", "title": "Event", "description": "Desc."}]},
}


class FakeLLMClient(ILLMClient):
    """
    Deterministic, offline LLM client for END-TO-END tests that exercise the REAL
    FastAPI backend (no API keys, no network).

    Activated by setting ``KNOVEX_FAKE_LLM=1`` — `LLMProvider.__init__` then uses
    this client instead of `LiteLLMAdapter`, so every provider becomes
    deterministic. This lets the real `/api/learn` and `/api/chat` streaming paths
    run through the actual app + frontend in CI, catching mid-stream-drop bugs that
    mocked-API E2E (page.route) structurally cannot. See
    `docs/rca/2026-06-07-network-error.md`.

    `complete()` returns VALID canned JSON for whichever Learn format the prompt
    describes; `stream()` yields a short canned reply (chat + text formats).
    """

    @staticmethod
    def _detect_format(text: str) -> str:
        t = text.lower()
        if "scenes" in t and "narration" in t:
            return "animated"
        if "key_insight" in t and "steps" in t:
            return "guided"
        if "questions" in t and "options" in t:
            return "quiz"
        if "cards" in t and "front" in t:
            return "flashcard"
        if "branches" in t and ("root" in t or "mindmap" in t):
            return "mindmap"
        if "events" in t and "timeline" in t:
            return "timeline"
        return "text"

    async def complete(
        self,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float,
        **provider_kwargs: Any,
    ) -> str:
        import json as _json

        text = " ".join(m.get("content", "") for m in messages)
        fmt = self._detect_format(text)
        canned = _CANNED_BY_FORMAT.get(fmt)
        if canned is not None:
            return _json.dumps(canned)
        return "This is a deterministic fake completion for end-to-end testing."

    async def stream(
        self,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float,
        **provider_kwargs: Any,
    ) -> AsyncGenerator[str, None]:
        for tok in ["Hello", "! ", "This ", "is ", "a ", "deterministic ", "reply."]:
            yield tok
