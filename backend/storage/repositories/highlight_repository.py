"""
Highlight Repository — persistence for user-created reader highlights.

SRP: the only place that knows the `highlights` table SQL. Services / routers
work with the `Highlight` schema and never touch SQL directly (DIP).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from backend.models.schemas import Highlight, HighlightCreate


def _row_to_highlight(row: dict) -> Highlight:
    return Highlight(
        id=row["id"],
        kb_id=row["kb_id"],
        file_id=row["file_id"],
        page=row["page"],
        text=row["text"],
        color=row["color"],
        note=row["note"],
        created_at=row["created_at"],
    )


class SQLiteHighlightRepository:
    """SQLite-backed CRUD for highlights, scoped per (kb, file)."""

    def __init__(self, backend) -> None:
        self._backend = backend

    async def list_for_file(self, kb_id: str, file_id: str) -> list[Highlight]:
        """All highlights for a file, oldest first (stable render order)."""
        rows = await self._backend.fetchall(
            "SELECT * FROM highlights WHERE kb_id = ? AND file_id = ? "
            "ORDER BY page ASC, created_at ASC",
            (kb_id, file_id),
        )
        return [_row_to_highlight(r) for r in rows]

    async def get(self, highlight_id: str) -> Highlight | None:
        row = await self._backend.fetchone(
            "SELECT * FROM highlights WHERE id = ?", (highlight_id,)
        )
        return _row_to_highlight(row) if row else None

    async def create(self, kb_id: str, file_id: str, data: HighlightCreate) -> Highlight:
        highlight = Highlight(
            id=str(uuid.uuid4()),
            kb_id=kb_id,
            file_id=file_id,
            page=data.page,
            text=data.text,
            color=data.color,
            note=data.note,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        await self._backend.execute(
            "INSERT INTO highlights (id, kb_id, file_id, page, text, color, note, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                highlight.id, highlight.kb_id, highlight.file_id, highlight.page,
                highlight.text, highlight.color, highlight.note, highlight.created_at,
            ),
        )
        return highlight

    async def delete(self, highlight_id: str) -> None:
        """Delete a highlight; silently succeeds if it doesn't exist."""
        await self._backend.execute(
            "DELETE FROM highlights WHERE id = ?", (highlight_id,)
        )
