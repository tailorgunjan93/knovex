"""
Chat — Domain Entities

Pure dataclasses: no Pydantic, no SQLAlchemy.
SRP: only holds chat session / message data and lightweight business rules.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class ChatMessage:
    """A single message in a chat session."""
    id: str
    session_id: str
    role: str                           # user | assistant | system
    content: str
    sources: list[dict] = field(default_factory=list)      # KB citations
    web_sources: list[dict] = field(default_factory=list)  # web results
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class ChatSession:
    """A conversation thread, optionally scoped to a KB."""
    id: str
    title: str = "New Chat"
    kb_id: str | None = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    message_count: int = 0

    def rename(self, title: str) -> None:
        if not title.strip():
            raise ValueError("Session title cannot be blank")
        self.title = title.strip()
        self.touch()

    def touch(self) -> None:
        self.updated_at = datetime.utcnow()
