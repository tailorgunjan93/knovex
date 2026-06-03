"""
OCR pack API.

OCR (via docnest) is too large to bundle, so the packaged app provisions it on
demand. These endpoints drive + report that provisioning:

  GET  /api/ocr/status     — current state (+ progress log tail)
  POST /api/ocr/install    — start provisioning in the background (idempotent)
  POST /api/ocr/uninstall  — remove the OCR pack

The heavy install runs as a background task; clients poll /status for progress.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.core.dependencies import get_ocr_provision_service
from backend.core.ocr_provision_service import OcrProvisionService, OcrStatus
from backend.models.schemas import OcrStatusResponse

router = APIRouter()


def _to_response(status: OcrStatus) -> OcrStatusResponse:
    return OcrStatusResponse(
        state=status.state.value,
        detail=status.detail,
        python_path=status.python_path,
        log_tail=status.log_tail,
    )


@router.get("/ocr/status", response_model=OcrStatusResponse)
def ocr_status(
    svc: OcrProvisionService = Depends(get_ocr_provision_service),
) -> OcrStatusResponse:
    return _to_response(svc.status())


@router.post("/ocr/install", response_model=OcrStatusResponse)
async def ocr_install(
    svc: OcrProvisionService = Depends(get_ocr_provision_service),
) -> OcrStatusResponse:
    # async so start_install() can schedule the background task on the event loop.
    return _to_response(svc.start_install())


@router.post("/ocr/uninstall", response_model=OcrStatusResponse)
def ocr_uninstall(
    svc: OcrProvisionService = Depends(get_ocr_provision_service),
) -> OcrStatusResponse:
    return _to_response(svc.uninstall())
