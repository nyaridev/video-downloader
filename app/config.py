"""Persisted app settings."""

from __future__ import annotations

import json
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

_DEFAULT_BROWSER = "edge" if sys.platform == "win32" else "firefox"

DEFAULTS: dict[str, Any] = {
    "use_browser_cookies": True,
    "cookies_browser": _DEFAULT_BROWSER,
    "cookies_file": "",
    "frameless": True,
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
