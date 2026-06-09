"""
Chat API Router — Sprint 4

Endpoints:
  POST   /api/chat/sessions                            Create session
  GET    /api/chat/sessions                            List sessions
  GET    /api/chat/sessions/{session_id}               Get session
  PATCH  /api/chat/sessions/{session_id}               Rename session
  DELETE /api/chat/sessions/{session_id}               Delete session
  GET    /api/chat/sessions/{session_id}/messages      Get messages
  POST   /api/chat/sessions/{session_id}/stream        Stream chat (SSE)
  GET    /api/chat/sessions/{session_id}/export        Export as Markdown

DIP: ChatService injected via Depends(); routes never import storage.
SRP: routes only handle HTTP concerns; business logic in ChatService.
"""

from __future__ import annotations

import logging
import os
import tempfile

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import PlainTextResponse, StreamingResponse

from backend.core.dependencies import (
    ChatServiceDep,
    SettingsServiceDep,
)
from backend.core.providers.base import ProviderCredentials
from backend.models.schemas import (
    ChatAttachResponse,
    ChatMessageResponse,
    ChatMessagesResponse,
    ChatSessionCreate,
    ChatSessionListResponse,
    ChatSessionResponse,
    ChatStreamRequest,
)
from backend.storage.repositories.base import EntityNotFoundError

logger = logging.getLogger("knovex.api.chat")

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _handle_not_found(exc: EntityNotFoundError) -> HTTPException:
    return HTTPException(status_code=404, detail=str(exc))


def _session_to_response(session) -> ChatSessionResponse:
    return ChatSessionResponse(
        id=session.id,
        kb_id=session.kb_id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
        message_count=session.message_count,
    )


def _message_to_response(msg) -> ChatMessageResponse:
    return ChatMessageResponse(
        id=msg.id,
        role=msg.role,
        content=msg.content,
        created_at=msg.created_at,
        sources=list(msg.sources),
        web_sources=list(msg.web_sources),
    )


# ---------------------------------------------------------------------------
# Session endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/chat/sessions",
    response_model=ChatSessionResponse,
    status_code=201,
    summary="Create a chat session",
)
async def create_session(
    body: ChatSessionCreate,
    chat_svc: ChatServiceDep,
) -> ChatSessionResponse:
    """Create a new chat session, optionally scoped to a KB."""
    session = await chat_svc.create_session(
        kb_id=body.kb_id,
        title=body.title,
    )
    return _session_to_response(session)


@router.get(
    "/chat/sessions",
    response_model=ChatSessionListResponse,
    summary="List chat sessions",
)
async def list_sessions(
    chat_svc: ChatServiceDep,
    kb_id: str | None = Query(default=None, description="Filter by knowledge base ID"),
) -> ChatSessionListResponse:
    """Return all sessions, optionally filtered by KB."""
    sessions = await chat_svc.list_sessions(kb_id=kb_id)
    return ChatSessionListResponse(sessions=[_session_to_response(s) for s in sessions])


@router.get(
    "/chat/sessions/{session_id}",
    response_model=ChatSessionResponse,
    summary="Get a chat session",
)
async def get_session(
    session_id: str,
    chat_svc: ChatServiceDep,
) -> ChatSessionResponse:
    try:
        session = await chat_svc.get_session(session_id)
    except EntityNotFoundError as exc:
        raise _handle_not_found(exc) from exc
    return _session_to_response(session)


@router.patch(
    "/chat/sessions/{session_id}",
    response_model=ChatSessionResponse,
    summary="Rename a chat session",
)
async def rename_session(
    session_id: str,
    body: ChatSessionCreate,
    chat_svc: ChatServiceDep,
) -> ChatSessionResponse:
    try:
        session = await chat_svc.rename_session(session_id, body.title)
    except EntityNotFoundError as exc:
        raise _handle_not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _session_to_response(session)


@router.delete(
    "/chat/sessions/{session_id}",
    status_code=204,
    summary="Delete a chat session",
)
async def delete_session(
    session_id: str,
    chat_svc: ChatServiceDep,
) -> None:
    await chat_svc.delete_session(session_id)


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

@router.get(
    "/chat/sessions/{session_id}/messages",
    response_model=ChatMessagesResponse,
    summary="Get messages for a session",
)
async def get_messages(
    session_id: str,
    chat_svc: ChatServiceDep,
) -> ChatMessagesResponse:
    try:
        await chat_svc.get_session(session_id)  # validate exists
    except EntityNotFoundError as exc:
        raise _handle_not_found(exc) from exc
    messages = await chat_svc.get_messages(session_id)
    return ChatMessagesResponse(
        session_id=session_id,
        messages=[_message_to_response(m) for m in messages],
    )


