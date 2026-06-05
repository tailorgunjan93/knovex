"""
Reader highlights — repository + schema tests.

Uses a real (temp-file) SQLite backend with the production schema so the
`highlights` table DDL and the repository SQL are exercised end-to-end.
"""

from __future__ import annotations

import pytest

from backend.models.schemas import HighlightCreate
from backend.storage.database import SCHEMA_SQL
from backend.storage.repositories.highlight_repository import SQLiteHighlightRepository
from backend.storage.sqlite_backend import SQLiteBackend


@pytest.fixture
async def repo(tmp_path):
    backend = SQLiteBackend(tmp_path / "hl.db")
    await backend.executescript(SCHEMA_SQL)
    # Seed parent rows so the highlights FKs (kb_id, file_id) are satisfied.
    await backend.execute(
        "INSERT INTO knowledge_bases (id, name, created_at, updated_at) VALUES (?,?,?,?)",
        ("kb1", "Test KB", "2026-01-01T00:00:00", "2026-01-01T00:00:00"),
    )
    for fid in ("f1", "f2"):
        await backend.execute(
            "INSERT INTO file_records (id, kb_id, name, file_path, format, added_at) "
            "VALUES (?,?,?,?,?,?)",
            (fid, "kb1", f"{fid}.pdf", f"/tmp/{fid}.pdf", "pdf", "2026-01-01T00:00:00"),
        )
    return SQLiteHighlightRepository(backend)


class TestHighlightCreateSchema:
    def test_invalid_color_falls_back_to_yellow(self):
        hc = HighlightCreate(text="x", color="chartreuse")
        assert hc.color == "yellow"

    def test_valid_color_preserved(self):
        assert HighlightCreate(text="x", color="green").color == "green"

    def test_defaults(self):
        hc = HighlightCreate(text="hello")
        assert hc.page == 1 and hc.color == "yellow" and hc.note == ""


@pytest.mark.asyncio
class TestHighlightRepository:
    async def test_create_then_list(self, repo):
        await repo.create("kb1", "f1", HighlightCreate(page=2, text="gradient descent", color="green"))
        items = await repo.list_for_file("kb1", "f1")
        assert len(items) == 1
        h = items[0]
        assert h.kb_id == "kb1" and h.file_id == "f1"
        assert h.page == 2 and h.text == "gradient descent" and h.color == "green"
        assert h.id and h.created_at

    async def test_list_is_scoped_per_file(self, repo):
        await repo.create("kb1", "f1", HighlightCreate(text="a"))
        await repo.create("kb1", "f2", HighlightCreate(text="b"))
        assert len(await repo.list_for_file("kb1", "f1")) == 1
        assert len(await repo.list_for_file("kb1", "f2")) == 1

    async def test_ordered_by_page_then_created(self, repo):
        await repo.create("kb1", "f1", HighlightCreate(page=3, text="late page"))
        await repo.create("kb1", "f1", HighlightCreate(page=1, text="early page"))
        pages = [h.page for h in await repo.list_for_file("kb1", "f1")]
        assert pages == [1, 3]

    async def test_get_and_delete(self, repo):
        created = await repo.create("kb1", "f1", HighlightCreate(text="x"))
        assert (await repo.get(created.id)).id == created.id
        await repo.delete(created.id)
        assert await repo.get(created.id) is None
        assert await repo.list_for_file("kb1", "f1") == []

    async def test_delete_missing_is_silent(self, repo):
        await repo.delete("does-not-exist")  # no raise
