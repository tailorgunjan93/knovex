"""
File Watcher Service

Periodically scans all tracked files to detect:
  - Missing files: path no longer exists on disk
  - Stale files:   SHA-256 hash changed since last ingestion

On detection, emits typed events so consumers (e.g. KBService) can react
without coupling to the watcher.

Design:
  - Runs as a lightweight asyncio background loop (no watchdog threads)
  - Scan interval is configurable (default: 5 minutes)
  - Non-blocking: uses asyncio.sleep between scans
  - OCP: new detection logic = add a method, don't touch the loop
  - DIP: depends on IFileRepository (abstraction), not SQLite directly

Lifecycle (managed by FastAPI lifespan):
    watcher = get_watcher_service()
    await watcher.start()   # lifespan startup
    ...
    await watcher.stop()    # lifespan shutdown
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from pathlib import Path

from backend.core.ingestion_service import compute_sha256
from backend.events.bus import EventBus
from backend.events.types import FileErrorEvent, FileMissingEvent, FileStaleEvent
from backend.storage.repositories.file_repository import IFileRepository

logger = logging.getLogger("knovex.watcher")


class WatcherService:
    """
    Async background service that monitors file system state.

    SRP: only detects and emits change events; it does NOT re-ingest
         files itself (that is KBService's job when it handles the events).
    """

    def __init__(
        self,
        file_repo: IFileRepository,
        event_bus: EventBus,
        *,
        scan_interval_seconds: int = 300,   # 5 minutes
    ) -> None:
        self._file_repo = file_repo
        self._event_bus = event_bus
        self._scan_interval = scan_interval_seconds
        self._running = False
        self._task: asyncio.Task | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the background scan loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._scan_loop(), name="watcher-scan")
        logger.info(
            "WatcherService started (interval=%ds)", self._scan_interval
        )

    async def stop(self) -> None:
        """Stop the background scan loop gracefully."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        logger.info("WatcherService stopped")

    # ------------------------------------------------------------------
    # Scan loop
    # ------------------------------------------------------------------

    async def _scan_loop(self) -> None:
        """Run one scan immediately, then repeat every scan_interval seconds."""
        while self._running:
            try:
                await self._scan_all_files()
            except Exception:
                logger.exception("WatcherService scan failed")
            try:
                await asyncio.sleep(self._scan_interval)
            except asyncio.CancelledError:
                break

    # ------------------------------------------------------------------
    # Detection logic (OCP: add new detectors here)
    # ------------------------------------------------------------------

    async def _scan_all_files(self) -> None:
        """Scan all ready/stale files for changes."""
        files = await self._file_repo.find_all_ready_or_stale()
        if not files:
            return

        logger.debug("Watcher scanning %d file(s)", len(files))

        for record in files:
            try:
                await self._check_single_file(record)
            except Exception as exc:
                logger.warning(
                    "Watcher error checking '%s': %s",
                    record.file_path, exc,
                )

    async def _check_single_file(self, record) -> None:
        """Check one file for missing/stale status."""
        path = Path(record.file_path)

        # ── Missing check ──────────────────────────────────────────────
        if not path.exists():
            if record.status != "missing":
                logger.info(
                    "File gone missing: %s (id=%s)", record.name, record.id
                )
                await self._file_repo.update_status(record.id, "missing")
                await self._event_bus.emit_typed(FileMissingEvent(
                    file_id=record.id,
                    kb_id=record.kb_id,
                    file_name=record.name,
                    last_known_path=record.file_path,   # maps to FileMissingEvent.last_known_path
                ))
            return

        # ── Stale check (only for files with a known hash) ─────────────
        if record.content_hash and record.status == "ready":
            try:
                current_hash = await asyncio.get_event_loop().run_in_executor(
                    None, compute_sha256, path
                )
                if current_hash != record.content_hash:
                    logger.info(
                        "File changed on disk: %s (id=%s)", record.name, record.id
                    )
                    await self._file_repo.update_status(record.id, "stale")
                    await self._event_bus.emit_typed(FileStaleEvent(
                        file_id=record.id,
                        kb_id=record.kb_id,
                        file_name=record.name,
                        file_path=record.file_path,
                    ))
            except Exception as exc:
                logger.warning(
                    "Hash check failed for '%s': %s", record.file_path, exc
                )
                await self._file_repo.update_status(
                    record.id, "error", error_message=f"Hash check failed: {exc}"
                )
                await self._event_bus.emit_typed(FileErrorEvent(
                    file_id=record.id,
                    kb_id=record.kb_id,
                    error=str(exc),
                ))
