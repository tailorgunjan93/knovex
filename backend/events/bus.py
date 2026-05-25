"""
In-Process Event Bus (Observer Pattern)

Improvements over previous version:
  - emit_typed() accepts BaseEvent subclasses directly (type-safe)
  - Handlers can be typed: async def on_event(payload: dict) -> None
  - Middleware support (e.g. logging, metrics) via add_middleware()
  - Priority ordering for handlers (higher priority = called first)

Design:
  Observer Pattern: EventBus is the Subject; handlers are Observers.
  Handlers are decoupled from emitters — they only share an event name string.

Usage::

    from backend.events.bus import bus
    from backend.events.types import FileIngestedEvent

    # Subscribe with decorator
    @bus.on("kb.file.ingested")
    async def handle_ingested(payload: dict) -> None:
        print(f"Ingested file: {payload['file_id']}")

    # Emit with typed event (preferred)
    await bus.emit_typed(FileIngestedEvent(kb_id="x", file_id="y", chunk_count=10))

    # Or emit raw dict
    await bus.emit("kb.file.ingested", {"file_id": "y"})
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger("knovex.events")

Handler = Callable[[dict[str, Any]], Awaitable[None]]
Middleware = Callable[[str, dict[str, Any]], Awaitable[None]]


class EventBus:
    """
    Async publish/subscribe event bus.

    - Handlers are async functions: ``async def h(payload: dict) -> None``
    - All handlers for an event run concurrently via asyncio.gather
    - Handler errors are logged but never propagate to the emitter
    - Middleware runs before handlers (useful for logging / tracing)
    """

    def __init__(self) -> None:
        self._handlers: dict[str, list[tuple[int, Handler]]] = defaultdict(list)
        self._middleware: list[Middleware] = []

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def on(self, event: str, priority: int = 0) -> Callable[[Handler], Handler]:
        """
        Decorator to subscribe *handler* to *event*.

        Higher *priority* = called first within an event.

        Example::

            @bus.on("kb.file.ingested")
            async def on_ingested(payload: dict) -> None: ...
        """
        def decorator(fn: Handler) -> Handler:
            self._handlers[event].append((priority, fn))
            self._handlers[event].sort(key=lambda t: t[0], reverse=True)
            logger.debug("Subscribed %s to '%s' (priority=%d)", fn.__name__, event, priority)
            return fn
        return decorator

    def subscribe(self, event: str, handler: Handler, priority: int = 0) -> None:
        """Programmatically subscribe *handler* to *event*."""
        self._handlers[event].append((priority, handler))
        self._handlers[event].sort(key=lambda t: t[0], reverse=True)

    def unsubscribe(self, event: str, handler: Handler) -> None:
        """Remove all registrations of *handler* from *event*."""
        self._handlers[event] = [
            (p, h) for p, h in self._handlers[event] if h is not handler
        ]

    def add_middleware(self, middleware: Middleware) -> None:
        """
        Add a middleware that runs before all handlers for every event.
        Useful for structured logging, distributed tracing, metrics.
        """
        self._middleware.append(middleware)

    # ------------------------------------------------------------------
    # Emission
    # ------------------------------------------------------------------

    async def emit(self, event: str, payload: dict[str, Any] | None = None) -> None:
        """
        Emit *event* with optional *payload* dict.

        All middleware and then all handlers run concurrently.
        Individual errors are logged but never abort the emit.
        """
        payload = payload or {}

        # Run middleware first (sequentially — order matters)
        for mw in self._middleware:
            try:
                await mw(event, payload)
            except Exception as exc:
                logger.error("Middleware error on '%s': %s", event, exc, exc_info=exc)

        handlers = [h for _, h in self._handlers.get(event, [])]
        if not handlers:
            logger.debug("Event '%s' emitted with no subscribers", event)
            return

        logger.debug("Emitting '%s' to %d handler(s)", event, len(handlers))

        results = await asyncio.gather(
            *[h(payload) for h in handlers],
            return_exceptions=True,
        )

        for handler, result in zip(handlers, results, strict=False):
            if isinstance(result, Exception):
                logger.error(
                    "Handler '%s' raised on event '%s': %s",
                    handler.__name__, event, result, exc_info=result,
                )

    async def emit_typed(self, event_obj: Any) -> None:
        """
        Emit a typed BaseEvent subclass.

        Converts the event to a dict and uses its ``event_name`` attribute
        as the topic. This is the preferred way to emit events.

        Example::

            await bus.emit_typed(FileIngestedEvent(kb_id="x", file_id="y"))
        """
        from backend.events.types import BaseEvent
        if not isinstance(event_obj, BaseEvent):
            raise TypeError(f"Expected BaseEvent subclass, got {type(event_obj)}")
        await self.emit(event_obj.event_name, event_obj.to_dict())

    def emit_sync(self, event: str, payload: dict[str, Any] | None = None) -> None:
        """
        Schedule an async emit from synchronous code.
        Requires a running event loop.
        """
        loop = asyncio.get_event_loop()
        loop.create_task(self.emit(event, payload))

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    def listeners(self, event: str) -> list[str]:
        """Return handler names for *event*."""
        return [h.__name__ for _, h in self._handlers.get(event, [])]

    def all_events(self) -> list[str]:
        """Return all event names that have at least one subscriber."""
        return [e for e, handlers in self._handlers.items() if handlers]


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
bus = EventBus()


# ---------------------------------------------------------------------------
# Built-in logging middleware (active in DEBUG level only)
# ---------------------------------------------------------------------------

async def _debug_logging_middleware(event: str, payload: dict[str, Any]) -> None:
    logger.debug("EVENT %s | payload keys: %s", event, list(payload.keys()))


bus.add_middleware(_debug_logging_middleware)
