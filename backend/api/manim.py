"""
Cinematic (Manim) pack API.

Manim is too large to bundle, so it's provisioned on demand (like OCR). These
endpoints drive provisioning and render lessons to MP4:

  GET  /api/manim/status        — pack state (+ progress log tail)
  POST /api/manim/install       — start provisioning in the background
  POST /api/manim/uninstall     — remove the pack
  POST /api/manim/render        — LLM → Manim → MP4 (blocking; ~30-90s)
  GET  /api/manim/video/{id}    — serve a finished render's MP4
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from backend.core.dependencies import (
    get_manim_provision_service,
    get_manim_render_service,
    get_settings_service,
)
from backend.core.env_provision import EnvPackProvisionService, PackStatus
from backend.core.manim_render_service import ManimRenderService
from backend.core.providers.base import ProviderCredentials
from backend.core.settings_service import SettingsService
from backend.models.schemas import ManimRenderRequest, ManimRenderResponse, PackStatusResponse

router = APIRouter()


def _to_response(status: PackStatus) -> PackStatusResponse:
    return PackStatusResponse(
        state=status.state.value,
        detail=status.detail,
        python_path=status.python_path,
        log_tail=status.log_tail,
    )


@router.get("/manim/status", response_model=PackStatusResponse)
def manim_status(
    svc: EnvPackProvisionService = Depends(get_manim_provision_service),
) -> PackStatusResponse:
    return _to_response(svc.status())


@router.post("/manim/install", response_model=PackStatusResponse)
async def manim_install(
    svc: EnvPackProvisionService = Depends(get_manim_provision_service),
) -> PackStatusResponse:
    return _to_response(svc.start_install())


@router.post("/manim/uninstall", response_model=PackStatusResponse)
def manim_uninstall(
    svc: EnvPackProvisionService = Depends(get_manim_provision_service),
) -> PackStatusResponse:
    return _to_response(svc.uninstall())


@router.post("/manim/render", response_model=ManimRenderResponse)
async def manim_render(
    body: ManimRenderRequest,
    render_svc: ManimRenderService = Depends(get_manim_render_service),
    settings_svc: SettingsService = Depends(get_settings_service),
) -> ManimRenderResponse | JSONResponse:
    current = await settings_svc.get()
    llm = current.llm
    creds = ProviderCredentials(
        api_key=llm.api_key,
        base_url=llm.base_url,
        aws_region=llm.aws_region,
        aws_access_key_id=llm.aws_access_key_id,
        aws_secret_access_key=llm.aws_secret_access_key,
    )
    result = await render_svc.render(
        topic=body.topic,
        difficulty=body.difficulty,
        provider=llm.provider,
        model=llm.model,
        credentials=creds,
    )
    if result.ok:
        return ManimRenderResponse(
            ok=True, render_id=result.render_id,
            video_url=f"/api/manim/video/{result.render_id}", attempts=result.attempts,
        )
    return JSONResponse(
        status_code=502,
        content={"ok": False, "error": result.error, "attempts": result.attempts},
    )


@router.get("/manim/video/{render_id}")
def manim_video(
    render_id: str,
    render_svc: ManimRenderService = Depends(get_manim_render_service),
) -> FileResponse:
    if not render_id.isalnum():
        raise HTTPException(status_code=400, detail="bad render id")
    path = render_svc.get_video(render_id)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="render not found")
    return FileResponse(path, media_type="video/mp4", filename="lesson.mp4")
