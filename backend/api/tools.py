"""
Tools Registry API Router

DIP: receives ToolRegistry via Depends() (ready for Sprint 2 when
     real tool implementations are injected).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.models.schemas import ToolsListResponse
from backend.tools.registry import ToolRegistry, get_tool_registry

router = APIRouter()


@router.get(
    "/tools",
    response_model=ToolsListResponse,
    summary="List all registered tools",
)
async def list_tools(
    registry: ToolRegistry = Depends(get_tool_registry),
) -> ToolsListResponse:
    """
    Return all tools registered in the Knovex tool registry.

    Used by LangGraph agents in Phase 2 for tool discovery.
    In Phase 1 this endpoint is informational only.
    """
    return registry.list_tools()
