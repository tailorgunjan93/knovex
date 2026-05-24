"""
Knovex Backend — FastAPI Application Entry Point

Initialises the FastAPI app with:
- CORS middleware (dev: allow localhost:5173)
- Lifespan context manager (startup / shutdown)
- Routers: health, settings
- Global exception handler returning structured JSON errors

Version: 0.1.0
"""

import logging
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.core.config import settings
from backend.storage.database import init_db
from backend.api.health import router as health_router
from backend.api.settings import router as settings_router
from backend.api.tools import router as tools_router

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("knovex")


# ---------------------------------------------------------------------------
# Lifespan context — runs on startup and shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Async lifespan context for the FastAPI app.

    Startup:
      1. Initialise SQLite database and create all tables.
      2. Probe localhost:11434 to see if Ollama is running.

    Shutdown:
      - Close any open database connections (handled by SQLAlchemy engine
        disposal called inside init_db module).
    """
    # --- Startup ---
    logger.info("Knovex backend starting up (v%s)", settings.version)

    # 1. Initialise database
    try:
        await init_db()
        logger.info("Database initialised at %s", settings.db_path)
    except Exception as exc:  # pragma: no cover
        logger.error("Database init failed: %s", exc)

    # 2. Detect Ollama availability
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get("http://localhost:11434/api/tags")
            if resp.status_code == 200:
                logger.info("Ollama detected on localhost:11434")
            else:
                logger.info("Ollama not responding (status %s)", resp.status_code)
    except Exception:
        logger.info("Ollama not found on localhost:11434 (will use other providers)")

    yield  # Application runs here

    # --- Shutdown ---
    logger.info("Knovex backend shutting down")


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------
def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    app = FastAPI(
        title="Knovex API",
        description="Local-first AI-powered knowledge base — backend service",
        version=settings.version,
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    # -----------------------------------------------------------------------
    # CORS — allow the Vite dev server to call the API without proxy issues
    # -----------------------------------------------------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",   # Vite dev server
            "http://localhost:4173",   # Vite preview
            "http://localhost:8765",   # Self (e.g. Electron in prod mode)
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # -----------------------------------------------------------------------
    # Routers
    # -----------------------------------------------------------------------
    app.include_router(health_router, prefix="/api", tags=["health"])
    app.include_router(settings_router, prefix="/api", tags=["settings"])
    app.include_router(tools_router, prefix="/api", tags=["tools"])

    # -----------------------------------------------------------------------
    # Global exception handler — always returns structured JSON
    # -----------------------------------------------------------------------
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Catch-all handler so the frontend always receives JSON, never HTML."""
        logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "error": "internal_server_error",
                "detail": str(exc),
                "type": type(exc).__name__,
            },
        )

    return app


# ---------------------------------------------------------------------------
# Application instance (imported by uvicorn: `uvicorn backend.main:app`)
# ---------------------------------------------------------------------------
app = create_app()
