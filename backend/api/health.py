"""
Health API Router

DIP: uses IHttpClient via Depends() for the fallback Ollama probe — never
     imports httpx directly.
SRP: only responsible for assembling the health response.
     Ollama probe is delegated to the Ollama provider (primary path) or
     IHttpClient (fallback when providers aren't registered yet).
"""

from __future__ import annotations

import importlib.metadata
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.adapters.http_client import IHttpClient
from backend.core.config import settings
from backend.core.dependencies import get_http_client

logger = logging.getLogger("knovex.api.health")

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str
    docnest_version: str
    ollama_detected: bool
    ollama_url: str | None = None


@router.get("/health", response_model=HealthResponse, summary="Health check")
async def health(
    http_client: IHttpClient = Depends(get_http_client),
) -> HealthResponse:
    """
    Return backend health status.

    Called by the Electron main process after spawning the backend to know
    when the API is ready to accept requests. Also used as a liveness probe.
    """
    # Resolve docnest version
    try:
        docnest_version = importlib.metadata.version("docnest-ai")
    except importlib.metadata.PackageNotFoundError:
        docnest_version = "not installed"

    # Probe Ollama — primary path via registered provider
    ollama_detected = False
    ollama_url: str | None = None

    try:
        from backend.core.providers.factory import LLMProviderFactory
        from backend.core.providers.ollama import OllamaProvider
        provider = LLMProviderFactory.create("ollama")
        if isinstance(provider, OllamaProvider):
            models = await provider.get_installed_models()
            if models:
                ollama_detected = True
                ollama_url = "http://localhost:11434"
    except Exception:
        # Fallback: probe directly via IHttpClient
        # (providers may not be registered yet on a cold start)
        try:
            resp = await http_client.get(
                "http://localhost:11434/api/tags",
                timeout=1.5,
            )
            if resp.ok:
                ollama_detected = True
                ollama_url = "http://localhost:11434"
        except (TimeoutError, ConnectionError):
            pass  # Ollama simply isn't running

    return HealthResponse(
        status="ok",
        version=settings.version,
        docnest_version=docnest_version,
        ollama_detected=ollama_detected,
        ollama_url=ollama_url,
    )
