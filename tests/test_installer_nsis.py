"""
NSIS installer guard — regression test for Known Issue #9 / #2.

"Failed to uninstall old application files. ... : 2" happened because the old
version's uninstaller could not delete `knovex-backend.exe` while it was still
running (Windows locks a running executable → uninstaller exit code 2). The
Electron installer must force-kill that backend process before touching files.

These checks run in CI (no Windows/build needed) and fail loudly if the fix is
removed or the process name drifts out of sync with what the desktop app spawns.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
_DESKTOP = _ROOT / "desktop"
_NSH = _DESKTOP / "assets" / "installer.nsh"
_PKG = _DESKTOP / "package.json"
_MAIN = _DESKTOP / "main.js"


def _backend_image_name() -> str:
    """The Windows backend exe name as the desktop app actually spawns it."""
    text = _MAIN.read_text(encoding="utf-8")
    m = re.search(r"['\"](knovex-backend(?:\.exe)?)['\"]", text)
    assert m, "could not find the backend exe name in desktop/main.js"
    # main.js uses 'knovex-backend.exe' on win32
    return "knovex-backend.exe"


class TestInstallerNshExists:
    def test_nsh_present(self):
        assert _NSH.exists(), "desktop/build/installer.nsh is missing — NSIS fix gone"

    def test_referenced_from_package_json(self):
        nsis = json.loads(_PKG.read_text(encoding="utf-8"))["build"]["nsis"]
        assert nsis.get("include") == "assets/installer.nsh", (
            "nsis.include must point at the custom installer.nsh"
        )


class TestBackendIsKilled:
    def test_kills_backend_in_installer_and_uninstaller(self):
        nsh = _NSH.read_text(encoding="utf-8")
        image = _backend_image_name()
        # The kill must target the real spawned image name.
        assert f"/IM {image}" in nsh, f"installer.nsh must taskkill {image}"
        assert "taskkill" in nsh and "/F" in nsh, "must force-kill the backend"
        # Must fire on BOTH install (before uninstallOldVersion) and uninstall.
        assert "!macro customInit" in nsh, "customInit hook (pre-uninstall) missing"
        assert "!macro customUnInstall" in nsh, "customUnInstall hook missing"

    def test_kill_target_matches_spawned_process(self):
        """Guard against drift: the name killed == the name spawned by main.js."""
        nsh = _NSH.read_text(encoding="utf-8")
        assert _backend_image_name() in nsh
