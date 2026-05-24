"""
Knowledge Base API Router

Endpoints:
  GET    /api/kb                              — list all KBs
  POST   /api/kb                              — create KB
  GET    /api/kb/{kb_id}                      — get single KB + stats
  PUT    /api/kb/{kb_id}                      — update name/color/icon
  DELETE /api/kb/{kb_id}                      — delete KB + files + chunks
  POST   /api/kb/{kb_id}/reindex              — reindex all files
  GET    /api/kb/{kb_id}/files                — list files in KB
  POST   /api/kb/{kb_id}/files               — add file by path
  GET    /api/kb/{kb_id}/files/{file_id}      — get file details
  DELETE /api/kb/{kb_id}/files/{file_id}      — remove file + chunks
  GET    /api/kb/{kb_id}/files/{file_id}/status    — ingestion status
  POST   /api/kb/{kb_id}/files/{file_id}/reindex   — re-ingest file
  PUT    /api/kb/{kb_id}/files/{file_id}/path       — update missing path

DIP: KBService is injected via Depends(); routes never import singletons.
SRP: routes only translate HTTP ↔ domain. Business logic lives in KBService.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from backend.core.dependencies import KBServiceDep
from backend.models.schemas import (
    FileAddRequest,
    FileListResponse,
    FileRecordResponse,
    FileStatusResponse,
    FileUpdatePathRequest,
    KBCreate,
    KBListResponse,
    KBResponse,
    KBUpdate,
    ReindexResponse,
)
from backend.storage.repositories.base import EntityNotFoundError

logger = logging.getLogger("knovex.api.kb")

router = APIRouter(prefix="/kb", tags=["knowledge-base"])


# ---------------------------------------------------------------------------
# Error translation helper (SRP: one place for domain → HTTP mapping)
# ---------------------------------------------------------------------------

def _handle_domain_error(exc: Exception) -> None:
    """Translate domain exceptions to HTTP exceptions."""
    if isinstance(exc, EntityNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, (FileNotFoundError, ValueError)):
        raise HTTPException(status_code=400, detail=str(exc))
    raise exc


# ---------------------------------------------------------------------------
# KB endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=KBListResponse, summary="List all Knowledge Bases")
async def list_kbs(svc: KBServiceDep) -> KBListResponse:
    """Return all knowledge bases with file count and size stats."""
    return await svc.list_kbs()


@router.post("", response_model=KBResponse, status_code=201, summary="Create a Knowledge Base")
async def create_kb(body: KBCreate, svc: KBServiceDep) -> KBResponse:
    """Create a new empty Knowledge Base."""
    try:
        return await svc.create_kb(body)
    except Exception as exc:
        _handle_domain_error(exc)


@router.get("/{kb_id}", response_model=KBResponse, summary="Get a Knowledge Base")
async def get_kb(kb_id: str, svc: KBServiceDep) -> KBResponse:
    """Return a single Knowledge Base with live stats."""
    try:
        return await svc.get_kb(kb_id)
    except Exception as exc:
        _handle_domain_error(exc)


@router.put("/{kb_id}", response_model=KBResponse, summary="Update a Knowledge Base")
async def update_kb(kb_id: str, body: KBUpdate, svc: KBServiceDep) -> KBResponse:
    """Update the name, colour, and/or icon of a Knowledge Base."""
    try:
        return await svc.update_kb(kb_id, body)
    except Exception as exc:
        _handle_domain_error(exc)


@router.delete(
    "/{kb_id}",
    status_code=204,
    summary="Delete a Knowledge Base",
)
async def delete_kb(kb_id: str, svc: KBServiceDep) -> None:
    """
    Permanently delete a Knowledge Base and all associated files and chunks.
    This action cannot be undone.
    """
    try:
        await svc.delete_kb(kb_id)
    except Exception as exc:
        _handle_domain_error(exc)


@router.post(
    "/{kb_id}/reindex",
    response_model=ReindexResponse,
    summary="Re-index all files in a KB",
)
async def reindex_kb(kb_id: str, svc: KBServiceDep) -> ReindexResponse:
    """Queue all files in the KB for re-ingestion."""
    try:
        return await svc.reindex_kb(kb_id)
    except Exception as exc:
        _handle_domain_error(exc)


# ---------------------------------------------------------------------------
# File endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/{kb_id}/files",
    response_model=FileListResponse,
    summary="List files in a KB",
)
async def list_files(kb_id: str, svc: KBServiceDep) -> FileListResponse:
    """Return all file records for the specified Knowledge Base."""
    try:
        return await svc.list_files(kb_id)
    except Exception as exc:
        _handle_domain_error(exc)


@router.post(
    "/{kb_id}/files",
    response_model=FileRecordResponse,
    status_code=201,
    summary="Add a file to a KB",
)
async def add_file(
    kb_id: str,
    body: FileAddRequest,
    svc: KBServiceDep,
) -> FileRecordResponse:
    """
    Add a file by its absolute path.  Ingestion starts automatically.
    Poll ``/status`` to track progress.
    """
    try:
        return await svc.add_file(kb_id, body)
    except Exception as exc:
        _handle_domain_error(exc)


@router.get(
    "/{kb_id}/files/{file_id}",
    response_model=FileRecordResponse,
    summary="Get a file record",
)
async def get_file(kb_id: str, file_id: str, svc: KBServiceDep) -> FileRecordResponse:
    """Return the full file record for a specific file."""
    try:
        return await svc.get_file(kb_id, file_id)
    except Exception as exc:
        _handle_domain_error(exc)


@router.delete(
    "/{kb_id}/files/{file_id}",
    status_code=204,
    summary="Remove a file from a KB",
)
async def remove_file(kb_id: str, file_id: str, svc: KBServiceDep) -> None:
    """Remove a file record and all its indexed chunks."""
    try:
        await svc.remove_file(kb_id, file_id)
    except Exception as exc:
        _handle_domain_error(exc)


@router.get(
    "/{kb_id}/files/{file_id}/status",
    response_model=FileStatusResponse,
    summary="Get ingestion status for a file",
)
async def get_file_status(
    kb_id: str, file_id: str, svc: KBServiceDep
) -> FileStatusResponse:
    """
    Lightweight endpoint for polling ingestion progress.
    Returns status string, progress fraction (0.0–1.0), and chunk count.
    """
    try:
        return await svc.get_file_status(kb_id, file_id)
    except Exception as exc:
        _handle_domain_error(exc)


@router.post(
    "/{kb_id}/files/{file_id}/reindex",
    response_model=FileRecordResponse,
    summary="Re-index a single file",
)
async def reindex_file(kb_id: str, file_id: str, svc: KBServiceDep) -> FileRecordResponse:
    """Force re-ingestion of a single file (useful for stale or error status)."""
    try:
        return await svc.reindex_file(kb_id, file_id)
    except Exception as exc:
        _handle_domain_error(exc)


@router.put(
    "/{kb_id}/files/{file_id}/path",
    response_model=FileRecordResponse,
    summary="Update the path for a missing file",
)
async def update_file_path(
    kb_id: str,
    file_id: str,
    body: FileUpdatePathRequest,
    svc: KBServiceDep,
) -> FileRecordResponse:
    """
    Provide the new path for a file that has been moved.
    Re-ingestion starts automatically after the path is updated.
    """
    try:
        return await svc.update_file_path(kb_id, file_id, body)
    except Exception as exc:
        _handle_domain_error(exc)
