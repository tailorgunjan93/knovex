"""
In-Process Event Bus

A lightweight publish/subscribe event bus for decoupling backend services.
Services emit events; listeners react without tight coupling.

Usage::

    from backend.events.bus import bus

    # Subscribe (typically at module load time)
    @bus.on("kb.file.ingested")
    async def on_ingested(payload: dict) -> None:
        print(f"File ingested: {payload['file_id']}")

    # Emit (from a service)
    await bus.emit("kb.file.ingested", {"kb_id": "...", "file_id": "..."})

Known event names
-----------------
kb.created              KB was created
kb.deleted              KB was deleted
kb.file.added           File added to KB (status=pending)
kb.file.ingested        File ingested successfully (status=ready)
kb.file.stale           File content hash changed (status=stale)
kb.file.missing         File path no longer exists (status=missing)
kb.file.error           Ingestion failed (status=error)
kb.reindex.started      Full KB re-index started
kb.reindex.done         Full KB re-index completed
settings.changed        App settings updated
learn.session.complete  Learn session completed (XP awarded)
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any, Awaitable, Callable

logger = logging.getLogger("knovex.events")

# Type alias for async event handlers
Handler = Callable[[dict[str, Any]], Awaitable[None]]


class EventBus:
    """
    Simple in-process async event bus.

    Handlers are coroutine functions that receive a single ``payload`` dict.
    All registered handlers for an event are called concurrently via
    ``asyncio.gather``.
    """

    def __init__(self) -> None:
        self._handlers: dict[str, list[Handler]] = defaultdict(list)

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def on(self, event: str) -> Callable[[Handler], Handler]:
        """
        Decorator to register an async handler for *event*.

        Example::

            @bus.on("kb.file.ingested")
            async def handle_ingested(payload: dict) -> None:
                ...
        """
        def decorator(fn: Handler) -> Handler:
            self._handlers[event].append(fn)
            logger.debug("Registered handler %s for event '%s'", fn.__name__, event)
            return fn

        return decorator

    def subscribe(self, event: str, handler: Handler) -> None:
        """Programmatically subscribe *handler* to *event*."""
        self._handlers[event].append(handler)
        logger.debug("Subscribed %s to event '%s'", handler.__name__, event)

    def unsubscribe(self, event: str, handler: Handler) -> None:
        """Remove a previously registered handler."""
        try:
            self._handlers[event].remove(handler)
        except ValueError:
            pass

    # ------------------------------------------------------------------
    # Emission
    # ------------------------------------------------------------------

    async def emit(self, event: str, payload: dict[str, Any] | None = None) -> None:
        """
        Emit *event* with optional *payload*.

        All handlers are awaited concurrently. Exceptions in individual
        handlers are logged but do not prevent other handlers from running.
        """
        handlers = self._handlers.get(event, [])
        if not handlers:
            logger.debug("Event '%s' emitted with no subscribers", event)
            return

        payload = payload or {}
        logger.debug("Emitting event '%s' to %d handler(s)", event, len(handlers))

        results = await asyncio.gather(
            *[h(payload) for h in handlers],
            return_exceptions=True,
        )

        for handler, result in zip(handlers, results):
            if isinstance(result, Exception):
                logger.error(
                    "Handler %s raised on event '%s': %s",
                    handler.__name__,
                    event,
                    result,
                    exc_info=result,
                )

    def emit_sync(self, event: str, payload: dict[str, Any] | None = None) -> None:
        """
        Fire-and-forget emit from synchronous code.

        Schedules the async emit on the running event loop.
        Raises ``RuntimeError`` if no event loop is running.
        """
        loop = asyncio.get_event_loop()
        loop.create_task(self.emit(event, payload))

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    def listeners(self, event: str) -> list[str]:
        """Return the names of all registered handlers for *event*."""
        return [h.__name__ for h in self._handlers.get(event, [])]

    def all_events(self) -> list[str]:
        """Return all event names that have at least one listener."""
        return [e for e, handlers in self._handlers.items() if handlers]


# ---------------------------------------------------------------------------
# Singleton — import this everywhere
# ---------------------------------------------------------------------------
bus = EventBus()
