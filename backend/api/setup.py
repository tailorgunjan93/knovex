"""
Setup API Router — Sprint 7

Provides endpoints for the first-launch ONNX model download flow.

Endpoints:
  GET  /api/setup/models/status   — check if local model files are present
  POST /api/setup/models/download — stream download progress via SSE

The Electron/React first-launch screen polls or streams these endpoints
to show a progress bar before the user can begin using dense retrieval.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.adapters.embedder import download_model, model_files_ready, _model_dir

logger = logging.getLogger("knovex.api.setup")

router = APIRouter()


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class ModelStatusResponse(BaseModel):
    ready: bool
    model_name: str = "all-MiniLM-L6-v2"
    size_bytes: int = 0
    path: str = ""


# ---------------------------------------------------------------------------
# GET /api/setup/models/status
# ---------------------------------------------------------------------------

@router.get(
    "/setup/models/status",
    response_model=ModelStatusResponse,
    summary="Check if the local ONNX embedding model is downloaded",
)
async def get_model_status() -> ModelStatusResponse:
    """
    Returns whether the local all-MiniLM-L6-v2 ONNX model is ready.
    If ready, includes total size and path.
    """
    ready = model_files_ready()
    size = 0
    path = str(_model_dir())

    if ready:
        for f in _model_dir().iterdir():
            size += f.stat().st_size

    return ModelStatusResponse(ready=ready, size_bytes=size, path=path)


# ---------------------------------------------------------------------------
# POST /api/setup/models/download  (SSE stream)
# ---------------------------------------------------------------------------

@router.post(
    "/setup/models/download",
    summary="Download the local ONNX embedding model (SSE progress stream)",
    response_class=StreamingResponse,
)
async def download_embedding_model() -> StreamingResponse:
    """
    Streams download progress as Server-Sent Events.

    Each event is a JSON object:
      {"type": "progress", "downloaded": <bytes>, "total": <bytes>, "pct": <0-100>}
      {"type": "done",     "size_bytes": <total>}
      {"type": "error",    "error": "<message>"}

    The client should consume events until "done" or "error" is received.
    Already-present files are skipped automatically.
    """

    async def event_stream():
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def progress_cb(downloaded: int, total: int) -> None:
            pct = round(downloaded / total * 100, 1) if total > 0 else 0
            event = json.dumps({
                "type": "progress",
                "downloaded": downloaded,
                "total": total,
                "pct": pct,
            })
            loop.call_soon_threadsafe(queue.put_nowait, event)

        async def run_download():
            try:
                await loop.run_in_executor(None, lambda: download_model(progress_cb))
                # Calculate final size
                size = sum(f.stat().st_size for f in _model_dir().iterdir() if f.is_file())
                done_event = json.dumps({"type": "done", "size_bytes": size})
                await queue.put(done_event)
            except Exception as exc:
                logger.exception("Model download failed: %s", exc)
                err_event = json.dumps({"type": "error", "error": str(exc)})
                await queue.put(err_event)
            finally:
                await queue.put(None)  # sentinel

        task = asyncio.create_task(run_download())

        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield f"data: {item}\n\n"
        finally:
            task.cancel()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
