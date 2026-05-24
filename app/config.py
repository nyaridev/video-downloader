"""Persisted app settings."""

from __future__ import annotations

import json
import locale
import shutil
import sys
from pathlib import Path
from typing import Any

from app.paths import (
    DEFAULT_CHANNEL_FOLDER,
    DEFAULT_PLAYLIST_FOLDER,
    ROOT,
    USER_DIR,
    ensure_user_layout,
    normalize_layout_folder_name,
)
from app.utils.naming import (
    DEFAULT_BUNDLE_FOLDER_TEMPLATE,
    DEFAULT_CHANNEL_NAME_TEMPLATE,
    DEFAULT_FILE_NAME_TEMPLATE,
    DEFAULT_PLAYLIST_NAME_TEMPLATE,
    normalize_name_template,
)

SETTINGS_FILE = USER_DIR / "settings.json"
LEGACY_SETTINGS_FILE = ROOT / "settings.json"

BROWSER_OPTIONS = ("edge", "firefox", "chrome", "brave", "chromium", "opera", "vivaldi")
CHROMIUM_BROWSERS = frozenset({"chrome", "edge", "brave", "chromium", "opera", "vivaldi"})
THEME_OPTIONS = ("default", "meta", "anime", "terminal", "win95")
THEME_MODE_OPTIONS = ("system", "dark", "light")
LANGUAGE_OPTIONS = ("en", "pl", "szl", "cs", "ja", "ko", "zh")

_DEFAULT_BROWSER = "edge" if sys.platform == "win32" else "firefox"

DEFAULTS: dict[str, Any] = {
    "use_browser_cookies": True,
    "cookies_browser": _DEFAULT_BROWSER,
    "cookies_file": "",
    "frameless": True,
    "theme": "default",
    "theme_mode": "system",
    "language": "en",
    "want_video": True,
    "want_audio": True,
    "want_metadata": True,
    "want_thumbnail": True,
    "video_quality": "Best",
    "audio_quality": "Best",
    "output_dir": "",
    "bundle": True,
    "combine_streams": True,
    "save_layout": "flat",
    "group_playlist_channel": True,
    "concurrency": 8,
    "remove_if_cancelled": True,
    "bundle_folder_template": DEFAULT_BUNDLE_FOLDER_TEMPLATE,
    "file_name_template": DEFAULT_FILE_NAME_TEMPLATE,
    "playlist_folder": DEFAULT_PLAYLIST_FOLDER,
    "channel_folder": DEFAULT_CHANNEL_FOLDER,
    "playlist_name_template": DEFAULT_PLAYLIST_NAME_TEMPLATE,
    "channel_name_template": DEFAULT_CHANNEL_NAME_TEMPLATE,
    "deno_source": "path",
    "ffmpeg_source": "path",
}


def normalize_tool_source(value: Any) -> str:
    source = str(value or "path").strip().lower()
    return source if source in ("path", "local") else "path"


SAVE_LAYOUT_OPTIONS = ("flat", "organized", "intelligent")


def normalize_save_layout(value: Any, *, organize: bool | None = None) -> str:
    layout = str(value or "").strip().lower()
    if layout in SAVE_LAYOUT_OPTIONS:
        return layout
    if organize is True:
        return "organized"
    return "flat"


def normalize_theme(value: Any) -> str:
    theme = str(value or "default").strip().lower()
    if theme == "amethyst":
        theme = "default"
    return theme if theme in THEME_OPTIONS else "default"


def normalize_theme_mode(value: Any) -> str:
    mode = str(value or "system").strip().lower()
    return mode if mode in THEME_MODE_OPTIONS else "system"


def normalize_language(value: Any) -> str:
    language = str(value or "en").strip().lower()
    return language if language in LANGUAGE_OPTIONS else "en"


def _locale_tags() -> list[str]:
    tags: list[str] = []
    try:
        if hasattr(locale, "getpreferredlanguages"):
            tags.extend(locale.getpreferredlanguages(False))
    except (locale.Error, ValueError, TypeError, AttributeError):
        pass

    if not tags:
        try:
            code, _encoding = locale.getdefaultlocale()
            if code:
                tags.append(code)
        except (ValueError, AttributeError, TypeError):
            pass
    return tags


def _map_locale_to_language(tag: str) -> str | None:
    normalized = str(tag or "").strip().lower().replace("-", "_")
    if not normalized:
        return None

    base = normalized.split("_")[0]
    if base in LANGUAGE_OPTIONS:
        return base
    return None


