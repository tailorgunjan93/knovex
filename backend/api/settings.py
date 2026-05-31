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
    EmbeddingModelStatus,
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
        # exclude_unset=True: only include fields the caller explicitly provided.
        # This prevents default empty strings from overwriting stored encrypted keys
        # when the user saves settings without entering a new API key.
        patch["llm"] = body.llm.model_dump(exclude_unset=True)
    if body.search is not None:
        patch["search"] = body.search.model_dump(exclude_unset=True)
    if body.embedding is not None:
        patch["embedding"] = body.embedding.model_dump(exclude_unset=True)
    if body.theme is not None:
        patch["theme"] = body.theme
    if body.kb_storage_path is not None:
        patch["kb_storage_path"] = body.kb_storage_path
    if body.display_name is not None:
        patch["display_name"] = body.display_name
    if body.onboarded is not None:
        patch["onboarded"] = body.onboarded

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
    api_key: str = Query(
        default="",
        description="Optional API key override — used by the UI refresh button "
                    "to fetch live models before the key has been saved.",
    ),
) -> LLMModelsResponse:
    """
    Return the model catalogue for *provider*.
    For Ollama, also probes localhost:11434 for installed models.
    For Cerebras/Groq, fetches the live model list when an api_key is available.
    """
    current = await settings_svc.get()
    base_url = current.llm.base_url if provider.lower() == "ollama" else ""

    # Only reuse the stored key when it belongs to the same provider that is being
    # queried.  Using a different provider's key (e.g. an OpenAI key when the user
    # switches to Cerebras in the UI) causes live-fetch to fail with 401, silently
    # falling back to the stale static catalogue — which is the root cause of the
    # "not fetching new models" bug.
    stored_key = (
        current.llm.api_key
        if current.llm.provider.lower() == provider.lower()
        else ""
    )
    effective_key = api_key or stored_key

    credentials = ProviderCredentials(
        api_key=effective_key,
        base_url=current.llm.base_url,
        aws_region=current.llm.aws_region,
        aws_access_key_id=current.llm.aws_access_key_id,
        aws_secret_access_key=current.llm.aws_secret_access_key,
    )
    return await llm_svc.get_models(provider, base_url=base_url, credentials=credentials)


# ---------------------------------------------------------------------------
# GET /api/settings/embedding/model-status
# ---------------------------------------------------------------------------

@router.get(
    "/settings/embedding/model-status",
    response_model=EmbeddingModelStatus,
    summary="Check if the local ONNX embedding model is downloaded",
)
async def get_embedding_model_status() -> EmbeddingModelStatus:
    """Return whether the local all-MiniLM-L6-v2 ONNX model is ready."""
    from backend.adapters.embedder import _model_dir, model_files_ready
    d = _model_dir()
    return EmbeddingModelStatus(
        ready=model_files_ready(),
        model_dir=str(d),
    )


# ---------------------------------------------------------------------------
# POST /api/settings/embedding/download-model
# ---------------------------------------------------------------------------

_download_progress: dict = {"running": False, "downloaded": 0, "total": 0, "error": ""}


@router.post(
    "/settings/embedding/download-model",
    summary="Trigger download of the local ONNX embedding model",
)
async def download_embedding_model() -> dict:
    """
    Start a background download of all-MiniLM-L6-v2 (~45 MB from HuggingFace).
    Returns immediately; poll /model-status to check readiness.
    """
    import asyncio

    from backend.adapters.embedder import download_model, model_files_ready

    if model_files_ready():
        return {"status": "already_ready"}

    if _download_progress["running"]:
        return {"status": "already_downloading"}

    async def _run():
        _download_progress["running"] = True
        _download_progress["error"] = ""
        try:
            loop = asyncio.get_event_loop()
            def _progress(dl, total):
                _download_progress["downloaded"] = dl
                _download_progress["total"] = total
            await loop.run_in_executor(None, lambda: download_model(progress_cb=_progress))
            logger.info("ONNX model download complete")
        except Exception as exc:
            logger.error("ONNX model download failed: %s", exc)
            _download_progress["error"] = str(exc)
        finally:
            _download_progress["running"] = False

    asyncio.create_task(_run())
    return {"status": "started"}


@router.get(
    "/settings/embedding/download-progress",
    summary="Get ONNX model download progress",
)
async def get_download_progress() -> dict:
    """Poll download progress: {running, downloaded, total, error}."""
    from backend.adapters.embedder import model_files_ready
    return {**_download_progress, "ready": model_files_ready()}
