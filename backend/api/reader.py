"""
Reader API Router — Sprint 3 (+ Sprint 8 upload & web search)

Endpoints:

  GET  /api/kb/{kb_id}/files/{file_id}/content?page=1
       → FileContentResponse with paginated ContentBlocks

  POST /api/kb/{kb_id}/files/{file_id}/ask
       → StreamingResponse (SSE) — token-by-token LLM answer
         Supports use_web_search=True for web-augmented Q&A

  POST /api/reader/upload
       → ReaderUploadResponse — upload a file directly to "Reader Inbox" KB

DIP: ReaderService / KBService are injected via Depends(); route handlers
     never import storage, LLM, or file I/O directly.

SRP: routes only handle HTTP concerns (request parsing, status codes,
     error translation).  All business logic lives in the respective services.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
import uuid

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from backend.core.dependencies import KBServiceDep, ReaderServiceDep, SettingsServiceDep
from backend.core.providers.base import ProviderCredentials
from backend.models.schemas import (
    FileAskRequest,
    FileContentResponse,
    KBCreate,
    ReaderUploadResponse,
)
from backend.storage.repositories.base import EntityNotFoundError
from backend.core.config import settings as app_config

logger = logging.getLogger("knovex.api.reader")

router = APIRouter()

# Name of the auto-managed KB used for browser-uploaded files
_READER_INBOX_NAME = "Reader Inbox"

# Supported upload extensions
_UPLOAD_EXTS = {".pdf", ".docx", ".txt", ".md", ".csv", ".udf"}


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

    When ``use_web_search`` is True, the answer is also augmented with
    live web search results (using the configured search engine/key).

    The response is a ``text/event-stream`` where each event is one of:

    ```
    data: {"token": "..."}

    data: [DONE]

    ```

    Errors are reported as ``data: {"error": "..."}`` before ``[DONE]``.

    HTTP status codes:
      - **200** OK — streaming starts immediately (error may appear in stream)
      - **404** File not found in this KB
      - **400** File not yet ready for Q&A
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

    try:
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
            search_engine=current.search.engine,
            search_api_key=current.search.api_key,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# POST /api/reader/upload
# ---------------------------------------------------------------------------

@router.post(
    "/reader/upload",
    response_model=ReaderUploadResponse,
    summary="Upload a file to Reader Inbox KB for immediate reading",
)
async def upload_reader_file(
    file: UploadFile = File(...),
    kb_svc: KBServiceDep = ...,  # type: ignore[assignment]  — filled by FastAPI DI
) -> ReaderUploadResponse:
    """
    Accept a multipart file upload, save it permanently to the Reader uploads
    directory, and register it in the "Reader Inbox" Knowledge Base.

    The file is ingested asynchronously. Poll
    ``GET /api/kb/{kb_id}/files/{file_id}/status`` until
    ``status == "ready"`` before opening the file viewer.

    Supported formats: PDF, DOCX, TXT, MD, CSV, UDF.

    HTTP status codes:
      - **200** OK — file registered; ingestion started
      - **400** Unsupported file format or missing filename
      - **500** Storage error
    """
    filename = file.filename or "upload"
    suffix = os.path.splitext(filename)[1].lower()

    if not suffix or suffix not in _UPLOAD_EXTS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type: '{suffix or '(none)'}'. "
                f"Supported: {', '.join(sorted(_UPLOAD_EXTS))}"
            ),
        )

    # ── 1. Persist uploaded bytes to a stable location ───────────────────────
    upload_dir = app_config.data_dir / "reader_uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Use a UUID sub-directory so same-named files never collide
    slot_dir = upload_dir / str(uuid.uuid4())
    slot_dir.mkdir(parents=True, exist_ok=True)
    dest_path = slot_dir / filename

    try:
        contents = await file.read()
        dest_path.write_bytes(contents)
    except Exception as exc:
        logger.exception("Failed to save uploaded file: %s", exc)
        raise HTTPException(status_code=500, detail=f"Storage error: {exc}") from exc

    # ── 2. Find or create the "Reader Inbox" KB ───────────────────────────────
    all_kbs = await kb_svc.list_kbs()
    inbox_kb = next(
        (kb for kb in all_kbs.kbs if kb.name == _READER_INBOX_NAME),
        None,
    )
    if inbox_kb is None:
        inbox_kb = await kb_svc.create_kb(
            KBCreate(name=_READER_INBOX_NAME, color="#0EA5E9", icon="upload")
        )
        logger.info("Created Reader Inbox KB: %s", inbox_kb.id)

    # ── 3. Add file to KB (triggers background ingestion) ────────────────────
    from backend.models.schemas import FileAddRequest

    try:
        file_rec = await kb_svc.add_file(inbox_kb.id, FileAddRequest(file_path=str(dest_path)))
    except ValueError as exc:
        # e.g. duplicate file already in KB — gracefully reuse it
        logger.info("Upload duplicate detected: %s — searching existing record", exc)
        files = await kb_svc.list_files(inbox_kb.id)
        existing = next(
            (f for f in files.files if f.name == filename),
            None,
        )
        if existing:
            return ReaderUploadResponse(
                kb_id=inbox_kb.id,
                file_id=existing.id,
                name=existing.name,
                format=existing.format,
                status=existing.status,
            )
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    logger.info(
        "Reader upload: file=%s kb=%s file_id=%s",
        filename, inbox_kb.id, file_rec.id,
    )

    return ReaderUploadResponse(
        kb_id=inbox_kb.id,
        file_id=file_rec.id,
        name=file_rec.name,
        format=file_rec.format,
        status=file_rec.status,
    )
