"""
Knovex Backend — PyInstaller Entry Point

This is the top-level script bundled into the standalone executable by PyInstaller.
Electron's main process spawns this binary in production:

    Windows: resources/backend/knovex-backend.exe
    macOS  : resources/backend/knovex-backend
    Linux  : resources/backend/knovex-backend

The process starts uvicorn on localhost:8765 and runs until the parent Electron
process kills it on application quit.

SRP: only responsible for bootstrap and uvicorn launch.
     All application logic lives in backend.main (the FastAPI app).

IMPORTANT — why we import `app` directly instead of passing the string
"backend.main:app" to uvicorn.run():

    PyInstaller's static analyser follows *import statements* to discover
    which modules to freeze into the PYZ archive.  A bare string argument
    like "backend.main:app" is opaque — the analyser cannot see through it,
    so `backend.main` and all its transitive dependencies would be ABSENT
    from the frozen binary.  At runtime uvicorn would call
    `importlib.import_module("backend.main")`, find nothing, and abort with:

        ERROR: Error loading ASGI app. Could not import module "backend.main".

    Importing `app` explicitly here causes the analyser to trace the full
    dependency tree of backend.main at build time, ensuring every sub-module
    ends up in the PYZ archive.  Uvicorn then receives the live ASGI callable
    and never needs to do a string-based import at runtime.
"""

import multiprocessing
import os
import sys


def main() -> None:
    """
    Bootstrap and start the Knovex FastAPI server.

    multiprocessing.freeze_support() must be called before anything else
    so that PyInstaller-frozen child processes re-enter correctly on Windows.
    """
    multiprocessing.freeze_support()

    # When frozen, PyInstaller places extracted files in sys._MEIPASS
    # (the _internal/ subdirectory next to the .exe in COLLECT mode).
    # Insert it at the front of sys.path so all "backend.*" imports resolve
    # through PyInstaller's FrozenImporter rather than the OS filesystem.
    if getattr(sys, "frozen", False):
        base_dir = sys._MEIPASS  # type: ignore[attr-defined]
        if base_dir not in sys.path:
            sys.path.insert(0, base_dir)

    # ── Import the app object BEFORE calling uvicorn ──────────────────────────
    # This explicit import statement is what causes PyInstaller's build-time
    # analyser to trace backend.main and freeze its full dependency tree.
    # See module-level docstring for the full explanation.
    from backend.main import app  # noqa: E402  (import not at top of file)

    import uvicorn

    uvicorn.run(
        app,            # ASGI callable — NOT the string "backend.main:app"
        host="127.0.0.1",
        port=int(os.environ.get("KNOVEX_BACKEND_PORT", "8765")),
        log_level="info",
        loop="asyncio",
        # Disable the reloader — the frozen binary cannot hot-reload source files
        reload=False,
    )


if __name__ == "__main__":
    main()
