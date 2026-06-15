"""
Manim render sidecar — font selection.

`_pick_font` decides which installed font to set as the Text default so non-Latin
on-screen text renders real glyphs instead of .notdef tofu boxes. It is pure (no
Manim import), so the script→font mapping is unit-tested here; the actual render
is exercised manually against the provisioned Cinematic env.
"""

from __future__ import annotations

from backend.core.manim_sidecar import _pick_font

# A realistic Windows font set (what manimpango.list_fonts() returns in the env).
_WIN_FONTS = ["Arial", "Calibri", "Segoe UI", "Tahoma", "Nirmala UI", "Nirmala Text",
              "Yu Gothic", "MS Gothic", "Microsoft YaHei", "SimSun", "Malgun Gothic"]


class TestPickFont:
    def test_hindi_native_name_picks_devanagari_font(self):
        assert _pick_font("हिन्दी", _WIN_FONTS) == "Nirmala UI"

    def test_hindi_english_alias(self):
        assert _pick_font("Hindi", _WIN_FONTS) == "Nirmala UI"

    def test_respects_preference_order(self):
        # Nirmala UI absent → next available candidate wins.
        fonts = [f for f in _WIN_FONTS if f != "Nirmala UI"]
        assert _pick_font("हिन्दी", fonts) == "Mangal" or _pick_font("हिन्दी", fonts) == "Nirmala Text"

    def test_japanese_chinese_korean_arabic(self):
        assert _pick_font("日本語", _WIN_FONTS) == "Yu Gothic"
        assert _pick_font("中文", _WIN_FONTS) == "Microsoft YaHei"
        assert _pick_font("한국어", _WIN_FONTS) == "Malgun Gothic"
        assert _pick_font("العربية", _WIN_FONTS) == "Tahoma"

    def test_latin_languages_use_default(self):
        # Latin/Cyrillic/Greek are covered by the default font → no override.
        for lang in ["English", "Español", "Français", "Deutsch", "Русский", ""]:
            assert _pick_font(lang, _WIN_FONTS) is None

    def test_no_covering_font_installed_returns_none(self):
        # A script with none of its candidate fonts present → fall back to default.
        assert _pick_font("हिन्दी", ["Arial", "Calibri"]) is None

    def test_none_language(self):
        assert _pick_font(None, _WIN_FONTS) is None