# ---------------------------------------------------------------------------
# Streaming chat
# ---------------------------------------------------------------------------

@router.post(
    "/chat/sessions/{session_id}/stream",
    summary="Stream a chat response (SSE)",
    response_description="Server-Sent Events stream of typed events",
)
async def stream_chat(
    session_id: str,
    body: ChatStreamRequest,
    chat_svc: ChatServiceDep,
    settings_svc: SettingsServiceDep,
) -> StreamingResponse:
    """
    Stream an AI response grounded in the session's KB context.

    SSE event types:
    - ``{"type": "sources",     "sources": [...]}``  — KB citations (before tokens)
    - ``{"type": "web_sources", "sources": [...]}``  — web results (if enabled)
    - ``{"type": "token",       "content": "..."}``  — streamed token
    - ``{"type": "done",        "message_id": "..."}`` — stream complete
    - ``{"type": "error",       "error": "..."}``    — error mid-stream
    """
    # Validate session exists before opening stream
    try:
        await chat_svc.get_session(session_id)
    except EntityNotFoundError as exc:
        raise _handle_not_found(exc) from exc

    current = await settings_svc.get()
    llm = current.llm
    search = current.search
    credentials = ProviderCredentials(
        api_key=llm.api_key,
        base_url=llm.base_url,
        aws_region=llm.aws_region,
        aws_access_key_id=llm.aws_access_key_id,
        aws_secret_access_key=llm.aws_secret_access_key,
    )

    return StreamingResponse(
        chat_svc.stream_message(
            session_id=session_id,
            user_message=body.message,
            provider=llm.provider,
            model=llm.model,
            credentials=credentials,
            use_web_search=body.use_web_search,
            force_news=body.force_news,
            fetch_url=body.fetch_url,
            search_engine=search.engine,
            search_api_key=search.api_key,
            search_engines=await settings_svc.enabled_search_engines(),
            kb_ids=body.kb_ids or None,
            attached_context=body.attached_context or None,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

@router.get(
    "/chat/sessions/{session_id}/export",
    response_class=PlainTextResponse,
    summary="Export session as Markdown",
)
async def export_session(
    session_id: str,
    chat_svc: ChatServiceDep,
) -> str:
    try:
        return await chat_svc.export_session(session_id)
    except EntityNotFoundError as exc:
        raise _handle_not_found(exc) from exc


# ---------------------------------------------------------------------------
# File attachment — extract text for inline chat context
# ---------------------------------------------------------------------------

_MAX_ATTACH_CHARS = 30_000   # ≈ 7,500 tokens — keeps context window healthy


def _extract_text_from_file(path: str, suffix: str) -> str:
    """Extract plain text from a file.  Supports TXT, MD, CSV, PDF, DOCX."""
    suffix = suffix.lower()

    if suffix in (".txt", ".md", ".csv"):
        with open(path, encoding="utf-8", errors="ignore") as fh:
            return fh.read()

    if suffix == ".pdf":
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(path)
            return "\n\n".join(page.get_text() for page in doc).strip()
        except ImportError:
            return "[PDF parsing unavailable — install PyMuPDF: pip install pymupdf]"

    if suffix == ".docx":
        try:
            from docx import Document
            doc = Document(path)
            return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except ImportError:
            return "[DOCX parsing unavailable — install python-docx: pip install python-docx]"

    # Fallback: try reading as UTF-8 text
    try:
        with open(path, encoding="utf-8", errors="ignore") as fh:
            return fh.read()
    except Exception:
        return f"[Unsupported file type: {suffix}]"


@router.post(
    "/chat/attach",
    response_model=ChatAttachResponse,
    summary="Extract text from an uploaded file for use as chat context",
)
async def attach_file_for_chat(
    file: UploadFile = File(...),
) -> ChatAttachResponse:
    """
    Accept a multipart file upload, extract its text, and return it so the
    frontend can include it as ``attached_context`` in the next stream request.

    Supported: TXT, MD, CSV, PDF, DOCX.
    Text is capped at 30,000 characters (~7,500 tokens).
    """
    suffix = os.path.splitext(file.filename or "file")[1] or ".txt"

    # Write to a temp file so parsers can use the file path
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        contents = await file.read()
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        text = _extract_text_from_file(tmp_path, suffix)
    finally:
        os.unlink(tmp_path)

    truncated = len(text) > _MAX_ATTACH_CHARS
    if truncated:
        text = text[:_MAX_ATTACH_CHARS]

    return ChatAttachResponse(
        filename=file.filename or "attachment",
        text=text,
        char_count=len(text),
        truncated=truncated,
    )
