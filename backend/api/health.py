"""
Health API Router

Endpoint: GET /api/health
Returns: backend status, app version, docnest version, Ollama detection.
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
    when the API is ready to accept requests.
    """
    # Resolve docnest version
    try:
        docnest_version = importlib.metadata.version("docnest-ai")
    except importlib.metadata.PackageNotFoundError:
        docnest_version = "not installed"

    # Probe Ollama
    ollama_detected = False
    ollama_url: str | None = None
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
