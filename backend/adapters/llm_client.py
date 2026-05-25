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
