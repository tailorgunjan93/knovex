"""
Database Initialisation

SRP: this module has exactly one job — define the schema DDL and
provide the init_db() startup function.

All connection management has been moved to SQLiteBackend.
Consumers that need a DB connection should use get_db() context manager
or inject SQLiteBackend via FastAPI Depends().
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import aiosqlite

from backend.core.config import settings
from backend.storage.sqlite_backend import SQLiteBackend

logger = logging.getLogger("knovex.storage")

# ---------------------------------------------------------------------------
# Schema DDL
# ---------------------------------------------------------------------------

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    color       TEXT    NOT NULL DEFAULT '#7C3AED',
    icon        TEXT    NOT NULL DEFAULT 'folder',
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS file_records (
    id              TEXT    PRIMARY KEY,
    kb_id           TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    file_path       TEXT    NOT NULL,
    format          TEXT    NOT NULL,
    size_bytes      INTEGER NOT NULL DEFAULT 0,
    status          TEXT    NOT NULL DEFAULT 'pending',
    content_hash    TEXT,
    chunk_count     INTEGER DEFAULT 0,
    version         INTEGER NOT NULL DEFAULT 1,
    added_at        TEXT    NOT NULL,
    ingested_at     TEXT,
    error_message   TEXT,
    FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id          TEXT    PRIMARY KEY,
    kb_id       TEXT,
    title       TEXT    NOT NULL DEFAULT 'New Chat',
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT    PRIMARY KEY,
    session_id  TEXT    NOT NULL,
    role        TEXT    NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content     TEXT    NOT NULL,
    sources     TEXT    NOT NULL DEFAULT '[]',
    web_sources TEXT    NOT NULL DEFAULT '[]',
    created_at  TEXT    NOT NULL,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS learn_sessions (
    id              TEXT    PRIMARY KEY,
    topic           TEXT    NOT NULL,
    format          TEXT    NOT NULL,
    source_type     TEXT    NOT NULL,
    source_ref      TEXT,
    difficulty      TEXT    NOT NULL DEFAULT 'intermediate',
    status          TEXT    NOT NULL DEFAULT 'pending',
    content         TEXT,
    created_at      TEXT    NOT NULL,
    completed_at    TEXT
);

CREATE TABLE IF NOT EXISTS user_stats (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    xp              INTEGER NOT NULL DEFAULT 0,
    level           INTEGER NOT NULL DEFAULT 1,
    streak          INTEGER NOT NULL DEFAULT 0,
    last_activity   TEXT,
    badges          TEXT    NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS learn_progress (
    id                  TEXT    PRIMARY KEY,
    session_id          TEXT    NOT NULL,
    score               REAL    NOT NULL DEFAULT 0.0,
    xp_earned           INTEGER NOT NULL DEFAULT 0,
    time_taken_seconds  INTEGER NOT NULL DEFAULT 0,
    completed_at        TEXT    NOT NULL,
    FOREIGN KEY (session_id) REFERENCES learn_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS flashcard_reviews (
    id              TEXT    PRIMARY KEY,
    session_id      TEXT    NOT NULL,
    card_index      INTEGER NOT NULL,
    ease_rating     TEXT    NOT NULL CHECK(ease_rating IN ('again', 'hard', 'good', 'easy')),
    next_review_at  TEXT    NOT NULL,
    reviewed_at     TEXT    NOT NULL,
    FOREIGN KEY (session_id) REFERENCES learn_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT    PRIMARY KEY,
    value       TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

-- -----------------------------------------------------------------------
-- Sprint 2: Ingestion chunks + FTS5 full-text search
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chunks (
    id          TEXT    PRIMARY KEY,
    file_id     TEXT    NOT NULL,
    kb_id       TEXT    NOT NULL,
    content     TEXT    NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    section     TEXT    NOT NULL DEFAULT '',
    page        INTEGER,
    metadata    TEXT    NOT NULL DEFAULT '{}',
    FOREIGN KEY (file_id) REFERENCES file_records(id) ON DELETE CASCADE,
    FOREIGN KEY (kb_id)   REFERENCES knowledge_bases(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    content,
    section,
    content='chunks',
    content_rowid='rowid'
);

-- Auto-sync FTS index with chunks table
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, content, section)
    VALUES (new.rowid, new.content, new.section);
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, content, section)
    VALUES ('delete', old.rowid, old.content, old.section);
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, content, section)
    VALUES ('delete', old.rowid, old.content, old.section);
    INSERT INTO chunks_fts(rowid, content, section)
    VALUES (new.rowid, new.content, new.section);
END;

INSERT OR IGNORE INTO user_stats (id, xp, level, streak, last_activity, badges)
VALUES (1, 0, 1, 0, NULL, '[]');
"""


# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

async def init_db() -> None:
    """
    Create all tables, apply performance pragmas, and run migrations.
    Called once from FastAPI lifespan on startup.
    """
    db_path = settings.db_path
    backend = SQLiteBackend(db_path)

    # Apply WAL mode directly (not inside executescript which starts a transaction)
    async with aiosqlite.connect(db_path) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.commit()

    await backend.executescript(SCHEMA_SQL)

    # ── Migrations (idempotent ALTER TABLE statements) ─────────────────────
    await _run_migrations(db_path)

    logger.info("SQLite schema initialised at %s", db_path)


async def _run_migrations(db_path) -> None:
    """
    Apply schema migrations that cannot be expressed in CREATE TABLE IF NOT EXISTS.
    All migrations are idempotent (safe to run on every startup).
    """
    async with aiosqlite.connect(str(db_path)) as db:
        # Sprint 7 — dense vector embeddings stored alongside chunks
        cols = [row[1] for row in await (await db.execute("PRAGMA table_info(chunks)")).fetchall()]
        if "embedding" not in cols:
            await db.execute("ALTER TABLE chunks ADD COLUMN embedding BLOB DEFAULT NULL")
            await db.commit()
            logger.info("Migration: added chunks.embedding column")


# ---------------------------------------------------------------------------
# Per-request connection factory
# ---------------------------------------------------------------------------

@asynccontextmanager
async def get_db() -> AsyncIterator[aiosqlite.Connection]:
    """
    Async context manager yielding an open aiosqlite connection.

    Used by repositories and services that need direct SQL access.
    For Sprint 2+, repositories receive a SQLiteBackend via DI instead.

    Usage::

        async with get_db() as db:
            cursor = await db.execute("SELECT * FROM knowledge_bases")
    """
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys=ON")
        yield db


def get_sqlite_backend() -> SQLiteBackend:
    """
    Dependency provider for FastAPI Depends() injection.

    Route handlers and services receive a SQLiteBackend and work
    through the IStorageBackend interface, never touching raw aiosqlite.

    Usage in a router::

        from fastapi import Depends
        from backend.storage.database import get_sqlite_backend

        @router.get("/kb")
        async def list_kbs(db: SQLiteBackend = Depends(get_sqlite_backend)):
            ...
    """
    return SQLiteBackend(settings.db_path)
