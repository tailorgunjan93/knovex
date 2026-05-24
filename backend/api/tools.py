"""
Tools Registry API Router

Endpoint: GET /api/tools
Returns the list of all registered Knovex tools (for agent discovery).
"""

from __future__ import annotations

from fastapi import APIRouter

from backend.models.schemas import ToolsListResponse
from backend.tools.registry import tool_registry

router = APIRouter()


@router.get(
    "/tools",
    response_model=ToolsListResponse,
    summary="List all registered tools",
)
async def list_tools() -> ToolsListResponse:
    """
    Return all tools registered in the Knovex tool registry.

    Used by LangGraph agents in Phase 2 for tool discovery.
    In Phase 1 this endpoint is informational only.
    """
    return tool_registry.list_tools()
