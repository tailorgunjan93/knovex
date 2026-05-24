"""
HTTP Client Adapter — wraps httpx

Only this file is allowed to import httpx.
All callers (health check, Ollama probe, future web-search) depend on
IHttpClient (the interface), never on httpx directly.

Interfaces:
    IHttpClient   — get() → HttpResponse
    HttpResponse  — status_code, text, json()

Implementations:
    HttpxAdapter  — delegates to httpx.AsyncClient
    StubHttpClient — deterministic stub for tests

Pattern: Adapter (GoF) + Value Object (HttpResponse)
"""

from __future__ import annotations

import json as _json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("knovex.adapters.http")


# ---------------------------------------------------------------------------
# Value object returned by every HTTP call
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class HttpResponse:
    """
    Immutable HTTP response value object.

    Decouples callers from any specific HTTP library response type.
    The adapter converts library-specific responses to this type.
    """

    status_code: int
    text: str

    @property
    def ok(self) -> bool:
        """True when status_code is in the 2xx range."""
        return 200 <= self.status_code < 300

    def json(self) -> Any:
        """Parse response text as JSON. Raises ValueError on invalid JSON."""
        return _json.loads(self.text)


# ---------------------------------------------------------------------------
# Interface
# ---------------------------------------------------------------------------

class IHttpClient(ABC):
    """
    Minimal async HTTP client interface.

    Only GET is modelled for now; POST and other verbs can be added
    without changing any existing callers (OCP).
    """

    @abstractmethod
    async def get(
        self,
        url: str,
        *,
        timeout: float = 5.0,
        headers: dict[str, str] | None = None,
    ) -> HttpResponse:
        """
        Perform a GET request.

        Returns an ``HttpResponse``; never raises on non-2xx status
        (callers inspect ``response.status_code`` or ``response.ok``).
        Raises ``ConnectionError`` / ``TimeoutError`` when the server is
        unreachable.
        """
        ...

    @abstractmethod
    async def post(
        self,
        url: str,
        *,
        json: Any = None,
        timeout: float = 10.0,
        headers: dict[str, str] | None = None,
    ) -> HttpResponse:
        """
        Perform a POST request with an optional JSON body.
        """
        ...


# ---------------------------------------------------------------------------
# httpx implementation
# ---------------------------------------------------------------------------

class HttpxAdapter(IHttpClient):
    """
    Adapter over ``httpx.AsyncClient``.

    Creates a fresh client per request (keeps it simple for a
    single-user desktop app; a shared client pool can be added later
    by overriding ``_get_client()``).
    """

    async def get(
        self,
        url: str,
        *,
        timeout: float = 5.0,
        headers: dict[str, str] | None = None,
    ) -> HttpResponse:
        import httpx  # only import site

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(url, headers=headers or {})
                return HttpResponse(status_code=resp.status_code, text=resp.text)
        except httpx.TimeoutException as exc:
            logger.debug("HTTP GET timeout: %s — %s", url, exc)
            raise TimeoutError(f"Request to {url} timed out ({timeout}s)") from exc
        except httpx.RequestError as exc:
            logger.debug("HTTP GET error: %s — %s", url, exc)
            raise ConnectionError(f"Cannot reach {url}: {exc}") from exc

    async def post(
        self,
        url: str,
        *,
        json: Any = None,
        timeout: float = 10.0,
        headers: dict[str, str] | None = None,
    ) -> HttpResponse:
        import httpx  # only import site

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, json=json, headers=headers or {})
                return HttpResponse(status_code=resp.status_code, text=resp.text)
        except httpx.TimeoutException as exc:
            raise TimeoutError(f"Request to {url} timed out ({timeout}s)") from exc
        except httpx.RequestError as exc:
            raise ConnectionError(f"Cannot reach {url}: {exc}") from exc


# ---------------------------------------------------------------------------
# Stub for tests
# ---------------------------------------------------------------------------

class StubHttpClient(IHttpClient):
    """
    Deterministic stub for unit tests.

    Callers pre-load responses by URL; any un-preloaded URL returns 200
    with empty text by default.

    Usage in tests::

        stub = StubHttpClient()
        stub.set_response("http://localhost:11434/api/tags", 200, '{"models":[]}')
        # now inject stub wherever IHttpClient is expected
    """

    def __init__(self) -> None:
        self._responses: dict[str, HttpResponse] = {}

    def set_response(self, url: str, status_code: int, text: str = "") -> None:
        """Pre-register a canned response for *url*."""
        self._responses[url] = HttpResponse(status_code=status_code, text=text)

    async def get(
        self,
        url: str,
        *,
        timeout: float = 5.0,
        headers: dict[str, str] | None = None,
    ) -> HttpResponse:
        return self._responses.get(url, HttpResponse(status_code=200, text=""))

    async def post(
        self,
        url: str,
        *,
        json: Any = None,
        timeout: float = 10.0,
        headers: dict[str, str] | None = None,
    ) -> HttpResponse:
        return self._responses.get(url, HttpResponse(status_code=200, text=""))
