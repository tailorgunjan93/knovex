"""
Web Search API Router — Sprint 4

Endpoints:
  POST /api/search/web   — Execute a web search query
"""

from __future__ import annotations

import logging

from fastapi import APIRouter

from backend.core.dependencies import SearchServiceDep, SettingsServiceDep
from backend.models.schemas import WebSearchRequest, WebSearchResponse

logger = logging.getLogger("knovex.api.search")

router = APIRouter()


@router.post(
    "/search/web",
    response_model=WebSearchResponse,
    summary="Web search",
)
async def web_search(
    body: WebSearchRequest,
    search_svc: SearchServiceDep,
    settings_svc: SettingsServiceDep,
) -> WebSearchResponse:
    """
    Execute a web search using the configured engine.

    Engine priority:
      1. ``engine`` from current Settings (duckduckgo / serper / brave)
      2. Falls back to DuckDuckGo if no engine is set

    For DuckDuckGo no API key is required.
    For Serper / Brave set the key in Settings → Search.
    """
    engines = await settings_svc.enabled_search_engines()
    if engines:
        return await search_svc.search_blended(
            query=body.query, engines=engines, num_results=body.num_results,
        )
    # Fallback: legacy single-engine config.
    current = await settings_svc.get()
    return await search_svc.search(
        query=body.query,
        engine=current.search.engine or "duckduckgo",
        api_key=current.search.api_key or "",
        num_results=body.num_results,
    )
