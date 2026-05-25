"""
Knovex Backend — FastAPI Application Entry Point

Responsibilities:
  - Create the FastAPI app instance
  - Register CORS middleware
  - Register all routers
  - Define the lifespan context (startup / shutdown)
  - Global exception handler (always returns structured JSON)

SRP: this file only wires the app. Business logic lives in services;
     DI wiring lives in core/dependencies.py.

Version: 0.6.0
"""

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.core.config import settings
from backend.storage.database import init_db

logger = logging.getLogger("knovex")


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context.

    Startup tasks:
      1. Initialise SQLite database (idempotent schema creation)
      2. Import provider package (triggers self-registration of all 7 providers)
      3. Log Ollama detection status

    Shutdown tasks:
      - (future: close connection pools, flush event queue)
    """
    logger.info("Knovex backend starting (v%s)", settings.version)

    # 1. DB init
    try:
        await init_db()
        logger.info("Database ready: %s", settings.db_path)
    except Exception as exc:
        logger.error("Database initialisation failed: %s", exc)

    # 2. Import providers to trigger self-registration via @register_provider
    try:
        import backend.core.providers  # noqa: F401 — side effects only
        from backend.core.providers.factory import LLMProviderFactory
        logger.info(
            "LLM providers registered: %s",
            ", ".join(LLMProviderFactory.registered_providers()),
        )
    except Exception as exc:
        logger.error("Provider registration failed: %s", exc)

    # 3. Log Ollama status (non-blocking — just informational)
    try:
        from backend.core.providers.factory import LLMProviderFactory
        from backend.core.providers.ollama import OllamaProvider
        provider = LLMProviderFactory.create("ollama")
        if isinstance(provider, OllamaProvider):
            models = await provider.get_installed_models()
            if models:
                logger.info("Ollama detected — %d model(s) installed", len(models))
            else:
                logger.info("Ollama not found on localhost:11434")
    except Exception:
        logger.info("Ollama probe skipped")

    # 4. Start file watcher service (detects stale / missing tracked files)
    try:
        from backend.core.dependencies import get_watcher_service
        watcher = get_watcher_service()
        await watcher.start()
        logger.info("File watcher started")
    except Exception as exc:
        logger.error("File watcher failed to start: %s", exc)

    yield  # Application runs here

    # Shutdown: stop watcher
    try:
        from backend.core.dependencies import get_watcher_service
        watcher = get_watcher_service()
        await watcher.stop()
    except Exception:
        pass

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
    # CORS — allow the Vite dev server in dev, Electron in prod
    # -----------------------------------------------------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",   # Vite dev server
            "http://localhost:4173",   # Vite preview
            "http://localhost:8765",   # Self (Electron prod)
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # -----------------------------------------------------------------------
    # Routers — import here to avoid circular imports at module level
    # -----------------------------------------------------------------------
    from backend.api.chat import router as chat_router
    from backend.api.health import router as health_router
    from backend.api.kb import router as kb_router
    from backend.api.learn import router as learn_router
    from backend.api.reader import router as reader_router
    from backend.api.search import router as search_router
    from backend.api.settings import router as settings_router
    from backend.api.summarizer import router as summarizer_router
    from backend.api.tools import router as tools_router

    app.include_router(health_router, prefix="/api", tags=["health"])
    app.include_router(settings_router, prefix="/api", tags=["settings"])
    app.include_router(tools_router, prefix="/api", tags=["tools"])
    app.include_router(kb_router, prefix="/api", tags=["knowledge-base"])
    app.include_router(reader_router, prefix="/api", tags=["reader"])
    app.include_router(chat_router, prefix="/api", tags=["chat"])
    app.include_router(summarizer_router, prefix="/api", tags=["summarizer"])
    app.include_router(search_router, prefix="/api", tags=["search"])
    app.include_router(learn_router, prefix="/api", tags=["learn"])

    # -----------------------------------------------------------------------
    # Global exception handler — always returns structured JSON
    # -----------------------------------------------------------------------
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Catch-all handler so the frontend always receives JSON, never HTML."""
        logger.exception(
            "Unhandled exception on %s %s", request.method, request.url.path
        )
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
# Application instance — imported by uvicorn: `uvicorn backend.main:app`
# ---------------------------------------------------------------------------
app = create_app()
