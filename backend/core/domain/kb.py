"""
Knowledge Base — Domain Entity

Pure dataclass with no Pydantic or SQLAlchemy dependencies.
Encapsulates identity + business state for a Knowledge Base.

SRP: only holds KB data; no persistence or API logic here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class KB:
    """
    Aggregate root for a Knowledge Base.

    Mutation is intentional (services update name/color/icon/updated_at).
    The repository is responsible for persisting all changes.
    """

    id: str
    name: str
    color: str = "#7C3AED"
    icon: str = "folder"
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

    # -------------------------------------------------------------------------
    # Business operations — validate + mutate in one place
    # -------------------------------------------------------------------------

    def rename(self, name: str) -> None:
        """Update KB name, recording the mutation timestamp."""
        if not name or not name.strip():
            raise ValueError("KB name cannot be blank")
        self.name = name.strip()
        self.touch()

    def update_appearance(self, color: str | None, icon: str | None) -> None:
        """Update visual properties."""
        if color is not None:
            self.color = color
        if icon is not None:
            self.icon = icon
        self.touch()

    def touch(self) -> None:
        """Bump updated_at to now."""
        self.updated_at = datetime.utcnow()
