"""
Settings API Router

DIP: all services are injected via Depends() — routes never import singletons.
SRP: routes only orchestrate request/response conversion. Business logic lives
     in SettingsService and LLMService.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from backend.core.dependencies import LLMServiceDep, SettingsServiceDep
from backend.core.providers.base import ProviderCredentials
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
async def get_settings(
    settings_svc: SettingsServiceDep,
) -> AppSettingsResponse:
    """Return current settings with all API keys masked for display."""
    return await settings_svc.get_masked()


# ---------------------------------------------------------------------------
# PUT /api/settings
# ---------------------------------------------------------------------------

@router.put(
    "/settings",
    response_model=AppSettingsResponse,
    summary="Update settings",
)
async def update_settings(
    body: AppSettingsUpdate,
    settings_svc: SettingsServiceDep,
) -> AppSettingsResponse:
    """
    Merge provided fields into current settings and persist.

    Send real (unmasked) API keys in the request body.
    The response always returns masked values.
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

    return await settings_svc.update(patch)


# ---------------------------------------------------------------------------
# POST /api/settings/test-llm
# ---------------------------------------------------------------------------

@router.post(
    "/settings/test-llm",
    response_model=TestLLMResponse,
    summary="Test LLM connection",
)
async def test_llm(
    settings_svc: SettingsServiceDep,
    llm_svc: LLMServiceDep,
) -> TestLLMResponse:
    """
    Test the currently configured LLM with a minimal request.

    Returns success=True + round-trip latency, or success=False + error message.
    The UI Settings page uses this for the "Test Connection" button.
    """
    current = await settings_svc.get()  # plaintext keys for internal use
    llm = current.llm

    credentials = ProviderCredentials(
        api_key=llm.api_key,
        base_url=llm.base_url,
        aws_region=llm.aws_region,
        aws_access_key_id=llm.aws_access_key_id,
        aws_secret_access_key=llm.aws_secret_access_key,
    )

    return await llm_svc.test_connection(
        provider=llm.provider,
        model=llm.model,
        credentials=credentials,
    )


# ---------------------------------------------------------------------------
# GET /api/settings/ollama/detect
# ---------------------------------------------------------------------------

@router.get(
    "/settings/ollama/detect",
    response_model=OllamaDetectResponse,
    summary="Auto-detect running Ollama instance",
)
async def detect_ollama(
    settings_svc: SettingsServiceDep,
    llm_svc: LLMServiceDep,
) -> OllamaDetectResponse:
    """
    Probe localhost:11434 for a running Ollama instance.
    Returns detected=True and the list of installed models if found.
    """
    current = await settings_svc.get()
    base_url = current.llm.base_url or "http://localhost:11434"

    from backend.core.providers.factory import LLMProviderFactory
    from backend.core.providers.ollama import OllamaProvider

    try:
        provider = LLMProviderFactory.create("ollama")
        if isinstance(provider, OllamaProvider):
            models = await provider.get_installed_models(base_url)
            if models:
                return OllamaDetectResponse(
                    detected=True,
                    url=base_url,
                    models=[m.id.removeprefix("ollama/") for m in models],
                )
    except Exception as exc:
        logger.debug("Ollama detect failed: %s", exc)

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
    llm_svc: LLMServiceDep,
    settings_svc: SettingsServiceDep,
    provider: str = Query(
        ...,
        description="openai | anthropic | groq | gemini | cerebras | bedrock | ollama",
    ),
) -> LLMModelsResponse:
    """
    Return the model catalogue for *provider*.
    For Ollama, also probes localhost:11434 for installed models.
    """
    current = await settings_svc.get()
    base_url = current.llm.base_url if provider.lower() == "ollama" else ""
    return await llm_svc.get_models(provider, base_url=base_url)
