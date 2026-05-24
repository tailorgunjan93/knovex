"""
Settings API Router

Endpoints:
  GET  /api/settings                 — Get current settings (keys masked)
  PUT  /api/settings                 — Update settings
  POST /api/settings/test-llm        — Test LLM connection
  GET  /api/settings/ollama/detect   — Probe for running Ollama
  GET  /api/settings/llm/models      — Get model catalogue for a provider
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, HTTPException, Query

from backend.core.llm_service import llm_service
from backend.core.settings_service import settings_service
from backend.models.schemas import (
    AppSettingsResponse,
    AppSettingsUpdate,
    LLMModelsResponse,
    OllamaDetectResponse,
    TestLLMResponse,
)

logger = logging.getLogger("knovex.api.settings")

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /api/settings
# ---------------------------------------------------------------------------

@router.get(
    "/settings",
    response_model=AppSettingsResponse,
    summary="Get current settings (keys masked)",
)
async def get_settings() -> AppSettingsResponse:
    """Return the current user settings with all API keys masked."""
    return await settings_service.get_masked()


# ---------------------------------------------------------------------------
# PUT /api/settings
# ---------------------------------------------------------------------------

@router.put(
    "/settings",
    response_model=AppSettingsResponse,
    summary="Update settings",
)
async def update_settings(body: AppSettingsUpdate) -> AppSettingsResponse:
    """
    Merge the provided fields into current settings and persist.

    Keys in the request are real (unmasked); response returns masked values.
    """
    patch: dict = {}

    if body.llm is not None:
        patch["llm"] = body.llm.model_dump(exclude_none=True)
    if body.search is not None:
        patch["search"] = body.search.model_dump(exclude_none=True)
    if body.theme is not None:
        patch["theme"] = body.theme
    if body.kb_storage_path is not None:
        patch["kb_storage_path"] = body.kb_storage_path

    if not patch:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    return await settings_service.update(patch)


# ---------------------------------------------------------------------------
# POST /api/settings/test-llm
# ---------------------------------------------------------------------------

@router.post(
    "/settings/test-llm",
    response_model=TestLLMResponse,
    summary="Test LLM connection",
)
async def test_llm() -> TestLLMResponse:
    """
    Send a minimal test message using the currently configured LLM settings.

    Returns success=True and round-trip latency, or success=False with an
    error message so the Settings UI can show pass/fail clearly.
    """
    current = await settings_service.get()  # plaintext keys
    llm = current.llm

    return await llm_service.test_connection(
        provider=llm.provider,
        model=llm.model,
        api_key=llm.api_key,
        base_url=llm.base_url,
        aws_region=llm.aws_region,
        aws_access_key_id=llm.aws_access_key_id,
        aws_secret_access_key=llm.aws_secret_access_key,
    )


# ---------------------------------------------------------------------------
# GET /api/settings/ollama/detect
# ---------------------------------------------------------------------------

@router.get(
    "/settings/ollama/detect",
    response_model=OllamaDetectResponse,
    summary="Auto-detect running Ollama instance",
)
async def detect_ollama() -> OllamaDetectResponse:
    """
    Probe localhost:11434 for a running Ollama instance.
    Returns detected=True and the list of installed models if found.
    """
    base_url = "http://localhost:11434"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{base_url}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m["name"] for m in data.get("models", [])]
                return OllamaDetectResponse(
                    detected=True, url=base_url, models=models
                )
    except Exception as exc:
        logger.debug("Ollama detection failed: %s", exc)

    return OllamaDetectResponse(detected=False)


# ---------------------------------------------------------------------------
# GET /api/settings/llm/models
# ---------------------------------------------------------------------------

@router.get(
    "/settings/llm/models",
    response_model=LLMModelsResponse,
    summary="Get available models for a provider",
)
async def get_llm_models(
    provider: str = Query(..., description="Provider name: openai | anthropic | groq | gemini | cerebras | bedrock | ollama"),
) -> LLMModelsResponse:
    """
    Return the static model catalogue for *provider*.

    For Ollama, also probes localhost:11434 and merges installed models.
    """
    response = llm_service.get_models(provider)

    if provider.lower() == "ollama":
        current = await settings_service.get()
        base_url = current.llm.base_url or "http://localhost:11434"
        ollama_models = await llm_service.get_ollama_models(base_url)
        if ollama_models:
            from backend.models.schemas import LLMModelInfo
            response.models = [
                LLMModelInfo(
                    id=f"ollama/{m}",
                    name=m,
                    context_window=0,
                )
                for m in ollama_models
            ]

    return response
