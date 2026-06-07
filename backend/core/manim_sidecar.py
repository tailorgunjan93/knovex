#!/usr/bin/env python
"""
Out-of-process Manim render sidecar.

Runs INSIDE the on-demand Cinematic env (a separate Python that has ``manim`` +
``imageio-ffmpeg`` installed) — NOT inside Knovex's frozen backend. It must be
fully self-contained: no ``backend.*`` imports.

Given a file of generated Manim code defining ``class Lesson(Scene)``, it renders
it to an MP4 and prints a JSON result. ffmpeg is taken from the bundled
``imageio-ffmpeg`` so no system ffmpeg is needed.

Usage:
    python manim_sidecar.py <code_file> <out_dir> [--quality medium_quality]

Output (stdout, last line is JSON):
    {"ok": true,  "video": "C:\\...\\lesson.mp4"}
    {"ok": false, "error": "Traceback ..."}
Exit code 0 on success, non-zero on failure.
"""

from __future__ import annotations

import argparse
import json
import traceback
from pathlib import Path


def render(code_file: str, out_dir: str, quality: str = "medium_quality") -> str:
    """Execute the generated code, render Lesson(), return the MP4 path."""
    import imageio_ffmpeg
    from manim import Scene, config, tempconfig

    config.ffmpeg_executable = imageio_ffmpeg.get_ffmpeg_exe()

    code = Path(code_file).read_text(encoding="utf-8")
    namespace: dict = {}
    exec(compile(code, "<generated_manim>", "exec"), namespace)  # noqa: S102 — sandboxed env

    scene_cls = namespace.get("Lesson")
    if scene_cls is None or not (isinstance(scene_cls, type) and issubclass(scene_cls, Scene)):
        raise ValueError("Generated code must define `class Lesson(Scene)`.")

    Path(out_dir).mkdir(parents=True, exist_ok=True)
    with tempconfig({
        "quality": quality,
        "output_file": "lesson",
        "media_dir": out_dir,
        "disable_caching": True,
        "verbosity": "ERROR",
        "log_to_file": False,
    }):
        scene = scene_cls()
        scene.render()

    # Manim writes to <media_dir>/videos/<scene-module>/<res>/lesson.mp4
    mp4s = sorted(Path(out_dir).rglob("lesson.mp4"), key=lambda p: p.stat().st_mtime)
    if not mp4s:
        raise FileNotFoundError("Manim reported success but no lesson.mp4 was produced.")
    return str(mp4s[-1])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Manim render sidecar")
    ap.add_argument("code_file")
    ap.add_argument("out_dir")
    ap.add_argument("--quality", default="medium_quality")
    args = ap.parse_args(argv)
    try:
        video = render(args.code_file, args.out_dir, args.quality)
        print(json.dumps({"ok": True, "video": video}))
        return 0
    except Exception:  # noqa: BLE001 — report any render failure to the parent
        print(json.dumps({"ok": False, "error": traceback.format_exc()}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
