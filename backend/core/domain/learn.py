"""
Learn Mode — Domain Entities

Pure dataclasses: no Pydantic, no SQLAlchemy.
SRP: only holds session / stats data and lightweight business rules.

Formats:
    quiz        — multiple-choice Q&A with explanation
    flashcard   — front/back cards with spaced-repetition ratings
    mindmap     — hierarchical branch structure
    timeline    — chronological events
    story       — narrative long-form explanation
    eli5        — Explain Like I'm 5
    speedlearn  — rapid bullet-point summary
    brainstorm  — creative connections and surprising facts
    guided      — step-by-step personal-tutor lesson (JSON)
    animated    — motion-graphics scene script for the SVG ScenePlayer (JSON)

NOTE: this set is the domain allow-list and MUST stay in lock-step with the
LearnSessionCreate.format Literal in backend/models/schemas.py. A format accepted
by the schema but missing here passes pydantic, starts the 200 SSE response, then
raises ValueError mid-stream → the client sees an unexplained "network error".
tests/test_learn_api_integration.py::TestFormatSourcesOfTruthAgree guards this.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

VALID_FORMATS = frozenset({
    "quiz", "flashcard", "mindmap", "timeline",
    "story", "eli5", "speedlearn", "brainstorm", "guided", "animated",
})

VALID_DIFFICULTIES = frozenset({"beginner", "intermediate", "expert"})

# XP table: level → minimum XP required to reach that level
_LEVEL_XP: list[int] = [0, 100, 250, 500, 1_000, 2_000, 4_000, 7_500, 12_500, 20_000]


def xp_to_level(xp: int) -> int:
    """Return the level (1-based) for a given total XP."""
    for lvl, threshold in enumerate(reversed(_LEVEL_XP), start=1):
        if xp >= threshold:
            return len(_LEVEL_XP) - lvl + 1
    return 1


def xp_for_next_level(current_xp: int) -> int:
    """Return total XP required to reach the next level (-1 if max level)."""
    lvl = xp_to_level(current_xp)
    if lvl >= len(_LEVEL_XP):
        return -1
    return _LEVEL_XP[lvl]


# XP rewards per action
XP_SESSION_COMPLETE      = 10   # any completed session
XP_QUIZ_CORRECT          = 5    # per correct quiz answer
XP_QUIZ_PERFECT          = 20   # bonus for 100% quiz score
XP_FLASHCARD_DECK        = 15   # completing a full flashcard deck
XP_STREAK_BONUS          = 5    # bonus per day of active streak (capped at 7)


@dataclass
class LearnSession:
    """A single learn session for a topic in one format."""
    id: str
    topic: str
    format: str                        # see VALID_FORMATS
    source_type: str                   # topic | kb_file | url
    difficulty: str = "intermediate"
    source_ref: str | None = None      # file_id or URL
    status: str = "pending"            # pending | generating | ready | error
    content: dict | None = None        # parsed JSON content (format-specific)
    error: str | None = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None

    def mark_ready(self, content: dict) -> None:
        self.content = content
        self.status = "ready"
        self.completed_at = datetime.utcnow()

    def mark_error(self, message: str) -> None:
        self.error = message
        self.status = "error"
        self.completed_at = datetime.utcnow()


@dataclass
class UserStats:
    """Global gamification state for the single local user."""
    xp: int = 0
    level: int = 1
    streak: int = 0
    last_activity: datetime | None = None
    badges: list[str] = field(default_factory=list)

    def add_xp(self, amount: int) -> list[str]:
        """
        Add *amount* XP, recalculate level, and return any newly earned badges.
        """
        self.xp += amount
        self.level = xp_to_level(self.xp)
        return []

    def record_activity(self) -> None:
        """Update streak based on today's activity."""
        today = datetime.utcnow().date()
        if self.last_activity is None:
            self.streak = 1
        else:
            delta = (today - self.last_activity.date()).days
            if delta == 0:
                pass           # already active today
            elif delta == 1:
                self.streak += 1
            else:
                self.streak = 1  # reset
        self.last_activity = datetime.utcnow()

    def award_badge(self, badge: str) -> bool:
        """Award *badge* if not already held. Returns True if newly awarded."""
        if badge not in self.badges:
            self.badges.append(badge)
            return True
        return False
