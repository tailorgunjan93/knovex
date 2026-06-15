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

# Complex-script languages → fonts that cover them, in preference order (mixing
# Windows / macOS / Linux + Noto names; the first one actually installed wins).
# Manim's Text() default font does NOT fall back per-glyph, so without setting a
# covering font as the default, non-Latin text renders as .notdef tofu boxes.
# Latin/Cyrillic/Greek languages are omitted — the default font already covers
# them. Keys are the native names the app sends, plus lowercase English aliases.
_DEVANAGARI = ["Nirmala UI", "Noto Sans Devanagari", "Mangal", "Kohinoor Devanagari", "Nirmala Text"]
_JAPANESE   = ["Yu Gothic", "Meiryo", "MS Gothic", "Noto Sans CJK JP", "Hiragino Sans", "Microsoft YaHei"]
_CHINESE    = ["Microsoft YaHei", "SimSun", "Noto Sans CJK SC", "PingFang SC", "Source Han Sans SC"]
_KOREAN     = ["Malgun Gothic", "Noto Sans CJK KR", "Apple SD Gothic Neo", "Microsoft YaHei"]
_ARABIC     = ["Tahoma", "Segoe UI", "Arial", "Noto Sans Arabic", "Geeza Pro"]

_FONT_CANDIDATES: dict[str, list[str]] = {
    "हिन्दी": _DEVANAGARI, "hindi": _DEVANAGARI,
    "日本語": _JAPANESE,   "japanese": _JAPANESE,
    "中文":   _CHINESE,    "chinese": _CHINESE,
    "한국어": _KOREAN,     "korean": _KOREAN,
    "العربية": _ARABIC,    "arabic": _ARABIC,
}


def _pick_font(language: str | None, available: list[str]) -> str | None:
    """First installed font that covers *language*'s script, or None (use default).

    Pure + side-effect free so it can be unit-tested without Manim installed.
    """
    cands = _FONT_CANDIDATES.get((language or "").strip()) \
        or _FONT_CANDIDATES.get((language or "").strip().lower())
    if not cands:
        return None
    have = set(available)
    return next((c for c in cands if c in have), None)


def render(code_file: str, out_dir: str, quality: str = "medium_quality",
           language: str = "English") -> str:
    """Execute the generated code, render Lesson(), return the MP4 path."""
    import imageio_ffmpeg
    import manimpango
    from manim import Scene, Text, config, tempconfig

    config.ffmpeg_executable = imageio_ffmpeg.get_ffmpeg_exe()

    # The generated code writes Text("…") in the lesson's language WITHOUT a font,
    # and Manim's default font won't fall back to a script-covering one. Set a
    # covering font as the Text default so non-Latin lessons render real glyphs.
    font = _pick_font(language, manimpango.list_fonts())
    if font:
        Text.set_default(font=font)

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
    ap.add_argument("--lang", default="English")
    args = ap.parse_args(argv)
    try:
        video = render(args.code_file, args.out_dir, args.quality, args.lang)
        print(json.dumps({"ok": True, "video": video}))
        return 0
    except Exception:  # noqa: BLE001 — report any render failure to the parent
        print(json.dumps({"ok": False, "error": traceback.format_exc()}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
