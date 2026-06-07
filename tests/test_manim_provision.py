"""
Manim (Cinematic) provisioning — config over the shared EnvPackProvisionService.

The generic state machine is covered by the OCR tests; here we pin the Manim
specifics (packages, verify-import, env var) and a clean install via a fake runner.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from backend.core.env_provision import PackState, env_python
from backend.core.manim_provision_service import MANIM_HOME_ENV, ManimProvisionService


class FakeRunner:
    def __init__(self):
        self.calls: list[list[str]] = []

    async def run(self, cmd, on_line):
        self.calls.append(cmd)
        on_line(f"step {cmd[1] if len(cmd) > 1 else cmd[0]}")
        if len(cmd) >= 3 and cmd[1] == "venv":
            py = env_python(Path(cmd[2]))
            py.parent.mkdir(parents=True, exist_ok=True)
            py.write_text("")
        return 0


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.delenv(MANIM_HOME_ENV, raising=False)
    yield


def _svc(tmp_path, runner=None):
    return ManimProvisionService(
        env_home=tmp_path / "manim", uv_resolver=lambda: "uv", runner=runner or FakeRunner()
    )


async def test_installs_manim_and_ffmpeg(tmp_path):
    runner = FakeRunner()
    svc = _svc(tmp_path, runner)
    st = await svc.install()
    assert st.state == PackState.READY
    assert os.environ[MANIM_HOME_ENV] == str(tmp_path / "manim")
    # pip step installs both manim and the bundled ffmpeg
    pip = next(c for c in runner.calls if len(c) > 1 and c[1] == "pip")
    assert "manim" in pip and "imageio-ffmpeg" in pip
    # verify step imports both
    verify = runner.calls[-1]
    assert verify[1:] == ["-c", "import manim, imageio_ffmpeg"]


async def test_unavailable_without_uv(tmp_path):
    svc = ManimProvisionService(env_home=tmp_path / "manim", uv_resolver=lambda: None, runner=FakeRunner())
    st = await svc.install()
    assert st.state == PackState.UNAVAILABLE


async def test_uninstall(tmp_path):
    svc = _svc(tmp_path)
    await svc.install()
    st = svc.uninstall()
    assert st.state == PackState.NOT_INSTALLED
    assert not (tmp_path / "manim").exists()
