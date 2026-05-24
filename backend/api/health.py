"""
Health API Router

DIP: uses Depends(get_settings_service) — not the singleton directly.
SRP: only responsible for assembling the health response.
     Ollama probe is delegated to the Ollama provider.
"""

from __future__ import annotations

import importlib.metadata
import logging

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from backend.core.config import settings

logger = logging.getLogger("knovex.api.health")

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str
    docnest_version: str
    ollama_detected: bool
    ollama_url: str | None = None


@router.get("/health", response_model=HealthResponse, summary="Health check")
async def health() -> HealthResponse:
    """
    Return backend health status.

    Called by the Electron main process after spawning the backend to know
    when the API is ready to accept requests.  Also used as a liveness probe.
    """
    # Resolve docnest version
    try:
        docnest_version = importlib.metadata.version("docnest-ai")
    except importlib.metadata.PackageNotFoundError:
        docnest_version = "not installed"

    # Probe Ollama via the registered provider (avoids duplicating probe logic)
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
        # If providers haven't been registered yet (e.g. cold import), fall back
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                resp = await client.get("http://localhost:11434/api/tags")
                if resp.status_code == 200:
                    ollama_detected = True
                    ollama_url = "http://localhost:11434"
        except Exception:
            pass

    return HealthResponse(
        status="ok",
        version=settings.version,
        docnest_version=docnest_version,
        ollama_detected=ollama_detected,
        ollama_url=ollama_url,
    )