def _windows_ui_language() -> str | None:
    if sys.platform != "win32":
        return None
    primary_to_language = {
        0x09: "en",
        0x05: "cs",
        0x11: "ja",
        0x12: "ko",
        0x15: "pl",
        0x04: "zh",
    }
    full_to_language = {
        0x7809: "szl",
    }
    try:
        import ctypes

        lang_id = ctypes.windll.kernel32.GetUserDefaultUILanguage()
        if lang_id in full_to_language:
            return full_to_language[lang_id]
        return primary_to_language.get(lang_id & 0x3FF)
    except Exception:
        return None


def detect_system_language() -> str:
    win_lang = _windows_ui_language()
    if win_lang:
        return win_lang

    for tag in _locale_tags():
        matched = _map_locale_to_language(tag)
        if matched:
            return matched
    return "en"


def normalize_concurrency(value: Any) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        n = 8
    return max(1, min(100, n))


def _legacy_concurrency(data: dict[str, Any]) -> int | None:
    if "concurrency" in data:
        return None
    if not data.get("async_download", True):
        return 1
    try:
        return normalize_concurrency(data.get("batch_count", 8))
    except (TypeError, ValueError):
        return 8


def _migrate_legacy_settings() -> None:
    if SETTINGS_FILE.is_file() or not LEGACY_SETTINGS_FILE.is_file():
        return
    USER_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(LEGACY_SETTINGS_FILE, SETTINGS_FILE)


def load_settings() -> dict[str, Any]:
    ensure_user_layout()
    _migrate_legacy_settings()
    data = dict(DEFAULTS)
    loaded: dict[str, Any] = {}
    if SETTINGS_FILE.is_file():
        try:
            parsed = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            if isinstance(parsed, dict):
                loaded = parsed
                data.update(loaded)
        except (json.JSONDecodeError, OSError):
            pass
    if data.get("cookies_browser") not in BROWSER_OPTIONS:
        data["cookies_browser"] = _DEFAULT_BROWSER
    data["frameless"] = bool(data.get("frameless", True))
    data["theme"] = normalize_theme(data.get("theme"))
    data["theme_mode"] = normalize_theme_mode(data.get("theme_mode"))
    if "language" not in loaded:
        data["language"] = detect_system_language()
    else:
        data["language"] = normalize_language(data.get("language"))
    data["use_browser_cookies"] = bool(data.get("use_browser_cookies", True))
    data["want_video"] = bool(data.get("want_video", True))
    data["want_audio"] = bool(data.get("want_audio", True))
    data["want_metadata"] = bool(data.get("want_metadata", True))
    data["want_thumbnail"] = bool(data.get("want_thumbnail", True))
    data["bundle"] = bool(data.get("bundle", True))
    data["combine_streams"] = bool(data.get("combine_streams", True))
    organize_legacy = bool(data.get("organize", False)) if "save_layout" not in loaded else None
    data["save_layout"] = normalize_save_layout(data.get("save_layout"), organize=organize_legacy)
    data["group_playlist_channel"] = bool(data.get("group_playlist_channel", True))
    data["remove_if_cancelled"] = bool(data.get("remove_if_cancelled", True))
    data["bundle_folder_template"] = normalize_name_template(
        data.get("bundle_folder_template"),
        DEFAULT_BUNDLE_FOLDER_TEMPLATE,
    )
    data["file_name_template"] = normalize_name_template(
        data.get("file_name_template"),
        DEFAULT_FILE_NAME_TEMPLATE,
    )
    data["playlist_folder"] = normalize_layout_folder_name(
        data.get("playlist_folder"),
        DEFAULT_PLAYLIST_FOLDER,
    )
    data["channel_folder"] = normalize_layout_folder_name(
        data.get("channel_folder"),
        DEFAULT_CHANNEL_FOLDER,
    )
    data["playlist_name_template"] = normalize_name_template(
        data.get("playlist_name_template"),
        DEFAULT_PLAYLIST_NAME_TEMPLATE,
    )
    data["channel_name_template"] = normalize_name_template(
        data.get("channel_name_template"),
        DEFAULT_CHANNEL_NAME_TEMPLATE,
    )
    legacy = _legacy_concurrency(data)
    data["concurrency"] = legacy if legacy is not None else normalize_concurrency(data.get("concurrency", 8))
    data["deno_source"] = normalize_tool_source(data.get("deno_source"))
    data["ffmpeg_source"] = normalize_tool_source(data.get("ffmpeg_source"))
    return data


def save_settings(updates: dict[str, Any]) -> dict[str, Any]:
    data = load_settings()
    data.update(updates)
    USER_DIR.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data
