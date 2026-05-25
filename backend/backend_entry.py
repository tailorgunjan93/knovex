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

    # When frozen, PyInstaller places extracted files in sys._MEIPASS.
    # Ensure that directory is on sys.path so "backend.*" imports resolve.
    if getattr(sys, "frozen", False):
        base_dir = sys._MEIPASS  # type: ignore[attr-defined]
        if base_dir not in sys.path:
            sys.path.insert(0, base_dir)

    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1",
        port=int(os.environ.get("KNOVEX_BACKEND_PORT", "8765")),
        log_level="info",
        loop="asyncio",
        # Disable the reloader in production — the frozen binary can't hot-reload
        reload=False,
    )


if __name__ == "__main__":
    main()
