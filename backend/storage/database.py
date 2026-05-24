"""
SQLite Database Setup

Handles:
  - Schema creation on first run (all tables via SCHEMA_SQL)
  - WAL mode + foreign key enforcement
  - `init_db()` called from FastAPI lifespan
  - `get_db()` async context manager used by API routes / services
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite

from backend.core.config import settings

logger = logging.getLogger("knovex.storage")

# ---------------------------------------------------------------------------
# Schema DDL — all tables created idempotently via IF NOT EXISTS
# ---------------------------------------------------------------------------
SCHEMA_SQL = """
-- Knowledge bases
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    color       TEXT    NOT NULL DEFAULT '#7C3AED',
    icon        TEXT    NOT NULL DEFAULT 'folder',
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

-- File records (one row per file inside a KB)
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

-- Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
    id          TEXT    PRIMARY KEY,
    kb_id       TEXT,
    title       TEXT    NOT NULL DEFAULT 'New Chat',
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

-- Chat messages
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

-- Learn sessions
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

-- User stats (single row — gamification state)
CREATE TABLE IF NOT EXISTS user_stats (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    xp              INTEGER NOT NULL DEFAULT 0,
    level           INTEGER NOT NULL DEFAULT 1,
    streak          INTEGER NOT NULL DEFAULT 0,
    last_activity   TEXT,
    badges          TEXT    NOT NULL DEFAULT '[]'
);

-- Per-session learning progress
CREATE TABLE IF NOT EXISTS learn_progress (
    id                      TEXT    PRIMARY KEY,
    session_id              TEXT    NOT NULL,
    score                   REAL    NOT NULL DEFAULT 0.0,
    xp_earned               INTEGER NOT NULL DEFAULT 0,
    time_taken_seconds      INTEGER NOT NULL DEFAULT 0,
    completed_at            TEXT    NOT NULL,
    FOREIGN KEY (session_id) REFERENCES learn_sessions(id) ON DELETE CASCADE
);

-- Flashcard spaced repetition reviews
CREATE TABLE IF NOT EXISTS flashcard_reviews (
    id              TEXT    PRIMARY KEY,
    session_id      TEXT    NOT NULL,
    card_index      INTEGER NOT NULL,
    ease_rating     TEXT    NOT NULL CHECK(ease_rating IN ('again', 'hard', 'good', 'easy')),
    next_review_at  TEXT    NOT NULL,
    reviewed_at     TEXT    NOT NULL,
    FOREIGN KEY (session_id) REFERENCES learn_sessions(id) ON DELETE CASCADE
);

-- App settings (key-value store for user preferences)
CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT    PRIMARY KEY,
    value       TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

-- Seed a single user_stats row so it always exists
INSERT OR IGNORE INTO user_stats (id, xp, level, streak, last_activity, badges)
VALUES (1, 0, 1, 0, NULL, '[]');
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def init_db() -> None:
    """
    Create all tables and apply initial pragmas.
    Called once from the FastAPI lifespan on startup.
    """
    db_path = settings.db_path
    async with aiosqlite.connect(db_path) as db:
        # Enable WAL for better concurrent read performance
        await db.execute("PRAGMA journal_mode=WAL")
        # Enforce FK constraints
        await db.execute("PRAGMA foreign_keys=ON")
        await db.executescript(SCHEMA_SQL)
        await db.commit()

    logger.info("SQLite database initialised at %s", db_path)


@asynccontextmanager
async def get_db() -> AsyncIterator[aiosqlite.Connection]:
    """
    Async context manager that yields an open aiosqlite connection.

    Usage::

        async with get_db() as db:
            row = await db.execute("SELECT * FROM knowledge_bases WHERE id=?", (kb_id,))

    Rows are returned as :class:`aiosqlite.Row` objects (subscriptable by
    column name).
    """
    db = await aiosqlite.connect(settings.db_path)
    db.row_factory = aiosqlite.Row
    try:
        await db.execute("PRAGMA foreign_keys=ON")
        yield db
    finally:
        await db.close()
