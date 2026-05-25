"""
Reader API Router — Sprint 3

Exposes two endpoints per file:

  GET  /api/kb/{kb_id}/files/{file_id}/content?page=1
       → FileContentResponse with paginated ContentBlocks

  POST /api/kb/{kb_id}/files/{file_id}/ask
       → StreamingResponse (SSE) — token-by-token LLM answer

DIP: ReaderService is injected via Depends(); route handlers
     never import storage, LLM, or file I/O directly.

SRP: routes only handle HTTP concerns (request parsing, status codes,
     error translation).  All business logic lives in ReaderService.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from backend.core.dependencies import ReaderServiceDep, SettingsServiceDep
from backend.core.providers.base import ProviderCredentials
from backend.models.schemas import FileAskRequest, FileContentResponse
from backend.storage.repositories.base import EntityNotFoundError

logger = logging.getLogger("knovex.api.reader")

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /api/kb/{kb_id}/files/{file_id}/content
# ---------------------------------------------------------------------------

@router.get(
    "/kb/{kb_id}/files/{file_id}/content",
    response_model=FileContentResponse,
    summary="Render file content as structured blocks",
)
async def get_file_content(
    kb_id: str,
    file_id: str,
    reader_svc: ReaderServiceDep,
    page: int = Query(default=1, ge=1, description="Page number (1-based)"),
) -> FileContentResponse:
    """
    Return a paginated view of a file's content as ContentBlocks.

    Block types by format:
      - **txt / md**  → paragraph, heading
      - **csv**       → heading (header row), table_row
      - **pdf**       → page  (one block per PDF page; ``page`` maps directly)
      - **docx**      → heading, paragraph
      - **udf**       → paragraph (raw-text fallback)

    ``total_pages`` in the response indicates how many pages are available.

    HTTP status codes:
      - **200** OK
      - **404** File not found in this KB
      - **400** File not yet ingested (status ≠ ready / stale)
    """
    try:
        return await reader_svc.get_content(kb_id, file_id, page=page)
    except EntityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# POST /api/kb/{kb_id}/files/{file_id}/ask
# ---------------------------------------------------------------------------

@router.post(
    "/kb/{kb_id}/files/{file_id}/ask",
    summary="Ask a question about a file (SSE streaming)",
    response_description="Server-Sent Events stream of LLM tokens",
)
async def ask_file(
    kb_id: str,
    file_id: str,
    body: FileAskRequest,
    reader_svc: ReaderServiceDep,
    settings_svc: SettingsServiceDep,
) -> StreamingResponse:
    """
    Stream an LLM answer grounded in the file's indexed content via SSE.

    The response is a ``text/event-stream`` where each event is one of:

    ```
    data: {"token": "..."}

    data: [DONE]

    ```

    Errors (e.g., invalid file) are reported as ``data: {"error": "..."}``
    before ``[DONE]``.

    The active LLM provider/model/credentials are read from the user's
    saved settings, so no extra auth params are needed in the request body.

    HTTP status codes:
      - **200** OK — streaming starts immediately (error may appear in stream)
      - **404** File not found in this KB
      - **400** File not yet ready for Q&A
    """
    # Resolve LLM config from persisted settings (plaintext for internal use)
    current = await settings_svc.get()
    llm = current.llm
    credentials = ProviderCredentials(
        api_key=llm.api_key,
        base_url=llm.base_url,
        aws_region=llm.aws_region,
        aws_access_key_id=llm.aws_access_key_id,
        aws_secret_access_key=llm.aws_secret_access_key,
    )

    # Validate file exists before starting the stream (404/400 before headers)
    try:
        # Trigger validation only — result not needed here
        await reader_svc._require_file(kb_id, file_id)  # noqa: SLF001
    except EntityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return StreamingResponse(
        reader_svc.ask(
            kb_id=kb_id,
            file_id=file_id,
            req=body,
            provider=llm.provider,
            model=llm.model,
            credentials=credentials,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # Disable nginx buffering if proxied
        },
    )
