"""
OCR provisioning service.

OCR can't ship in the exe (docnest/torch is multi-GB), so the packaged app
provisions an OCR env on demand via `uv`. These tests drive the full state
machine with an INJECTED command runner + uv resolver — nothing is downloaded.
"""

from __future__ import annotations

import os

import pytest

from backend.core.ocr_provision_service import (
    OCR_HOME_ENV,
    OcrProvisionService,
    OcrState,
    env_python,
)


class FakeRunner:
    """Records commands; simulates `uv venv` creating the env interpreter."""

    def __init__(self, *, fail_at: int | None = None, create_python: bool = True):
        self.calls: list[list[str]] = []
        self._fail_at = fail_at
        self._create_python = create_python

    async def run(self, cmd, on_line):
        self.calls.append(cmd)
        on_line(f"running {cmd[0]}")
        idx = len(self.calls) - 1
        if self._fail_at == idx:
            on_line("error: boom")
            return 1
        # `uv venv <home> ...` → materialise the interpreter the service checks for.
        if self._create_python and len(cmd) >= 2 and cmd[1] == "venv":
            py = env_python(__import__("pathlib").Path(cmd[2]))
            py.parent.mkdir(parents=True, exist_ok=True)
            py.write_text("")
        return 0


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.delenv(OCR_HOME_ENV, raising=False)
    yield


def _svc(tmp_path, **kw):
    kw.setdefault("uv_resolver", lambda: "uv")
    kw.setdefault("runner", FakeRunner())
    return OcrProvisionService(env_home=tmp_path / "ocr", **kw)


class TestInitialState:
    def test_not_installed_on_empty_home(self, tmp_path):
        assert _svc(tmp_path).status().state == OcrState.NOT_INSTALLED

    def test_adopts_existing_env(self, tmp_path, monkeypatch):
        home = tmp_path / "ocr"
        py = env_python(home)
        py.parent.mkdir(parents=True)
        py.write_text("")
        svc = OcrProvisionService(env_home=home, uv_resolver=lambda: "uv", runner=FakeRunner())
        st = svc.status()
        assert st.state == OcrState.READY
        assert st.python_path == str(py)
        assert os.environ[OCR_HOME_ENV] == str(home)


class TestInstall:
    async def test_success_runs_all_steps_and_exports_home(self, tmp_path):
        runner = FakeRunner()
        svc = _svc(tmp_path, runner=runner)
        st = await svc.install()
        assert st.state == OcrState.READY
        assert os.environ[OCR_HOME_ENV] == str(tmp_path / "ocr")
        # venv, pip install, verify-import
        assert [c[1] for c in runner.calls][:2] == ["venv", "pip"]
        assert any("docnest-ai>=0.7.0" in c for c in runner.calls[1])
        assert any("easyocr" in c for c in runner.calls[1])
        assert runner.calls[2][1:] == ["-c", "import docnest, easyocr"]

    async def test_failure_sets_error_state(self, tmp_path):
        svc = _svc(tmp_path, runner=FakeRunner(fail_at=1))   # pip install fails
        st = await svc.install()
        assert st.state == OcrState.ERROR
        assert "failed" in st.detail.lower()
        assert OCR_HOME_ENV not in os.environ

    async def test_unavailable_without_uv(self, tmp_path):
        svc = _svc(tmp_path, uv_resolver=lambda: None)
        st = await svc.install()
        assert st.state == OcrState.UNAVAILABLE
        assert "uv" in st.detail.lower()

    async def test_finished_but_not_importable_is_error(self, tmp_path):
        # venv won't create the interpreter → _env_ready() stays False
        svc = _svc(tmp_path, runner=FakeRunner(create_python=False))
        st = await svc.install()
        assert st.state == OcrState.ERROR

    async def test_log_tail_captures_output(self, tmp_path):
        svc = _svc(tmp_path)
        st = await svc.install()
        assert any("running uv" in line for line in st.log_tail)


class TestUninstall:
    async def test_removes_env_and_unsets_var(self, tmp_path):
        svc = _svc(tmp_path)
        await svc.install()
        assert (tmp_path / "ocr").exists()
        st = svc.uninstall()
        assert st.state == OcrState.NOT_INSTALLED
        assert not (tmp_path / "ocr").exists()
        assert OCR_HOME_ENV not in os.environ
