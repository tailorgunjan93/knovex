"""
Summariser API Router — Sprint 4

Endpoints:
  POST /api/summarize/file   — Stream a file summary (SSE)
  POST /api/summarize/kb     — Stream a KB summary (SSE)

Both return text/event-stream using the same SSE protocol as Chat:
  {"type": "token",  "content": "..."}
  {"type": "done",   "subject": "..."}
  {"type": "error",  "error":   "..."}
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.core.dependencies import SettingsServiceDep, SummariserServiceDep
from backend.core.providers.base import ProviderCredentials
from backend.models.schemas import SummarizeFileRequest, SummarizeKBRequest
from backend.storage.repositories.base import EntityNotFoundError

logger = logging.getLogger("knovex.api.summarizer")

router = APIRouter()


@router.post(
    "/summarize/file",
    summary="Summarise a single file (SSE streaming)",
)
async def summarize_file(
    body: SummarizeFileRequest,
    summariser_svc: SummariserServiceDep,
    settings_svc: SettingsServiceDep,
) -> StreamingResponse:
    """
    Stream an AI-generated summary of a single file's indexed content.

    **length**: ``brief`` (~150 words) or ``detailed`` (~600 words, with bullets).
    """
    current = await settings_svc.get()
    llm = current.llm
    credentials = ProviderCredentials(
        api_key=llm.api_key,
        base_url=llm.base_url,
        aws_region=llm.aws_region,
        aws_access_key_id=llm.aws_access_key_id,
        aws_secret_access_key=llm.aws_secret_access_key,
    )

    # Validate before opening the stream (raises 404/400 → clean HTTP error)
    try:
        gen = await summariser_svc.summarise_file(
            kb_id=body.kb_id,
            file_id=body.file_id,
            length=body.length,
            provider=llm.provider,
            model=llm.model,
            credentials=credentials,
        )
    except EntityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post(
    "/summarize/kb",
    summary="Summarise an entire knowledge base (SSE streaming)",
)
async def summarize_kb(
    body: SummarizeKBRequest,
    summariser_svc: SummariserServiceDep,
    settings_svc: SettingsServiceDep,
) -> StreamingResponse:
    """Stream an AI-generated summary of all indexed content in a KB."""
    current = await settings_svc.get()
    llm = current.llm
    credentials = ProviderCredentials(
        api_key=llm.api_key,
        base_url=llm.base_url,
        aws_region=llm.aws_region,
        aws_access_key_id=llm.aws_access_key_id,
        aws_secret_access_key=llm.aws_secret_access_key,
    )

    gen = await summariser_svc.summarise_kb(
        kb_id=body.kb_id,
        length=body.length,
        provider=llm.provider,
        model=llm.model,
        credentials=credentials,
    )

    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
